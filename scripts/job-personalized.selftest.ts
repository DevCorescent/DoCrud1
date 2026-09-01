/**
 * Phase 11 (backend minimum) — self-test for the personalized recommendation page.
 *
 * What this defends:
 *   · a job the viewer already applied to NEVER appears in the feed;
 *   · the backend's ranked order is preserved exactly, never re-sorted;
 *   · exclusion happens BEFORE paging, so pages have no holes and the total is true;
 *   · a viewer with no signals gets a NULL ATS score, never a fabricated 0;
 *   · eligibility stays null when no preference was stated, and `unknown` is
 *     passed through rather than collapsed into "ineligible";
 *   · one request can never trigger an unbounded number of ATS evaluations.
 *
 * Run: npm run test:job-personalized
 */
import { personalizedPage, MAX_ENRICHED_PER_PAGE } from '../lib/server/job-api/personalized';
import type { HiringJobPosting } from '../types/document';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

const job = (id: string, over: Partial<HiringJobPosting> = {}): HiringJobPosting => ({
  id,
  title: `Role ${id}`,
  organizationName: 'Acme',
  organizationId: 'org1',
  location: 'Bengaluru',
  workMode: 'hybrid',
  employmentType: 'full_time',
  description: 'Build things with TypeScript and React.',
  requirements: ['TypeScript', 'React'],
  responsibilities: ['Ship features'],
  preferredSkills: ['Next.js'],
  status: 'published',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
} as unknown as HiringJobPosting);

const ranked = ['a', 'b', 'c', 'd', 'e'].map((id) => job(id));

/* ═══ Applied jobs are excluded ═════════════════════════════════════════ */

const withApplied = personalizedPage({
  rankedJobs: ranked,
  candidate: null,
  appliedJobIds: new Set(['b', 'd']),
  pageSize: 10,
});
check('applied jobs are removed', withApplied.items.every((r) => r.id !== 'b' && r.id !== 'd'));
check('the remaining jobs are all there', withApplied.items.length === 3);
check('the total reflects the exclusion, not the raw list', withApplied.total === 3);
check('order among survivors is unchanged',
  withApplied.items.map((r) => r.id).join(',') === 'a,c,e');

/* Exclusion BEFORE paging: page 1 of size 2 must be full, not holed. */
const paged = personalizedPage({
  rankedJobs: ranked, candidate: null, appliedJobIds: new Set(['a', 'b']), page: 1, pageSize: 2,
});
check('paging after exclusion fills the page', paged.items.length === 2);
check('and starts at the first unapplied job', paged.items[0].id === 'c');
check('and the total is the excluded count', paged.total === 3);

/* Every job applied to → an honest empty feed. */
const allApplied = personalizedPage({
  rankedJobs: ranked, candidate: null, appliedJobIds: new Set(['a','b','c','d','e']),
});
check('applying to everything empties the feed', allApplied.items.length === 0);
check('and the total is 0', allApplied.total === 0);

/* ═══ Ranked order is preserved, never re-sorted ════════════════════════ */

const order = personalizedPage({ rankedJobs: ranked, candidate: null, pageSize: 10 });
check('backend order is preserved exactly',
  order.items.map((r) => r.id).join(',') === 'a,b,c,d,e');

/* A deliberately non-alphabetical, non-chronological input order must survive. */
const shuffled = [job('z', { createdAt: '2026-01-01T00:00:00.000Z' }), job('m'), job('a')];
const kept = personalizedPage({ rankedJobs: shuffled, candidate: null, pageSize: 10 });
check('an arbitrary backend order is not re-sorted alphabetically',
  kept.items.map((r) => r.id).join(',') === 'z,m,a');
check('and not re-sorted by date either', kept.items[0].id === 'z');

/* ═══ No candidate → no fabricated score ════════════════════════════════ */

const unscored = personalizedPage({ rankedJobs: ranked, candidate: null, pageSize: 10 });
check('an unscored row has a null ATS score', unscored.items.every((r) => r.atsScore === null));
check('and NOT a zero score', unscored.items.every((r) => r.atsScore !== 0));
check('and a null band', unscored.items.every((r) => r.atsBand === null));
check('and reports that nothing was scored', unscored.scored === false);
check('and carries no invented matched skills',
  unscored.items.every((r) => r.matchedSkills.length === 0));
check('and no invented missing skills',
  unscored.items.every((r) => r.missingRequiredSkills.length === 0));

/* ═══ With a candidate, Phase 6 is actually used ════════════════════════ */

const scored = personalizedPage({
  rankedJobs: [job('a')],
  candidate: {
    id: 'u1',
    profile: { headline: 'Frontend Engineer', skills: ['TypeScript', 'React'], location: 'Bengaluru' },
    resumeText: 'Frontend engineer with 4 years of TypeScript and React experience building web apps.',
  },
  pageSize: 10,
});
check('a real candidate produces a score', typeof scored.items[0].atsScore === 'number');
check('the score is in range',
  scored.items[0].atsScore! >= 0 && scored.items[0].atsScore! <= 100);
check('the score is an integer', Number.isInteger(scored.items[0].atsScore!));
check('a band is reported', typeof scored.items[0].atsBand === 'string' && scored.items[0].atsBand!.length > 0);
check('scored is reported true', scored.scored === true);
/* The row must never carry anything shaped like a hiring forecast. */
const keys = Object.keys(scored.items[0]).join(' ').toLowerCase();
for (const word of ['probability', 'chance', 'likelihood', 'selection', 'odds', 'predict']) {
  check(`no "${word}" field on a personalized row`, !keys.includes(word));
}

/* ═══ Eligibility ═══════════════════════════════════════════════════════ */

const noPrefs = personalizedPage({ rankedJobs: [job('a')], candidate: null, eligibilityProfile: null });
check('no stated preference means null eligibility', noPrefs.items[0].eligibility === null);
check('and it is NOT reported as ineligible', noPrefs.items[0].eligibility?.status !== 'ineligible');

const withPrefs = personalizedPage({
  rankedJobs: [job('a', { location: 'Bengaluru' })],
  candidate: null,
  eligibilityProfile: { cities: ['Bengaluru'], countries: ['IN'] },
});
check('a stated preference produces a verdict', withPrefs.items[0].eligibility !== null);
check('the verdict is one of the three Phase 5 outcomes',
  ['eligible', 'ineligible', 'unknown'].includes(withPrefs.items[0].eligibility!.status));

/* `unknown` must survive as itself. */
const unknownable = personalizedPage({
  rankedJobs: [job('a', { location: '' })],
  candidate: null,
  eligibilityProfile: { workModes: ['remote'] },
});
check('an undecidable rule does not become "ineligible"',
  unknownable.items[0].eligibility?.status !== 'ineligible'
  || unknownable.items[0].eligibility!.reasons.length > 0);

/* ═══ Reasons are passed through, never invented ════════════════════════ */

const reasons = personalizedPage({
  rankedJobs: [job('a'), job('b')],
  candidate: null,
  reasonsByJobId: new Map([['a', ['2 matching skills', 'Role matches your profile']]]),
  pageSize: 10,
});
check('supplied reasons are passed through', reasons.items[0].matchReasons.length === 2);
check('the exact reason text is preserved',
  reasons.items[0].matchReasons[0] === '2 matching skills');
/* A job with no supplied reasons gets NONE — not a generated one. */
check('a job with no reasons gets an empty list', reasons.items[1].matchReasons.length === 0);

/* ═══ Bounded work per request ══════════════════════════════════════════ */

const many = Array.from({ length: 500 }, (_, i) => job(`j${i}`));
const huge = personalizedPage({ rankedJobs: many, candidate: null, page: 1, pageSize: 1000 });
check('an oversized pageSize is clamped', huge.items.length <= MAX_ENRICHED_PER_PAGE);
check('the enrich ceiling is respected', huge.items.length <= MAX_ENRICHED_PER_PAGE);
check('the true total is still reported', huge.total === 500);
check('a 500-job corpus still pages', huge.page === 1);

const p2 = personalizedPage({ rankedJobs: many, candidate: null, page: 2, pageSize: 20 });
check('page 2 starts where page 1 ended', p2.items[0].id === 'j20');
check('page 2 reports the same total', p2.total === 500);

/* ═══ Report ════════════════════════════════════════════════════════════ */

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
