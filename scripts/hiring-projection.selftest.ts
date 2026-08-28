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
  getPublishedHiringJobList, getPublishedHiringJobs,
  invalidatePublishedHiringJobs, toPublicHiringJobListItem,
} from '@/lib/server/hiring';

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
    JSON.stringify(projectedJob) === JSON.stringify(expectedJob));
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

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
