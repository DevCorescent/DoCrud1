/**
 * Hiring projection self-test.
 *
 * The projected reads in lib/server/db/hiring-jobs-rows.ts exist only to move
 * fewer bytes. They are worth nothing if they return DIFFERENT data from the
 * full read, so this compares them field by field against
 * getPublishedHiringJobs() — the path they replace — on the real store.
 *
 * Order matters: every projected read is taken BEFORE the full list is loaded,
 * because once the full list is cached the projected helpers legitimately serve
 * from it and would be comparing against themselves.
 */
import {
  getPublishedHiringJobById, getPublishedHiringJobCompanyNames,
  getPublishedHiringJobCount, getPublishedHiringJobList, getPublishedHiringJobs,
  invalidatePublishedHiringJobs, toPublicHiringJobListItem,
} from '@/lib/server/hiring';
import { markHiringJobsCollectionStale } from '@/lib/server/db/hiring-jobs-collection';

/**
 * Order-insensitive deep comparison.
 *
 * Mongo returns a document's fields alphabetically, while the app_state array
 * preserves the order the objects were written in. JSON object key order is not
 * part of any API contract — a client parses by name — so the contract to
 * assert is "same field set, same values", not "same byte sequence".
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value ?? null;
}
const deepEqual = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  invalidatePublishedHiringJobs();

  // Projected reads first, while nothing is cached.
  const projectedList = await getPublishedHiringJobList();
  invalidatePublishedHiringJobs();
  const projectedNames = await getPublishedHiringJobCompanyNames();
  invalidatePublishedHiringJobs();
  const probeId = projectedList[0]?.id ?? '';
  const projectedJob = await getPublishedHiringJobById(probeId);
  const missing = await getPublishedHiringJobById('definitely-not-a-real-job-id');
  invalidatePublishedHiringJobs();
  const projectedCount = await getPublishedHiringJobCount();

  // Now the full read, which is the reference.
  invalidatePublishedHiringJobs();
  const full = await getPublishedHiringJobs();
  const expectedList = full.map(toPublicHiringJobListItem);
  const expectedNames = full.map((j) => j.organizationName ?? '');

  console.log(`\n  (${full.length} published jobs)\n`);

  check('the projected list has the same length as the full read',
    projectedList.length === expectedList.length,
    `${projectedList.length} vs ${expectedList.length}`);
  check('the projected list has the same jobs, in the same order',
    JSON.stringify(projectedList.map((j) => j.id)) === JSON.stringify(expectedList.map((j) => j.id)));

  /* Field-by-field, not a stringify: an absent optional and an explicit
     undefined are the same value to the app but differ as JSON. */
  const fields = Object.keys(expectedList[0] ?? {}) as Array<keyof typeof expectedList[number]>;
  const mismatches: string[] = [];
  for (let i = 0; i < expectedList.length; i += 1) {
    for (const f of fields) {
      const a = JSON.stringify(expectedList[i][f] ?? null);
      const b = JSON.stringify(projectedList[i]?.[f] ?? null);
      if (a !== b) mismatches.push(`${expectedList[i].id}.${String(f)}: ${a} vs ${b}`);
    }
  }
  check('every projected card field matches the full read', mismatches.length === 0,
    mismatches.slice(0, 3).join(' | '));

  check('the projected list carries no description/requirements payload',
    projectedList.every((j) => !('description' in j) && !('requirements' in j)));

  check('company names match the full read exactly',
    JSON.stringify(projectedNames) === JSON.stringify(expectedNames),
    `${projectedNames.length} vs ${expectedNames.length}`);

  const expectedJob = full.find((j) => j.id === probeId) ?? null;
  check('a job fetched by id equals the same job from the full read',
    deepEqual(projectedJob, expectedJob));
  check('a job fetched by id has exactly the same field set (no extras, none missing)',
    JSON.stringify(Object.keys(projectedJob ?? {}).sort())
    === JSON.stringify(Object.keys(expectedJob ?? {}).sort()));
  /* Only meaningful with a populated store. Run without MONGODB_URI (the
     file-backed fallback path) and there are no jobs to probe — that is a
     valid environment, not a failure, so this check is skipped rather than
     asserted against nothing. */
  if (full.length > 0) {
    check('a job fetched by id keeps its full description',
      typeof projectedJob?.description === 'string' && projectedJob.description === expectedJob?.description);
  } else {
    console.log('  – empty store: id/description probe skipped (fallback path)');
  }
  check('an unknown id returns null rather than a wrong job', missing === null);
  check('the published count matches the full read', projectedCount === full.length,
    `${projectedCount} vs ${full.length}`);

  /* ── fallback: mark the replica untrusted and re-read everything ──────────
     An unavailable collection must produce the SAME answers by a slower route,
     never an empty one — the failure mode that would silently empty the feed. */
  markHiringJobsCollectionStale('self-test: forcing the fallback path');
  invalidatePublishedHiringJobs();
  const fbList = await getPublishedHiringJobList();
  invalidatePublishedHiringJobs();
  const fbNames = await getPublishedHiringJobCompanyNames();
  invalidatePublishedHiringJobs();
  const fbCount = await getPublishedHiringJobCount();
  invalidatePublishedHiringJobs();
  const fbJob = await getPublishedHiringJobById(probeId);

  check('fallback list is not empty when the collection is unavailable',
    full.length === 0 || fbList.length > 0);
  check('fallback list is identical to the collection-backed list',
    JSON.stringify(fbList) === JSON.stringify(projectedList),
    `${fbList.length} vs ${projectedList.length}`);
  check('fallback names are identical', JSON.stringify(fbNames) === JSON.stringify(projectedNames));
  check('fallback count is identical', fbCount === projectedCount, `${fbCount} vs ${projectedCount}`);
  check('fallback job-by-id is identical', deepEqual(fbJob, projectedJob));

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
