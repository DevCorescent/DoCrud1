/**
 * Standalone-worker environment bootstrapping.
 *
 *   npx tsx scripts/worker-env.selftest.ts
 *
 * A script run outside `next start` inherits none of the `.env*` resolution the
 * server performs. The scraper worker therefore has to load it itself, and
 * getting that subtly wrong is worse than not doing it at all: a worker that
 * silently reads a different file scrapes a different set of boards, or writes
 * to a different database, and reports success either way.
 *
 * No database connection and no scrape: this exercises the loader against
 * fixture directories and asserts the ORDERING contract in the worker's source.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

/** A throwaway project directory holding the given .env* files. */
function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'docrud-env-'));
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), body, 'utf8');
  }
  return dir;
}

/* The loader is module-stateful (idempotent by design), and `loadEnvConfig`
   caches per process, so each case runs in a FRESH module registry. */
async function freshLoader() {
  const mod = await import(`./load-env?case=${Math.random()}`);
  return mod as typeof import('./load-env');
}

async function precedence() {
  console.log('\n── 1. The worker resolves .env* exactly as Next.js does ──');

  const dir = fixture({
    '.env': 'MONGODB_URI=from-dotenv\nGREENHOUSE_BOARDS=base|Base\nONLY_IN_BASE=yes\n',
    '.env.local': 'MONGODB_URI=from-dotenv-local\n',
  });

  for (const k of ['MONGODB_URI', 'GREENHOUSE_BOARDS', 'ONLY_IN_BASE']) delete process.env[k];

  const { loadAppEnvOrThrow } = await freshLoader();
  const out = loadAppEnvOrThrow(
    { required: ['MONGODB_URI'], anyOf: ['GREENHOUSE_BOARDS'] },
    dir,
  );

  /* The headline behaviour: .env.local WINS. A loader that read only `.env`
     would hand the worker a different database from the one the app uses and
     nothing downstream would notice. */
  check('.env.local overrides .env', process.env.MONGODB_URI === 'from-dotenv-local',
    `got ${process.env.MONGODB_URI}`);
  check('values present only in .env are still applied',
    process.env.ONLY_IN_BASE === 'yes');
  check('the loader reports which files it applied', out.loadedFiles.length >= 1);
  check('and reports no missing names when configuration is complete',
    out.missing.length === 0);

  for (const k of ['MONGODB_URI', 'GREENHOUSE_BOARDS', 'ONLY_IN_BASE']) delete process.env[k];
}

async function refusesIncomplete() {
  console.log('\n── 2. Missing configuration fails loudly, and names no values ──');

  const dir = fixture({ '.env': 'SOMETHING_ELSE=1\n' });
  delete process.env.MONGODB_URI;
  const boards = ['GREENHOUSE_BOARDS', 'LEVER_COMPANIES', 'SMARTRECRUITERS_COMPANIES'];
  const saved: Record<string, string | undefined> = {};
  for (const k of boards) { saved[k] = process.env[k]; delete process.env[k]; }

  const { loadAppEnvOrThrow } = await freshLoader();
  let message = '';
  try {
    loadAppEnvOrThrow({ required: ['MONGODB_URI'], anyOf: boards }, dir);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  /* Silence here is the dangerous outcome: an unconfigured worker does not
     crash, it runs and reports a successful scrape of nothing. */
  check('an absent MONGODB_URI throws rather than running unconfigured',
    message.includes('MONGODB_URI'));
  check('an absent board list is also refused',
    message.includes('one of ['));
  check('the error names variables, never their values',
    !message.includes('SOMETHING_ELSE=1') && !message.includes('from-dotenv'));
  check('and it says where it looked, so a wrong WorkingDirectory is obvious',
    message.includes('Loaded env files') && message.includes('working directory'));

  for (const k of boards) if (saved[k] !== undefined) process.env[k] = saved[k];
}

async function idempotent() {
  console.log('\n── 3. Loading twice changes nothing ──');
  const dir = fixture({ '.env': 'MONGODB_URI=once\n' });
  delete process.env.MONGODB_URI;
  const { loadAppEnv } = await freshLoader();
  loadAppEnv(dir);
  const first = process.env.MONGODB_URI;
  check('a second call is a no-op', (loadAppEnv(dir), process.env.MONGODB_URI === first));
  delete process.env.MONGODB_URI;
}

function ordering() {
  console.log('\n── 4. The worker loads env BEFORE anything reads it ──');
  const worker = read('scripts/run-job-scraper.ts');

  /* Static imports are hoisted, so a static import of the lease would run
     before main() ever calls the loader. The lease and the ingestion pipeline
     must therefore be dynamic imports. */
  check('the lease is imported dynamically, after the env load',
    /await import\('@\/lib\/server\/job-sources\/run-lock'\)/.test(worker));
  check('the ingestion pipeline is imported dynamically too',
    /await import\('@\/lib\/server\/job-sources\/run-ingestion'\)/.test(worker));
  check('there is no static import of any @/lib module',
    !/^import\s[^\n]*from\s+'@\/lib/m.test(worker));
  check('the env load happens before the lease is acquired',
    worker.indexOf('loadAppEnvOrThrow(') < worker.indexOf('acquireScraperLease('));
  check('MONGODB_URI is required rather than assumed',
    /required: \['MONGODB_URI'\]/.test(worker));
  check('the worker logs which env files loaded, but never a value',
    /event: 'env'/.test(worker) && !/process\.env\.MONGODB_URI/.test(worker));
}

function systemdParity() {
  console.log('\n── 5. systemd gives the worker the same configuration, safely ──');
  const svc = read('ops/systemd/docrud-job-scraper.service');

  /* The .env this project ships is not systemd-parseable: it carries inline
     comments and prose lines. Pointing EnvironmentFile at it would fail the
     unit or truncate a value at a `#`. */
  check('the unit does NOT hand the app .env to systemd\'s parser',
    !/^EnvironmentFile=.*\.env\s*$/m.test(svc));
  check('NODE_ENV is set, since it selects which .env files load',
    /^Environment=NODE_ENV=production$/m.test(svc));
  check('WorkingDirectory is the repo root that loadEnvConfig resolves against',
    /^WorkingDirectory=\/home\/ubuntu\/docrud$/m.test(svc));
  check('no secret literal appears in the unit',
    !/(MONGODB_URI|CRON_SECRET|GROQ_API_KEY|R2_SECRET_ACCESS_KEY|SMTP_PASSWORD)=/.test(svc));

  /* The loader is what replaced EnvironmentFile, so the unit must explain it —
     otherwise the next operator "fixes" the missing line and reintroduces it. */
  check('the unit explains why EnvironmentFile is absent',
    svc.includes('loadEnvConfig') || svc.includes('scripts/load-env.ts'));
}

async function main() {
  await precedence();
  await refusesIncomplete();
  await idempotent();
  ordering();
  systemdParity();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
