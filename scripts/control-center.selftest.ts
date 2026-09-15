/**
 * Phase 8.4 — the Super Admin Jobs Control Center, as a composition.
 *
 *   npx tsx scripts/control-center.selftest.ts
 *
 * ═══ WHAT THIS FILE IS FOR ═══
 *
 * The four control-center areas were not built here. They were built across
 * Phases 0 and 8.1-8.3 and they already sit together in the admin panel. What
 * was missing is a guard that holds the COMPOSITION together: every one of
 * these properties was established by a separate phase, and each is easy to
 * undo from a distance without any single phase's own tests noticing.
 *
 *   Jobs            Phase 0   cheap counts, failure != zero, retry
 *   Applications    Phase 7/8 exact counts, one grouped read, no PII
 *   Companies       Phase 8.2/8.3  operator metadata, server-owned provenance
 *   Scraper/Source  Phase 6A-fix   enabled vs verified, unknown != zero
 *
 * MEASURED with the live corpus:
 *
 *   jobs overview     5,850 ms   0.17 MB   500 rows
 *   scraper status      643 ms
 *   enabled 2 · verified 87 · verified-not-enabled 85
 *   curated companies 5 · logo overrides 7
 *
 * No database and no network here: the composition is asserted over the source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
/* Comments frequently QUOTE the defects they describe, so structural checks
   run against code only. */
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

function areasAreReachable() {
  console.log('\n── 1. All four areas exist and are grouped together ──');
  const panel = read('components/SuperAdminPanel.tsx');

  check('the Jobs area is mounted', panel.includes('<JobsTab'));
  check('the Companies area is mounted', panel.includes('<CompanyExplorerTab'));
  /* Adjacency is the discoverability property: an operator managing jobs
     should not have to hunt a 25-tab sidebar for the company controls that
     fix a missing logo on those same jobs. */
  const jobsAt = panel.indexOf("id: 'jobs'");
  const coAt = panel.indexOf("id: 'company-explorer'");
  check('both are registered in the navigation', jobsAt > 0 && coAt > 0);
  check('they sit next to each other in one group',
    Math.abs(panel.slice(Math.min(jobsAt, coAt), Math.max(jobsAt, coAt)).split('group:').length - 1) === 0);

  const jobs = read('components/superadmin/JobsTab.tsx');
  check('application analytics live inside the Jobs area', jobs.includes('activeApplicants'));
  check('scraper/source status lives inside the Jobs area', jobs.includes('verifiedCount'));
}

function phase0Holds() {
  console.log('\n── 2. Phase 0: cheap reads, and failure is not zero ──');
  const imp = read('lib/server/job-import.ts');
  const overview = imp.slice(imp.indexOf('export async function getJobAdminOverview'));
  const body = code(overview.slice(0, overview.indexOf('\n}\n')));

  /* The regression that would reinstate a 229 s / 20.2 MB read and, with it,
     the incident where 7,105 jobs displayed as TOTAL 0. */
  check('the overview never loads the whole corpus', !body.includes('getHiringJobs()'));
  check('counts come from an aggregation', body.includes('selectJobAdminCounts'));
  check('rows come from a bounded, projected query', body.includes('selectJobAdminPage'));
  check('an unreadable corpus throws rather than returning zeros',
    /if \(!counts \|\| !rows\) throw new Error/.test(body));

  const ui = code(read('components/superadmin/JobsTab.tsx'));
  check('unknown counters render an em dash, not 0', ui.includes("value === null ? '—'"));
  for (const c of ['total', 'published', 'scraped']) {
    check(`${c} passes null rather than 0 when unloaded`, ui.includes(`stats?.${c} ?? null`));
  }
  check('a failed load is reported', ui.includes('setStatsErr'));
  check('and offers a retry', ui.includes('Retry'));
}

function applicationsHold() {
  console.log('\n── 3. Applications: exact, grouped, private ──');
  const imp = read('lib/server/job-import.ts');
  const overview = imp.slice(imp.indexOf('export async function getJobAdminOverview'));

  /* ONE grouped read for the page. Per-row counting would re-read the entire
     application store once per row. */
  check('counts are fetched once, above the row map',
    overview.indexOf('getApplicationCountsForJobs') < overview.indexOf('rows.map'));
  check('and not inside it',
    !/rows\.map\([\s\S]{0,400}getApplicationCountsForJobs/.test(overview));
  check('counts key on canonical job id',
    overview.includes('applications.get(String(j.id))'));

  const counts = read('lib/server/job-applications/counts.ts');
  check('Apps INCLUDES withdrawn', counts.includes('cur.total += 1;'));
  check('Active EXCLUDES withdrawn',
    /if \(app\.status === 'withdrawn'\) cur\.withdrawn \+= 1;\s*\n\s*else cur\.active \+= 1;/.test(counts));
  check('a storage failure cannot become zero', counts.includes('readJsonFileStrict'));

  for (const pii of ['candidateEmail', 'candidateName', 'candidateUserId', 'resumeText', 'coverLetter']) {
    check(`${pii} never reaches the admin table`, !overview.includes(pii));
  }
}

function companiesHold() {
  console.log('\n── 4. Companies: one identity, operator-owned facts ──');
  const lib = read('lib/company-explorer.ts');
  const route = read('app/api/super-admin/company-explorer/route.ts');

  check('identity remains logoKey, shared system-wide', lib.includes('logoKey('));
  /* A second company model would split identity across two stores. */
  check('no parallel company collection was introduced',
    !code(lib).includes('hiring_companies') && !code(route).includes('hiring_companies'));
  check('industry is capped at 80', lib.includes('text(e.industry, 80)'));
  check('headquarters is capped at 120', lib.includes('text(e.headquarters, 120)'));
  check('provenance is server-owned', route.includes('metadataUpdatedBy: session.email'));
  check('provenance only moves when a value changes', route.includes('priorMeta'));
  check('the write is an explicit allow-list, never a spread',
    !/items\.push\(\{\s*\.\.\.e/.test(route));

  /* Phase 4's conclusion: no source reports headcount, so no field invites a
     guess. */
  for (const banned of ['employeeCount', 'sizeBand', 'headcount']) {
    check(`${banned} is still not a field`, !code(lib).includes(banned));
  }
}

function sourcesHold() {
  console.log('\n── 5. Sources: enabled and verified stay distinct ──');
  const client = read('lib/server/scraper-client.ts');
  const ui = read('components/superadmin/JobsTab.tsx');

  check('enabled comes from the environment-driven registry',
    client.includes('sourceNames: enabled.map((s) => s.name)'));
  check('verified comes from the inventory', client.includes('summariseInventory'));
  check('the tile says "Enabled", not "Approved"', ui.includes('Enabled sources'));
  check('the verified total is shown beside it', ui.includes('verifiedCount'));
  /* An unreadable inventory must not claim nothing was ever verified. */
  check('an unreadable inventory renders nothing rather than a zero',
    ui.includes('scraper.verifiedCount !== null &&'));
  check('boards that are verified but off are named', ui.includes('not enabled'));
}

function authorizationHolds() {
  console.log('\n── 6. Every control-center mutation is Super Admin gated ──');

  /* Each of these can change what the platform serves — the job corpus, a
     company's public identity, a company's logo, or a scraper run. A UI
     composition phase is exactly when an authorization check gets "temporarily"
     relaxed to make a panel easier to wire, so each one is asserted by name
     rather than assumed from the directory it sits in. */
  const surfaces: Array<[string, string]> = [
    ['jobs admin', 'app/api/super-admin/jobs/route.ts'],
    ['company metadata', 'app/api/super-admin/company-explorer/route.ts'],
    ['company logo upload', 'app/api/super-admin/company-logo/route.ts'],
    ['scraper run', 'app/api/super-admin/jobs/scraper/run/route.ts'],
    ['scraper run status', 'app/api/super-admin/jobs/scraper/runs/[runId]/route.ts'],
  ];

  for (const [label, file] of surfaces) {
    const src = read(file);
    check(`${label}: the session is checked`,
      src.includes('getSuperAdminSessionFromRequest'));
    check(`${label}: an invalid session is refused with 401`,
      /if \(!session\.valid\) return NextResponse\.json\(\s*\{ error: 'Unauthorized' \}, \{ status: 401 \}/.test(src)
      || /!session\.valid[\s\S]{0,120}status: 401/.test(src));

    /* The check must come FIRST. An auth check that runs after the work has
       begun is not an authorization boundary. */
    const authAt = src.indexOf('getSuperAdminSessionFromRequest');
    const firstWork = Math.min(
      ...['await req.json(', 'getJobAdminOverview(', 'saveHomepageConfig(',
        'uploadToR2(', 'dispatchScraperRun(', 'getIngestionRun(']
        .map((m) => { const i = src.indexOf(m); return i === -1 ? Number.MAX_SAFE_INTEGER : i; }),
    );
    check(`${label}: authorization precedes any work`,
      firstWork === Number.MAX_SAFE_INTEGER || authAt < firstWork);
  }

  /* Authorization must never be a client-side decision. */
  const panel = code(read('components/SuperAdminPanel.tsx'));
  check('no route is gated only in the browser',
    !/isSuperAdmin\s*&&\s*fetch\(/.test(panel));
}

function publicUnchanged() {
  console.log('\n── 7. Nothing public was changed by the admin work ──');
  const card = read('components/jobs/JobSummaryCard.tsx');

  /* The card's only sanctioned change across Phase 8 is the logo it now
     receives. Its geometry must remain independent of content. */
  check('the logo box keeps fixed dimensions',
    /const box = 'h-10 w-10[^']*sm:h-12 sm:w-12'/.test(card));
  check('the title still clamps to two lines', card.includes('line-clamp-2'));
  check('a broken image still falls back to initials', card.includes('onError={() => setFailed(true)}'));
  check('admin logo precedence is intact', card.includes('overrideUrl={job.companyLogoUrl}'));

  /* Company metadata is an ADMIN fact. It must not have leaked into the public
     payload as a side effect of the admin work. */
  const publicRoute = code(read('app/api/jobs/public/route.ts'));
  check('industry does not enter the public job payload', !publicRoute.includes('industry'));
  check('headquarters does not enter the public job payload', !publicRoute.includes('headquarters'));
  check('no applicant count is exposed publicly',
    !publicRoute.includes('applications') && !publicRoute.includes('activeApplicants'));
}

function safetyGates() {
  console.log('\n── 8. Nothing was enabled ──');
  const example = read('.env.example');
  check('the incremental flag is still off by default',
    /INGEST_INCREMENTAL_LOOKUP=\s*$/m.test(example));
  check('the 87 boards are not written into .env.example',
    !example.includes('cockroachlabs') && !example.includes('clickhouse'));
  /* 4,646 jobs would expire if freshness were ACTIVE while the scraper is not
     refreshing them. Phase 6B wired the clause, deliberately, behind
     PUBLIC_FRESHNESS_ENABLED === "true" (default OFF) — so the guard is no
     longer "the query never mentions lastSeenAt" but "it only does so behind
     the switch, and the base definition of active is untouched". This guard
     fired when 6B landed, which is what it is for. */
  const pq = code(read('lib/server/db/public-jobs-query.ts'));
  check('the freshness clause is gated on the flag, not applied unconditionally',
    /if \(publicFreshnessEnabled\(\)\) \{\s*conds\.push\(publiclyFreshCond\(/.test(pq));
  check('the base active definition has no freshness in it',
    !/const activeCond[\s\S]{0,300}lastSeenAt/.test(pq));
}

function main() {
  areasAreReachable();
  phase0Holds();
  applicationsHold();
  companiesHold();
  sourcesHold();
  authorizationHolds();
  publicUnchanged();
  safetyGates();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
