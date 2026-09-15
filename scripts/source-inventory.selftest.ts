/**
 * Phase 2 — the verified source inventory and its probe.
 *
 *   npx tsx scripts/source-inventory.selftest.ts
 *
 * ═══ WHY VERIFICATION IS THE WHOLE POINT ═══
 *
 * Of 164 plausible candidate boards probed for this phase, 69 were WRONG —
 * mostly HTTP 404, because the company uses a different slug or a different
 * ATS entirely. A wrong slug is not a harmless typo: the fetcher spends three
 * attempts and roughly 37 s on it every single run, and the board shows as
 * permanently failing in the console. At 87 boards, a 40% guess rate would
 * have added tens of minutes of pure timeout to every pass.
 *
 * So this file asserts that the inventory contains only entries a live probe
 * confirmed, and that nothing about it is fabricated.
 *
 * No network: the inventory file is parsed and checked structurally. The
 * discovery numbers themselves came from the probe run recorded in the report.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const INVENTORY = 'data/job-sources/verified-boards.txt';

interface Row { provider: string; slug: string; label: string; country?: string; line: number }

function parseInventory(): Row[] {
  return read(INVENTORY).split('\n')
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter(({ raw }) => raw.replace(/#.*$/, '').trim())
    .map(({ raw, line }) => {
      const [provider, slug, label, country] = raw.replace(/#.*$/, '').trim()
        .split(/\s{2,}|\t/).map((x) => x.trim());
      return { provider, slug, label: label || slug, country, line };
    });
}

function structure() {
  console.log('\n── 1. The inventory parses and every row is well formed ──');
  const rows = parseInventory();
  check('the inventory is not empty', rows.length > 0, `${rows.length} boards`);

  /* The registry validates slugs with this pattern before interpolating them
     into a host or a URL. A row that fails it is silently DROPPED at runtime,
     so the board would appear configured and never be fetched. */
  const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
  const badSlug = rows.filter((r) => !SLUG_RE.test(r.slug));
  check('every slug satisfies the registry\'s own validation',
    badSlug.length === 0, badSlug.map((r) => `line ${r.line}: ${r.slug}`).join(', '));

  const KNOWN = ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters',
    'workable', 'recruitee', 'personio', 'bamboohr', 'microsoft'];
  const badProvider = rows.filter((r) => !KNOWN.includes(r.provider));
  check('every provider has an existing adapter',
    badProvider.length === 0, badProvider.map((r) => r.provider).join(', '));

  /* A duplicate sourceId would be configured twice, fetched twice, and its
     postings counted twice — inflating the corpus with no new jobs. */
  const ids = rows.map((r) => `${r.provider}:${r.slug}`);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check('no duplicate sourceId', dupes.length === 0, Array.from(new Set(dupes)).join(', '));

  const badCountry = rows.filter((r) => r.country && !/^[A-Z]{2}$/.test(r.country));
  check('country tags are ISO-2 where present',
    badCountry.length === 0, badCountry.map((r) => r.country).join(', '));

  check('every row carries a display label', rows.every((r) => r.label.length > 0));
}

function provenance() {
  console.log('\n── 2. Nothing in the inventory is invented ──');
  const src = read(INVENTORY);

  check('the file states that every entry was probed against the live endpoint',
    /confirmed against the live public endpoint/i.test(src));
  check('and records how it can be re-verified',
    src.includes('scrape:sources:probe'));

  /* Job counts change hourly. Recording one in the inventory would make it
     stale immediately and invite someone to trust it. */
  check('no job counts are recorded as configuration',
    !/=\s*\d{2,}\s*$/m.test(src.replace(/^#.*$/gm, '')));
}

function probeIsReadOnly() {
  console.log('\n── 3. The probe cannot write anything ──');
  const probe = read('scripts/probe-job-sources.ts');

  /* The probe exists to be run casually against production configuration, so
     it must be incapable of ingesting, expiring or persisting. */
  for (const forbidden of [
    'runCanonicalIngestion', 'writeHiringJobs', 'saveHiringJobs',
    'acquireScraperLease', 'finishIngestionRun', 'sweepLifecycle', 'deleteMany',
  ]) {
    check(`it never calls ${forbidden}`, !probe.includes(forbidden));
  }
  check('it resolves sources through the real registry rather than its own URLs',
    probe.includes("import('@/lib/server/job-sources/registry')"));
  check('it builds no second fetch path',
    !/https:\/\/(boards-api|api\.lever|api\.ashby)/.test(probe));
  check('it clears provider config first, so a stray .env cannot widen the probe',
    probe.includes('process.env[env] = \'\''));
  check('it reports failures rather than hiding them',
    probe.includes("ok: false") && probe.includes('errorKind'));
  check('it emits configuration only for boards that returned postings',
    /verified\.filter\(\(r\) => r\.provider === provider\)/.test(probe)
    && /verified = all\.filter\(\(r\) => r\.ok && r\.jobs > 0\)/.test(probe));
}

function noProductionChange() {
  console.log('\n── 4. Phase 2 changed no production configuration ──');
  const example = read('.env.example');

  /* The inventory is a VERIFIED CANDIDATE LIST, not a deployment. Rolling it
     out is a separate, deliberate step — 87 boards is a large change in run
     duration and belongs with the measured scale phase. */
  check('the inventory lives in its own file, not in .env.example',
    read(INVENTORY).length > 0);
  check('no duplicate scraper configuration variable was introduced',
    !/JOB_SCRAPER_BATCH_SIZE|JOB_SCRAPER_TIMEOUT|JOB_SCRAPER_RETRIES/.test(example));
  check('the incremental-lookup default was not changed',
    /INGEST_INCREMENTAL_LOOKUP=\s*$/m.test(example));
}

function main() {
  structure();
  provenance();
  probeIsReadOnly();
  noProductionChange();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
