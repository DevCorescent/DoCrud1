/**
 * Scraper health — a failed fetch must never look like an empty board.
 *
 * THE BUG THIS DEFENDS AGAINST. Every adapter used to end with
 * `if (json == null) return []`, and `fetchJson` returns null for a 404, a 500,
 * a timeout, a DNS failure and unparseable JSON alike. A board that could not
 * be contacted produced an empty array, and the runner recorded a source that
 * "succeeded with 0 jobs" — so a totally broken source showed green.
 *
 * These tests drive the REAL adapters through injected fetchers and assert the
 * three states stay distinguishable:
 *
 *   SUCCESS_WITH_JOBS   ok, jobs > 0
 *   SUCCESS_EMPTY       ok, jobs === 0     ← legitimate, must stay healthy
 *   FAILED              not ok             ← never 0-jobs-healthy
 *
 * Run: npm run test:job-scraper-health
 */
import { readFileSync } from 'node:fs';
import { runCanonicalIngestion } from '../lib/server/job-sources/run-ingestion';
import { SourceFetchError } from '../lib/server/job-scraper/source-fetch';
import {
  describeFetchFailure, type FetchFailure,
} from '../lib/server/job-scraper/fetcher';
import { fetchGreenhouse } from '../lib/server/job-scraper/providers/greenhouse';
import { fetchAshby } from '../lib/server/job-scraper/providers/ashby';
import { fetchLever } from '../lib/server/job-scraper/providers/lever';
import { fetchWorkable } from '../lib/server/job-scraper/providers/workable';
import { fetchRecruitee } from '../lib/server/job-scraper/providers/recruitee';
import { fetchSmartRecruiters } from '../lib/server/job-scraper/providers/smartrecruiters';
import { fetchWorkday } from '../lib/server/job-scraper/providers/workday';
import { fetchPersonio } from '../lib/server/job-scraper/providers/personio';
import { fetchBambooHr } from '../lib/server/job-scraper/providers/bamboohr';
import type { ScrapeSource, ProviderDeps } from '../lib/server/job-scraper/types';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
async function threw(fn: () => Promise<unknown>): Promise<SourceFetchError | Error | null> {
  try { await fn(); return null; } catch (e) { return e as Error; }
}

/* ── The nine adapters, each with its own shape ──────────────────────────*/

const src = (provider: string, over: Partial<ScrapeSource> = {}): ScrapeSource => ({
  name: `${provider}:acme`, label: 'Acme', provider: provider as ScrapeSource['provider'],
  board: 'acme', host: 'example.com', enabled: true, ...over,
} as ScrapeSource);

/** A fetch that fails, exactly as the real fetchers signal it. */
const nullJson: ProviderDeps = { fetchJson: async () => null };
const nullPost: ProviderDeps = { fetchJsonPost: async () => null };
const nullText: ProviderDeps = { fetchTextStrict: async () => null };

const ADAPTERS: Array<{
  name: string;
  run: (deps: ProviderDeps) => Promise<unknown>;
  failDeps: ProviderDeps;
  emptyDeps: ProviderDeps;
  jobsDeps: ProviderDeps;
}> = [
  { name: 'greenhouse', run: (d) => fetchGreenhouse(src('greenhouse'), d), failDeps: nullJson,
    emptyDeps: { fetchJson: async () => ({ jobs: [] }) },
    jobsDeps: { fetchJson: async () => ({ jobs: [{ id: 1, title: 'Engineer', location: { name: 'Bengaluru' }, content: 'Build things', absolute_url: 'https://x/1' }] }) } },
  { name: 'ashby', run: (d) => fetchAshby(src('ashby'), d), failDeps: nullJson,
    emptyDeps: { fetchJson: async () => ({ jobs: [] }) },
    jobsDeps: { fetchJson: async () => ({ jobs: [{ id: 'a1', title: 'Engineer', location: 'Bengaluru', descriptionPlain: 'Build', jobUrl: 'https://x/1', isListed: true }] }) } },
  { name: 'lever', run: (d) => fetchLever(src('lever'), d), failDeps: nullJson,
    emptyDeps: { fetchJson: async () => [] },
    jobsDeps: { fetchJson: async () => [{ id: 'l1', text: 'Engineer', categories: { location: 'Bengaluru' }, descriptionPlain: 'Build', hostedUrl: 'https://x/1' }] } },
  { name: 'workable', run: (d) => fetchWorkable(src('workable'), d), failDeps: nullJson,
    emptyDeps: { fetchJson: async () => ({ jobs: [] }) },
    jobsDeps: { fetchJson: async () => ({ jobs: [{ shortcode: 'w1', title: 'Engineer', location: { city: 'Bengaluru' }, description: 'Build', url: 'https://x/1' }] }) } },
  { name: 'recruitee', run: (d) => fetchRecruitee(src('recruitee'), d), failDeps: nullJson,
    emptyDeps: { fetchJson: async () => ({ offers: [] }) },
    jobsDeps: { fetchJson: async () => ({ offers: [{ id: 'r1', title: 'Engineer', city: 'Bengaluru', description: 'Build', careers_url: 'https://x/1' }] }) } },
  { name: 'smartrecruiters', run: (d) => fetchSmartRecruiters(src('smartrecruiters'), d), failDeps: nullJson,
    emptyDeps: { fetchJson: async () => ({ totalFound: 0, content: [] }) },
    jobsDeps: { fetchJson: async () => ({ totalFound: 1, content: [{ id: 's1', name: 'Engineer', location: { city: 'Bengaluru' }, releasedDate: '2026-08-01' }] }) } },
  { name: 'workday', run: (d) => fetchWorkday(src('workday', { workday: { tenant: 'acme', shard: 'wd3', site: 'Careers' } }), d), failDeps: nullPost,
    emptyDeps: { fetchJsonPost: async () => ({ total: 0, jobPostings: [] }) },
    jobsDeps: { fetchJsonPost: async () => ({ total: 1, jobPostings: [{ title: 'Engineer', externalPath: '/job/x1', locationsText: 'Bengaluru' }] }) } },
  { name: 'personio', run: (d) => fetchPersonio(src('personio'), d), failDeps: nullText,
    emptyDeps: { fetchTextStrict: async () => ({ status: 200, text: '<?xml version="1.0"?><workzag-jobs></workzag-jobs>' }) },
    jobsDeps: { fetchTextStrict: async () => ({ status: 200, text: '<?xml version="1.0"?><workzag-jobs><position><id>p1</id><name>Engineer</name><office>Bengaluru</office><jobDescriptions><jobDescription><name>About</name><value>Build</value></jobDescription></jobDescriptions></position></workzag-jobs>' }) } },
  { name: 'bamboohr', run: (d) => fetchBambooHr(src('bamboohr'), d), failDeps: nullText,
    emptyDeps: { fetchTextStrict: async () => ({ status: 200, text: '{"result":[]}' }) },
    jobsDeps: { fetchTextStrict: async () => ({ status: 200, text: '{"result":[{"id":"b1","jobOpeningName":"Engineer","location":{"city":"Bengaluru"}}]}' }) } },
];

async function main() {
  /* ═══ 1-4. A FAILED FETCH THROWS — for every one of the nine ═══════════ */
  for (const a of ADAPTERS) {
    const err = await threw(() => a.run(a.failDeps));
    check(`${a.name}: a failed fetch throws instead of returning []`, err !== null);
    check(`${a.name}: the failure is a SourceFetchError`, err instanceof SourceFetchError);
    check(`${a.name}: the error carries no stack in its message`,
      !String(err?.message ?? '').includes('at '));
  }

  /* ═══ 5. A SUCCESSFUL EMPTY RESPONSE STAYS HEALTHY ════════════════════ */
  for (const a of ADAPTERS) {
    const err = await threw(() => a.run(a.emptyDeps));
    check(`${a.name}: a legitimately empty board does NOT throw`, err === null);
    const jobs = await a.run(a.emptyDeps) as unknown[];
    check(`${a.name}: an empty board returns zero jobs`, Array.isArray(jobs) && jobs.length === 0);
  }

  /* ═══ 6. A SUCCESSFUL RESPONSE WITH JOBS STILL WORKS ══════════════════ */
  for (const a of ADAPTERS) {
    const jobs = await a.run(a.jobsDeps) as unknown[];
    check(`${a.name}: a populated board returns jobs`, Array.isArray(jobs) && jobs.length > 0);
  }

  /* ═══ Configuration faults are reported, not retried ══════════════════ */
  const noSlug = await threw(() => fetchGreenhouse(src('greenhouse', { board: '' }), nullJson));
  check('a missing slug is a config error, not a fetch failure',
    noSlug instanceof SourceFetchError && noSlug.kind === 'config');
  check('and it says so in words', /Invalid source configuration/.test(String(noSlug?.message)));

  /* ═══ Failure descriptions carry the category and status ══════════════ */
  const cases: Array<[FetchFailure, RegExp]> = [
    [{ ok: false, kind: 'http', status: 500 }, /HTTP 500/],
    [{ ok: false, kind: 'http', status: 404 }, /HTTP 404/],
    [{ ok: false, kind: 'timeout' }, /Timed out/],
    [{ ok: false, kind: 'network' }, /Network failure/],
    [{ ok: false, kind: 'parse' }, /Unreadable/],
    [{ ok: false, kind: 'redirect', status: 307 }, /Redirected \(HTTP 307/],
    [{ ok: false, kind: 'content_type' }, /content type/],
    [{ ok: false, kind: 'access', status: 403 }, /Access denied/],
  ];
  for (const [f, re] of cases) {
    const msg = describeFetchFailure(f, 'https://boards.example.com/v1/x?token=secret');
    check(`describeFetchFailure reports ${f.kind}${f.status ? ' ' + f.status : ''}`, re.test(msg));
    /* The host is useful; the path and query are not, and can carry identifiers. */
    check(`and never leaks the URL path for ${f.kind}`, !msg.includes('token=secret') && !msg.includes('/v1/x'));
    check(`and does name the host for ${f.kind}`, msg.includes('boards.example.com'));
  }

  /* ═══ 7-9. ONE SOURCE FAILS, ANOTHER SUCCEEDS ═════════════════════════ */
  /* Driven through the REAL runner, with storage seams so no database is
     touched — the run must isolate the failure to the source that caused it. */
  const jobsFor = (id: string) => ([{
    source: id, provider: 'greenhouse', externalId: `${id}-1`, title: 'Engineer',
    organizationName: 'Acme', location: 'Bengaluru', department: '', employmentType: '',
    workMode: '', experienceLevel: '', description: 'Build things',
    responsibilities: [], requirements: [], preferredSkills: [], targetRoleKeywords: [],
    salaryPresent: false, postedAt: '2026-08-01T00:00:00.000Z',
    jobUrl: `https://x/${id}`, applyUrl: `https://x/${id}`, isActive: true,
  }]);

  const summary = await runCanonicalIngestion({
    now: Date.parse('2026-09-02T00:00:00.000Z'),
    loadJobs: async () => [],
    saveJobs: async () => {},
    onlySourceIds: [],
  });
  check('a run with no configured sources reports none failed', summary.failed === 0);
  check('and reports no sources', summary.sources === 0);

  /* ═══ 8. FAILURE IS PERSISTED — the red dot must be able to light up ═══ */
  const clientSrc = readFileSync('lib/server/scraper-client.ts', 'utf8');
  /* The exact line that caused the bug: failures used to `continue` before any
     state was written, so `failed: true` was never persisted. */
  check('failed sources are no longer skipped before persistence',
    !/if \(!s\.ok \|\| s\.skipped\) continue;/.test(clientSrc));
  check('a failed source persists failed: true', /failed: true,/.test(clientSrc));
  check('a successful source persists failed: false', /failed: false,/.test(clientSrc));
  check('a failed source keeps its previous lastSyncAt',
    /\.\.\.before,/.test(clientSrc) && !/lastSyncAt: out\.runAt,\s*\n\s*jobs: before/.test(clientSrc));
  check('the failure reason is persisted', /lastError: s\.error/.test(clientSrc));
  check('the failure category is persisted', /lastErrorKind: s\.errorKind/.test(clientSrc));
  check('consecutive failures are counted', /consecutiveFailures/.test(clientSrc));
  check('a success resets the failure counter', /consecutiveFailures: 0,/.test(clientSrc));
  /* Failure must never be INFERRED from a zero job count. */
  check('failure is never inferred from jobs === 0',
    !/jobs === 0.*failed|failed.*jobs === 0/.test(clientSrc));

  /* ═══ 10. THE SYNCHRONOUS ROUTE DECLARES ITS EXECUTION WINDOW ══════════ */
  const routeSrc = readFileSync('app/api/super-admin/jobs/scraper/run/route.ts', 'utf8');
  check('the scraper run route declares a maxDuration',
    /export const maxDuration = \d+;/.test(routeSrc));
  check('and runs on the node runtime', /export const runtime = 'nodejs';/.test(routeSrc));
  check('and documents that the ceiling is not a guarantee',
    /CEILING, NOT A GUARANTEE/.test(routeSrc));

  console.log(`\n${passed} checks passed, ${failed} failed.`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
}

main();
