/**
 * Resume-into-recommendations self-test.
 *
 * The merge decides what the recommender is told about a viewer, so its rules
 * have to hold exactly: skills union, everything else fills a gap only, newest
 * resume wins, and a typed profile answer is never overridden by an old CV.
 */
import { mergeResumeSignals, missingRecommendSignals } from '@/lib/server/recommend-profile';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const resume = (uploadedAt: string, parsedData: Record<string, unknown>) => ({ uploadedAt, parsedData });

function main() {
  /* ── no resume changes nothing ── */
  const bare = { headline: 'Engineer', skills: ['react'], location: 'Pune', experience: [{ title: 'Dev' }], interests: ['ai'] };
  check('with no resume the signals are unchanged',
    JSON.stringify(mergeResumeSignals(bare, [])) === JSON.stringify({ ...bare, headline: 'Engineer' }));
  check('a null resume list is safe', mergeResumeSignals(bare, null).skills?.length === 1);
  check('a null profile is safe', mergeResumeSignals(null, null).skills?.length === 0);

  /* ── skills union ── */
  const merged = mergeResumeSignals(
    { skills: ['React', 'Python'] },
    [resume('2026-01-01', { skills: ['python', 'Docker', 'SQL'] })],
  );
  check('resume skills are added to profile skills',
    (merged.skills ?? []).length === 4, JSON.stringify(merged.skills));
  check('the union is case-insensitive (python not duplicated)',
    (merged.skills ?? []).filter((s) => s.toLowerCase() === 'python').length === 1);
  check('the profile spelling is kept', (merged.skills ?? [])[1] === 'Python');

  /* ── fallback only, never override ── */
  const typed = mergeResumeSignals(
    { headline: 'Senior Engineer', location: 'Bengaluru', experience: [{ title: 'Current role' }] },
    [resume('2026-01-01', { headline: 'Intern', location: 'Delhi', experience: [{ title: 'Old role' }] })],
  );
  check('a typed headline is NOT overridden by the resume', typed.headline === 'Senior Engineer');
  check('a typed location is NOT overridden', typed.location === 'Bengaluru');
  check('typed experience is NOT overridden', typed.experience?.[0]?.title === 'Current role');

  const gaps = mergeResumeSignals(
    { skills: ['react'] },
    [resume('2026-01-01', { headline: 'Backend Developer', location: 'Mumbai', experience: [{ title: 'Dev' }] })],
  );
  check('an empty headline IS filled from the resume', gaps.headline === 'Backend Developer');
  check('an empty location IS filled from the resume', gaps.location === 'Mumbai');
  check('empty experience IS filled from the resume', gaps.experience?.length === 1);

  /* ── newest resume wins ── */
  const ordered = mergeResumeSignals({}, [
    resume('2025-01-01', { headline: 'Older', location: 'Old City' }),
    resume('2026-06-01', { headline: 'Newer', location: 'New City' }),
  ]);
  check('the most recent resume wins a disagreement',
    ordered.headline === 'Newer' && ordered.location === 'New City');
  const undated = mergeResumeSignals({}, [
    resume('', { headline: 'Undated' }),
    resume('2026-06-01', { headline: 'Dated' }),
  ]);
  check('an undated resume does not jump ahead of a dated one', undated.headline === 'Dated');

  /* ── resumes with no parsed data are ignored ── */
  check('an unparsed resume contributes nothing',
    mergeResumeSignals({ skills: ['react'] }, [{ uploadedAt: '2026-01-01' }]).skills?.length === 1);

  /* ── purity ── */
  const original = { skills: ['react'], experience: [{ title: 'Dev' }] };
  const snapshot = JSON.stringify(original);
  mergeResumeSignals(original, [resume('2026-01-01', { skills: ['go'] })]);
  check('the caller’s profile object is not mutated', JSON.stringify(original) === snapshot);

  /* ── gap reporting ── */
  check('missing signals are reported honestly',
    JSON.stringify(missingRecommendSignals({ skills: ['react'] }))
    === JSON.stringify(['headline', 'location', 'experience']));
  check('a complete profile reports nothing missing',
    missingRecommendSignals(bare).length === 0);

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}
main();
