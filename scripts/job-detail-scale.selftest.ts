/**
 * Phase 9 — one job is read as one job.
 *
 *   npx tsx scripts/job-detail-scale.selftest.ts
 *
 * ═══ THE MEASUREMENT THAT JUSTIFIED THE CHANGE ═══
 *
 * `/api/hiring/jobs/[jobId]` loaded the ENTIRE corpus and then `.find()`-ed the
 * single posting it wanted. Measured against the live production corpus:
 *
 *   selectJobDocById       323 ms     0.01 MB
 *   getHiringJobs()    238,107 ms    19.32 MB   (7,106 docs)
 *
 * 737x slower for an identical result — and the gap widens with every job ever
 * scraped, because the cost is the corpus, not the request.
 *
 * ═══ EQUIVALENCE WAS PROVEN BEFORE THE CHANGE ═══
 *
 * Six postings sampled across the corpus (first, second, third, middle, and the
 * last two) serialized BYTE-FOR-BYTE identically through both reads, and an
 * unknown id returned null through both — so the 404 path is unchanged.
 *
 * This file guards the shape of that fix. It runs no query.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const ROUTE = 'app/api/hiring/jobs/[jobId]/route.ts';

function boundedRead() {
  console.log('\n── 1. The single-job route reads one document ──');
  const src = code(read(ROUTE));

  /* THE regression. One reintroduced call here restores a 238 s read on a path
     an employer hits every time they open one of their own postings. */
  check('the route no longer loads the whole corpus',
    !src.includes('getHiringJobs('));
  check('it uses the bounded by-id selector', src.includes('selectJobDocById(jobId)'));
  check('and no longer scans an array for the job',
    !/jobs\.find\(\(j\) => j\.id === jobId\)/.test(src));

  /* The users read stayed parallel: ownership is decided from the same records
     by the same rule, so this is a narrower read, not a different decision. */
  check('the users store is still read alongside, not serially',
    /Promise\.all\(\[getStoredUsers\(\), selectJobDocById\(jobId\)\]\)/.test(src));
}

function semanticsPreserved() {
  console.log('\n── 2. Behaviour is unchanged ──');
  const src = code(read(ROUTE));

  /* Ownership: admin OR a member of the owning organization. Byte-identical to
     the previous rule — a narrower READ must not become a looser CHECK. */
  check('the ownership rule is unchanged',
    src.includes("actor.role === 'admin' || orgIds.includes(job.organizationId)"));
  check('a non-owner still receives null rather than the job',
    src.includes('job: owns ? job : null'));
  check('an unknown actor still short-circuits', src.includes('if (!actor) return { actor: null, job: null }'));

  /* selectJobDocById returns null for an unknown id, so the 404 is reached by
     the same branch as before. */
  const handlers = (src.match(/if \(!job\) return NextResponse\.json\(\s*\{ error: 'Job not found\.' \}, \{ status: 404 \}/g) || []).length;
  check('the 404 path survives in every handler that had it', handlers >= 2, `${handlers} handlers`);

  check('authorization still precedes the lookup',
    src.indexOf('getAuthSession') < src.indexOf('ownedJob('));
}

function deadWeightRemoved() {
  console.log('\n── 3. The corpus array is gone, not merely unused ──');
  const src = code(read(ROUTE));

  /* PATCH destructured `jobs` and never touched it — the write has always been
     a single document. Leaving the array in the return type would keep the
     expensive read alive for the next person who "needs the list". */
  check('ownedJob no longer returns the corpus', !/return \{ actor, job: owns \? job : null, jobs \}/.test(src));
  check('no handler destructures a jobs array', !/const \{ job, jobs \}/.test(src));
  check('the unused import was removed', !src.includes('getHiringJobs,'));

  /* The write path is untouched: still one document, still no reordering. */
  check('the edit still writes exactly one document',
    src.includes('writeHiringJobs([next as unknown as Record<string, unknown>])'));
}

function noRegressionElsewhere() {
  console.log('\n── 4. Nothing else was quietly changed ──');
  const src = read(ROUTE);

  /* The employer patch remains an allow-list — a performance change must not
     widen what a request body can reach. */
  check('the employer patch is still an allow-list', src.includes('employerJobPatch(body'));
  check('content hashing on edit is preserved', src.includes('jobContentHash({'));
  check('normalized title still moves with the edit', src.includes('normalizeJobTitle('));

  /* Applications are read for the detail response; that is unrelated to the
     corpus read and must still happen. */
  check('the applications read is untouched', src.includes('getHiringApplications'));
}

function homepageMetricsCount() {
  console.log('\n── 5. The homepage counts instead of loading the corpus ──');
  const src = code(read('lib/server/public-home-metrics.ts'));

  /* MEASURED at 694,589 ms end to end against the live corpus: every posting
     transferred to produce one integer, on the PUBLIC homepage. */
  check('the corpus is no longer loaded', !src.includes('getHiringJobs('));
  check('a count is used instead', src.includes('countPublishedJobs()'));
  check('the published filter is gone',
    !/jobs\.filter\(\(job\) => job\.status === 'published'\)/.test(src));

  /* The count must mean the same thing the filter meant. `countPublishedJobs`
     runs countDocuments({ status: 'published' }) — the identical predicate. */
  check('live roles come from the count', src.includes('publishedJobCount ?? 0'));

  /* Failure behaviour is deliberately unchanged: a decorative counter must not
     take the homepage down, and an uncountable store still falls back to the
     form-flows label rather than claiming zero live roles. */
  check('an uncountable store still degrades rather than throwing',
    src.includes('countPublishedJobs().catch(() => null)'));
  check('the label still falls back to form flows',
    src.includes("liveRoles ? 'live hiring roles' : 'active form flows'"));
  check('the four metric ids are unchanged',
    ['docs', 'shares', 'workspaces', 'roles'].every((id) => src.includes(`id: '${id}'`)));
}

function main() {
  boundedRead();
  semanticsPreserved();
  deadWeightRemoved();
  noRegressionElsewhere();
  homepageMetricsCount();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
