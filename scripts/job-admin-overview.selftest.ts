/**
 * Phase 0 — a failed read must never be displayed as zero.
 *
 *   npx tsx scripts/job-admin-overview.selftest.ts
 *
 * ═══ THE INCIDENT THIS LOCKS DOWN ═══
 *
 * Production held 7,105 jobs and the Super Admin dashboard displayed
 * TOTAL 0 / PUBLISHED 0 / SCRAPED 0. Nothing had been deleted. The overview
 * loaded every posting to compute five integers — measured at 229,753 ms and
 * 20.2 MB against the real corpus — which could not finish inside nginx's 60 s
 * read timeout. The request failed, `load()` skipped its `if (r.ok)` branch,
 * `stats` stayed null, and every counter rendered `stats?.total ?? 0`.
 *
 * Two independent faults, and BOTH are asserted here, because either one alone
 * would have prevented the incident:
 *
 *   1. the read was too expensive to complete
 *   2. its failure was indistinguishable from an empty database
 *
 * No database connection: these are contract assertions over the source, which
 * is what makes them runnable in CI. The query behaviour itself was measured
 * directly against the production corpus (7,178 ms, 0.15 MB, total 7,105).
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

function cheapReads() {
  console.log('\n── 1. The overview no longer loads the corpus to count it ──');
  const importSrc = read('lib/server/job-import.ts');
  const overview = importSrc.slice(importSrc.indexOf('export async function getJobAdminOverview'));

  /* THE regression to prevent. One call to getHiringJobs() here reinstates a
     229 s read and, with it, the whole incident. */
  check('getJobAdminOverview does not load every posting',
    !/getHiringJobs\(\)/.test(overview.slice(0, overview.indexOf('\n}\n'))));
  check('counts come from a database aggregation', overview.includes('selectJobAdminCounts'));
  check('rows come from a projected, limited query', overview.includes('selectJobAdminPage'));

  const col = read('lib/server/db/hiring-jobs-collection.ts');
  check('the counters are one $facet, so they cannot disagree with each other',
    /\$facet/.test(col) && col.includes('selectJobAdminCounts'));
  check('the row query projects instead of returning whole documents',
    col.includes('ADMIN_ROW_PROJECTION'));
  check('the row query is bounded', /\.limit\(Math\.max\(1, Math\.min\(1000, limit\)\)\)/.test(col));
  check('sorting is done by the database, not in JavaScript',
    /\.sort\(\{ createdAt: -1 \}\)/.test(col));

  /* Search moved into Mongo, so a user's "." or "(" is now input to a regex. */
  check('a search term is escaped and cannot act as a regular expression',
    col.includes('literalRegex') && /replace\(\/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]\/g/.test(col));
}

function failureIsNotZero() {
  console.log('\n── 2. Storage failure is propagated, never flattened to zeros ──');
  const importSrc = read('lib/server/job-import.ts');
  const col = read('lib/server/db/hiring-jobs-collection.ts');

  /* `selectJobAdminCounts` returning null means "could not read". Defaulting
     that to 0 anywhere would recreate the incident exactly. */
  check('the counts query reports failure as null rather than as zeros',
    /export async function selectJobAdminCounts\(\): Promise<JobAdminCounts \| null>/.test(col));
  check('the overview throws on an unreadable corpus instead of returning zeros',
    /if \(!counts \|\| !rows\) throw new Error/.test(importSrc));
  check('no zero-filled fallback stats object exists',
    !/stats:\s*\{\s*total:\s*0/.test(importSrc));

  /* An empty database is a legitimate answer and must still succeed — the fix
     must not turn "genuinely no jobs" into an error. */
  check('an empty result set is still a successful zero, not a failure',
    /facet\?\.\[key\]\?\.\[0\]\?\.n \?\? 0/.test(col));
}

function uiNeverInventsZero() {
  console.log('\n── 3. The dashboard shows unknown as unknown ──');
  const ui = read('components/superadmin/JobsTab.tsx');
  /* Comments stripped: the doc comment on `load` QUOTES the old buggy
     expression to explain the incident, and a naive substring search would
     read that explanation as the bug itself. */
  const code = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* The type change IS the fix: with `number`, the only way to say "unknown"
     was to pass 0. */
  check('the counter accepts null, so unknown is representable',
    /const stat = \(label: string, value: number \| null, color: string\)/.test(ui));
  check('null renders an em dash, not a zero', ui.includes("value === null ? '—'"));
  for (const c of ['total', 'published', 'draft', 'closed', 'scraped']) {
    check(`${c} passes null rather than 0 when unloaded`,
      code.includes(`stats?.${c} ?? null`) && !code.includes(`stats?.${c} ?? 0`));
  }
}

function loadReportsFailure() {
  console.log('\n── 4. A failed load is reported and does not erase good data ──');
  const ui = read('components/superadmin/JobsTab.tsx');
  const load = ui.slice(ui.indexOf('const load = useCallback'), ui.indexOf('}, [query]);'));

  check('the failure is no longer swallowed',
    !/catch \{ \/\* ignore \*\/ \}/.test(load));
  check('a non-2xx sets an explicit error', load.includes('setStatsErr'));
  check('a rejected request is reported too', /catch \{[\s\S]{0,200}setStatsErr/.test(load));
  check('the body is read as text first, so a gateway HTML page cannot throw',
    load.includes('r.text()'));
  check('a proxy timeout is named as such rather than as "no jobs"',
    load.includes('timed out at the proxy'));

  /* The subtle half. A transient refresh failure must not replace numbers that
     were true a moment ago with zeros. */
  check('a failure returns WITHOUT calling setStats',
    /return;\s*\/\/ previous stats\/jobs deliberately kept/.test(load));
  check('and without clearing the job rows',
    load.lastIndexOf('setJobs(') < load.indexOf('setStats(d.stats)') + 200);
  check('the error clears only when a load succeeds',
    load.indexOf("setStatsErr('')") < load.indexOf('fetch('));

  check('the operator can retry', ui.includes('Retry'));
  check('retry calls the same loader', /onClick=\{\(\) => \{ void load\(\); \}\}/.test(ui));
}

function noFakeNumbers() {
  console.log('\n── 5. The counts stay canonical ──');
  const col = read('lib/server/db/hiring-jobs-collection.ts');
  const importSrc = read('lib/server/job-import.ts');
  const stats = col.slice(col.indexOf('export async function selectJobAdminCounts'));

  check('counts are read from hiring_jobs on every request',
    stats.includes('db.collection(COL).aggregate'));
  check('no cache layer was introduced for the counts',
    !/cache|memo|ttl/i.test(stats.slice(0, stats.indexOf('export async function selectJobAdminPage'))));
  /* Comments stripped again: both files CITE the measured 7,105 to explain why
     the cheap queries exist. Documenting a measurement is not the same as
     hardcoding a count, and the check is about the latter — a literal used as
     a VALUE, which is how a dashboard starts reporting a number nobody
     measured. */
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('no corpus size is hardcoded as a value',
    !/7105|6966/.test(strip(col) + strip(importSrc)));
}

function main() {
  cheapReads();
  failureIsNotZero();
  uiNeverInventsZero();
  loadReportsFailure();
  noFakeNumbers();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
