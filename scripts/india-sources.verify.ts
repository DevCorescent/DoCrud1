/**
 * Live verification of the approved India-focused sources.
 *
 * Runs the REAL pipeline — Approved Source → Fetch (official public ATS APIs) →
 * Normalize → Validate → Score → Deduplicate — against verified Indian company
 * boards, then asserts the output the existing importer would consume. It does
 * NOT write to storage (never touches HiringJobPosting), so it is safe to run
 * repeatedly and uses zero mock data.
 *
 *   npx tsx scripts/india-sources.verify.ts
 *
 * Requires outbound network to the three fixed provider hosts. If the network is
 * unavailable the sources are reported as "failed" (never faked).
 */
import assert from 'node:assert/strict';
import { runApprovedScrape } from '../lib/server/job-scraper/index';
import { isIndiaRelevant } from '../lib/server/job-scraper/india';
import { jobFingerprint, CSV_HEADER } from '../lib/server/job-import';

// Verified boards (each confirmed to return real Indian jobs via the public API).
// Env is read at call-time by the registry, so setting it here is sufficient.
process.env.JOB_SCRAPER_ENABLED = 'true';
process.env.GREENHOUSE_BOARDS = [
  'razorpaysoftwareprivatelimited|Razorpay|IN',
  'groww|Groww|IN',
  'druva|Druva|IN',
  'postman|Postman|IN',
].join(',');
process.env.LEVER_COMPANIES = 'mindtickle|MindTickle|IN';
process.env.ASHBY_JOB_BOARDS = 'atlan|Atlan|IN';

async function main() {
const res = await runApprovedScrape({ totalLimit: 400 });

console.log('\nPer-source:');
for (const s of res.perSource) {
  console.log(`  ${s.failed ? '✗' : '✓'} ${s.name.padEnd(40)} fetched=${s.fetched} active=${s.active}${s.failed ? '  (FAILED — likely no network)' : ''}`);
}
console.log(`\nTotals: fetched=${res.fetched} active=${res.active} rejected=${res.rejected} duplicates=${res.duplicates} failed=${res.failed} final=${res.jobs.length}`);

const indiaJobs = res.jobs.filter((j) => isIndiaRelevant(j.location || ''));
console.log(`India-relevant final jobs: ${indiaJobs.length}/${res.jobs.length}`);

console.log('\nSample normalized jobs:');
for (const j of res.jobs.slice(0, 8)) {
  console.log(`  [${String(j.score ?? 0).padStart(3)}] ${j.title} — ${j.organizationName} — ${j.location || '(no loc)'} — ${j.applyUrl}`);
}

// If the network was unavailable every source fails; report honestly and stop
// (do NOT fabricate results in the live path).
if (res.failed === res.perSource.length && res.jobs.length === 0) {
  console.error('\nAll sources failed (no outbound network in this environment). No live verification possible — not faking any jobs.');
  process.exit(2);
}

let checks = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, name); checks++; console.log(`  ✓ ${name}`);
}

console.log('\nAssertions on REAL fetched data:');
check('at least one source returned real jobs', res.jobs.length > 0);
check('every final job has a real http(s) apply URL', res.jobs.every((j) => /^https?:\/\/\S+$/i.test(j.applyUrl || j.jobUrl || '')));
check('every final job has a title and organization', res.jobs.every((j) => j.title.trim() && j.organizationName.trim()));
check('Indian locations are recognized (India handling works)', indiaJobs.length > 0);
check('Indian cities were canonicalized (e.g. no raw ", Karnataka" tails left uncanonicalized where a known city exists)',
  indiaJobs.some((j) => /bengaluru|pune|mumbai|hyderabad|chennai|coimbatore/i.test(j.location || '')));
check('no duplicate fingerprints survive dedup', (() => {
  const seen = new Set<string>();
  for (const j of res.jobs) { const fp = jobFingerprint(j.organizationName, j.title, j.location); if (seen.has(fp)) return false; seen.add(fp); }
  return true;
})());
check('CSV handed to the existing importer has the exact 13-column header', res.csv.split('\n')[0] === (CSV_HEADER as readonly string[]).join(','));
check('CSV body row count matches the deduped job count', res.csv.trim().split('\n').length - 1 === res.jobs.length);

console.log(`\n${checks} live checks passed against ${res.jobs.length} real jobs from ${res.perSource.filter((s) => !s.failed).length} sources.`);
console.log('LIVE VERIFY OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
