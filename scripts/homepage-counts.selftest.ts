/**
 * Homepage count-seed self-test.
 *
 * The two headline numbers must reach the server render WITHOUT running the
 * personalised ranking that produced them (~47 s cold). This proves the seed
 * layer does exactly that: it remembers real totals, hands them back per
 * viewer, never invents one, and never lets one viewer's numbers reach another.
 */
process.env.MONGODB_URI = '';

import {
  invalidateRecommendationCaches, peekViewerCounts, rememberViewerCount, seedViewerCounts,
} from '@/lib/server/recommendation-cache';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  /* ── nothing known yet ── */
  const cold = await seedViewerCounts('user-a');
  check('an unknown viewer seeds nulls, never a fabricated number',
    cold.jobs === null && cold.people === null);
  check('a guest (no id) seeds nulls',
    (await seedViewerCounts('')).jobs === null);

  /* ── real totals, as a recommendation route would record them ── */
  rememberViewerCount('user-a', 'jobs', 149);
  rememberViewerCount('user-a', 'people', 133);

  const seeded = await seedViewerCounts('user-a');
  check('a remembered jobs total is seeded back exactly', seeded.jobs === 149, String(seeded.jobs));
  check('a remembered people total is seeded back exactly', seeded.people === 133, String(seeded.people));

  /* ── isolation: the whole point ── */
  const other = await seedViewerCounts('user-b');
  check('another viewer gets NOTHING from the first viewer', other.jobs === null && other.people === null);

  rememberViewerCount('user-b', 'jobs', 7);
  const b = await seedViewerCounts('user-b');
  const a = await seedViewerCounts('user-a');
  check('two viewers keep separate counts', b.jobs === 7 && a.jobs === 149);
  check('a partial record leaves the other count null', b.people === null);

  /* ── honesty about values ── */
  rememberViewerCount('user-c', 'jobs', 0);
  check('a genuine zero is remembered as zero, not as unknown',
    (await seedViewerCounts('user-c')).jobs === 0);
  rememberViewerCount('user-d', 'jobs', Number.NaN);
  check('a non-finite total is refused rather than stored',
    (await seedViewerCounts('user-d')).jobs === null);
  rememberViewerCount('user-e', 'jobs', -5);
  check('a negative total is clamped, never shown negative',
    (await seedViewerCounts('user-e')).jobs === 0);

  /* ── updates ── */
  rememberViewerCount('user-a', 'jobs', 150);
  check('a newer total replaces the older one', (await seedViewerCounts('user-a')).jobs === 150);

  /* ── the peek must never compute ── */
  check('peekViewerCounts returns in-process data only',
    peekViewerCounts('user-a')?.jobs === 150 && peekViewerCounts('user-zzz') === null);

  /* ── Profile Score card visibility ──
     The card is REMOVED from the tree at 100%, not hidden, and the desktop row
     drops from four columns to three so no empty column is left behind. These
     mirror the predicate and template choice in HomeHighlights. */
  const ROW_4 = 'lg:grid-cols-[minmax(300px,1.55fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_minmax(280px,1.35fr)]';
  const ROW_3 = 'lg:grid-cols-[minmax(300px,1.9fr)_minmax(180px,1fr)_minmax(180px,1fr)]';
  const showScoreCard = (score: number | null) => score === null || score < 100;
  const rowTemplate = (score: number | null) => (showScoreCard(score) ? ROW_4 : ROW_3);
  const columns = (t: string) => (t.match(/minmax\(/g) ?? []).length;

  check('score 55 → Profile Score renders', showScoreCard(55));
  check('score 99 → Profile Score renders', showScoreCard(99));
  check('score 100 → Profile Score is NOT rendered', !showScoreCard(100));
  check('score 0 → Profile Score renders', showScoreCard(0));
  check('score still loading (null) → card stays, so the row does not jump',
    showScoreCard(null));

  check('below 100 the desktop row has FOUR columns', columns(rowTemplate(55)) === 4);
  check('at 100 the desktop row has THREE columns — no empty fourth',
    columns(rowTemplate(100)) === 3);
  check('the three remaining columns take the freed width',
    rowTemplate(100).includes('1.9fr') && rowTemplate(55).includes('1.55fr'));

  /* ── clearing recommendation caches must not erase the seeds ──
     Otherwise a job posting would blank every homepage number until each
     viewer's ranking recomputed — the exact flash this feature removes. */
  invalidateRecommendationCaches();
  check('invalidating recommendation caches keeps the seeded counts',
    (await seedViewerCounts('user-a')).jobs === 150);

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
