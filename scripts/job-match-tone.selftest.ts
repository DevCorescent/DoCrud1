/**
 * Job-match colour self-test.
 *
 * The score itself is NOT under test here — it is produced by
 * lib/server/job-recommend.ts and covered by scripts/india-recommend.selftest.ts.
 * What is under test is the presentation: that a percentage maps to exactly one
 * band, that the boundary values fall on the documented side, that a list of
 * cards colours each independently, and that no card can be styled from a value
 * the server did not send.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  getJobMatchTone, getJobMatchLabel, jobMatchTokenClasses, JOB_MATCH_TONE_CLASSES,
  jobMatchPanelClasses, jobMatchActionClasses,
  jobMatchCardClasses, JOB_MATCH_CARD_CLASSES, JOB_MATCH_CARD_NEUTRAL,
  JOB_MATCH_PANEL_CLASSES, JOB_MATCH_ACTION_CLASSES, JOB_MATCH_ACTION_NEUTRAL,
} from '@/lib/job-match-tone';
import { toneForScore, TONE_LABEL, TONE_THRESHOLDS } from '@/lib/score-tone';
import { recommendMatch, buildRecProfile } from '@/lib/server/job-recommend';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const CARD = read('components/jobs/JobSummaryCard.tsx');
const RECS = read('components/recommendations/RecommendedJobs.tsx');

function main() {
  console.log('\n── 1. Exact boundaries ──');

  const cases: Array<[number, string]> = [
    [0, 'red'], [24, 'red'], [24.9, 'red'],
    [25, 'yellow'], [25.0, 'yellow'], [49, 'yellow'], [49.9, 'yellow'],
    [50, 'blue'], [50.0, 'blue'], [74, 'blue'], [74.9, 'blue'],
    [75, 'green'], [75.0, 'green'], [100, 'green'],
  ];
  for (const [score, tone] of cases) {
    check(`${score} → ${tone}`, getJobMatchTone(score) === tone, getJobMatchTone(score));
  }
  check('every boundary value belongs to the HIGHER band',
    getJobMatchTone(25) === 'yellow' && getJobMatchTone(50) === 'blue' && getJobMatchTone(75) === 'green');
  check('the value just below each boundary stays in the lower band',
    getJobMatchTone(24.999) === 'red' && getJobMatchTone(49.999) === 'yellow' && getJobMatchTone(74.999) === 'blue');

  console.log('\n── 2. Out-of-range and invalid input ──');

  check('a negative score is handled and reads as the lowest band', getJobMatchTone(-1) === 'red');
  check('a large negative score is handled', getJobMatchTone(-9999) === 'red');
  check('a score above 100 is handled and reads as the highest band', getJobMatchTone(101) === 'green');
  check('a very large score is handled', getJobMatchTone(1e9) === 'green');
  check('NaN does not throw and falls back safely', getJobMatchTone(Number.NaN) === 'red');
  check('Infinity does not throw', getJobMatchTone(Number.POSITIVE_INFINITY) === 'red');
  check('-Infinity does not throw', getJobMatchTone(Number.NEGATIVE_INFINITY) === 'red');
  /* Clamping must not rewrite the score anywhere — the badge prints the number
     it was handed. This asserts the helper returns only a tone, never a value. */
  check('the helper returns a tone, never a modified score',
    typeof getJobMatchTone(150) === 'string');

  console.log('\n── 3. Every band is reachable and distinct ──');

  const tones = ['red', 'yellow', 'blue', 'green'] as const;
  for (const tone of tones) {
    check(`band "${tone}" has classes`, Boolean(JOB_MATCH_TONE_CLASSES[tone]?.length));
    check(`band "${tone}" declares a dark value`, JOB_MATCH_TONE_CLASSES[tone].includes('dark:'));
    check(`band "${tone}" declares a light value`,
      /text-(rose|amber|sky|emerald)-700/.test(JOB_MATCH_TONE_CLASSES[tone]));
    check(`band "${tone}" has a border and a background`,
      JOB_MATCH_TONE_CLASSES[tone].includes('border-') && JOB_MATCH_TONE_CLASSES[tone].includes('bg-'));
    check(`band "${tone}" has a word, so colour is not the only signal`,
      Boolean(TONE_LABEL[tone]?.length));
  }
  check('the four bands produce four different class strings',
    new Set(tones.map((t) => JOB_MATCH_TONE_CLASSES[t])).size === 4);
  check('backgrounds stay subtle, not saturated',
    tones.every((t) => /bg-\w+-500\/\[0\.12\]/.test(JOB_MATCH_TONE_CLASSES[t])));

  console.log('\n── 4. A mixed list colours each card independently ──');

  const list = [10, 24, 25, 35, 49, 50, 65, 74, 75, 90];
  const expected = ['red', 'red', 'yellow', 'yellow', 'yellow', 'blue', 'blue', 'blue', 'green', 'green'];
  const actual = list.map(getJobMatchTone);
  check('a ten-card list maps exactly as documented',
    JSON.stringify(actual) === JSON.stringify(expected), actual.join(','));
  check('every card keeps its own classes',
    list.every((s, i) => jobMatchTokenClasses(s) === JOB_MATCH_TONE_CLASSES[expected[i] as never]));
  /* Order independence: the same set evaluated backwards must give the same
     answers, i.e. no shared mutable state between cards. */
  check('reversing the list does not change any card\'s tone',
    JSON.stringify([...list].reverse().map(getJobMatchTone)) === JSON.stringify([...expected].reverse()));
  check('repeating one score does not affect its neighbours',
    JSON.stringify([90, 10, 90, 10].map(getJobMatchTone)) === JSON.stringify(['green', 'red', 'green', 'red']));

  console.log('\n── 5. Labels ──');

  check('a low score reads as Poor', getJobMatchLabel(10) === 'Poor');
  check('a weak score reads as Weak', getJobMatchLabel(30) === 'Weak');
  check('a mid score reads as Competitive', getJobMatchLabel(60) === 'Competitive');
  check('a high score reads as Strong', getJobMatchLabel(80) === 'Strong');

  console.log('\n── 6. One threshold definition, shared ──');

  check('the job helper delegates to the shared thresholds',
    [0, 24, 25, 49, 50, 74, 75, 100].every((s) => getJobMatchTone(s) === toneForScore(s)));
  check('the thresholds are declared once, ordered high to low',
    TONE_THRESHOLDS.map((t) => t.min).join(',') === '75,50,25,0');

  console.log('\n── 7. The score is the recommendation score, not a new one ──');

  check('the job helper computes no score of its own',
    !read('lib/job-match-tone.ts').includes('function recommendMatch')
    && !/skillScore|roleScore|expScore/.test(read('lib/job-match-tone.ts')));
  /* Checked as an IMPORT, not a substring: the module's own documentation
     names job-recommend.ts to say where the score comes from, and a plain
     text search would fail on the comment while proving nothing about code. */
  check('the tone module imports nothing from the recommendation engine',
    !/^\s*import[^;]*job-recommend/m.test(read('lib/job-match-tone.ts')));
  check('the ranking algorithm still produces a 0-100 integer', (() => {
    const profile = buildRecProfile({ skills: ['React'], headline: 'Frontend Engineer', location: 'Pune' });
    const m = recommendMatch(profile, {
      id: 'j1', title: 'Frontend Engineer', location: 'Pune', preferredSkills: ['React'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }, Date.parse('2026-02-01T00:00:00.000Z'));
    return Number.isInteger(m.score) && m.score >= 0 && m.score <= 100;
  })());

  console.log('\n── 8. The cards use the helper ──');

  for (const [name, src] of [['JobSummaryCard', CARD], ['RecommendedJobs', RECS]] as const) {
    check(`${name} styles the badge from the score`, src.includes('jobMatchTokenClasses('));
    check(`${name} no longer hardcodes emerald on the match badge`,
      !/rounded-full border border-emerald-500\/25 bg-emerald-500\/\[0\.12\][^`]*text-emerald-300/.test(src)
      && !/rounded-full bg-emerald-500\/15 px-2 py-0\.5 text-\[10px\] font-bold text-emerald-300/.test(src));
    check(`${name} still shows the percentage itself`, /\{j?o?b?\.?matchScore\}%/.test(src));
    check(`${name} exposes the band to assistive tech`, src.includes('getJobMatchLabel('));
    check(`${name} keeps the badge from shrinking the title`,
      src.includes('shrink-0') || src.includes('w-fit'));
    check(`${name} does not compute a score in the browser`,
      !src.includes('recommendMatch(') && !src.includes('evaluateAts('));
  }
  check('the badge still says Match, never "ATS Score"',
    !/ATS Score/i.test(CARD) && !/ATS Score/i.test(RECS));


  console.log('\n── 9. Panel and Apply track the SAME score as the badge ──');

  /* Comments in the card explain the colours and name every hue; an absence
     check against the raw source would match the prose, not the markup. */
  const CARD_CODE = CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const TONES = ['red', 'yellow', 'blue', 'green'] as const;
  for (const tone of TONES) {
    const panel = JOB_MATCH_PANEL_CLASSES[tone];
    check(`the ${tone} panel declares a border, a fill, a label and an icon colour`,
      /border-\w+-500/.test(panel.panel) && /bg-\w+-500/.test(panel.panel)
      && panel.label.startsWith('text-') && panel.icon.startsWith('text-'));
    check(`the ${tone} action declares BOTH a light and a dark fill`,
      /(^|\s)bg-\w+-\d{3}/.test(JOB_MATCH_ACTION_CLASSES[tone])
      && /dark:bg-\w+-\d{3}/.test(JOB_MATCH_ACTION_CLASSES[tone]));
    check(`the ${tone} action declares a hover state in both themes`,
      /(^|\s)hover:bg-/.test(JOB_MATCH_ACTION_CLASSES[tone])
      && /dark:hover:bg-/.test(JOB_MATCH_ACTION_CLASSES[tone]));
  }

  /* The point of the change: at 18% the panel and the button must NOT be the
     green they used to be, and at 88% they must not be red. */
  check('a weak match colours the panel in the weak tone, not emerald',
    !jobMatchPanelClasses(18).panel.includes('emerald')
    && jobMatchPanelClasses(18).panel.includes('rose'));
  check('a weak match colours Apply in the weak tone, not emerald',
    !jobMatchActionClasses(18).includes('emerald') && jobMatchActionClasses(18).includes('rose'));
  check('a strong match still reads emerald',
    jobMatchPanelClasses(88).panel.includes('emerald') && jobMatchActionClasses(88).includes('emerald'));
  check('panel, badge and Apply agree on the band at every score',
    [0, 18, 24, 25, 49, 50, 74, 75, 88, 100].every((n) => {
      const tone = getJobMatchTone(n);
      return jobMatchPanelClasses(n) === JOB_MATCH_PANEL_CLASSES[tone]
        && jobMatchActionClasses(n) === JOB_MATCH_ACTION_CLASSES[tone];
    }));
  check('the four panel tones are all different from one another',
    new Set(TONES.map((t) => JOB_MATCH_PANEL_CLASSES[t].panel)).size === 4);
  check('the four action tones are all different from one another',
    new Set(TONES.map((t) => JOB_MATCH_ACTION_CLASSES[t])).size === 4);

  /* A card with no score must not be dressed in a tone it did not earn. */
  check('a job with no score gets the product default button, not a tone',
    jobMatchActionClasses(undefined) === JOB_MATCH_ACTION_NEUTRAL);
  check('a NaN score falls back to the neutral button rather than throwing',
    jobMatchActionClasses(Number.NaN) === JOB_MATCH_ACTION_NEUTRAL);
  check('the neutral button carries both themes',
    /(^|\s)bg-slate-900/.test(JOB_MATCH_ACTION_NEUTRAL) && /dark:bg-/.test(JOB_MATCH_ACTION_NEUTRAL));

  check('the card styles the reasons panel from the score',
    CARD_CODE.includes('jobMatchPanelClasses('));
  check('the card styles Apply from the score',
    CARD_CODE.includes('jobMatchActionClasses('));
  check('the reasons panel no longer hardcodes emerald',
    !/border-emerald-500\/\[0\.14\]/.test(CARD_CODE)
    && !/text-emerald-300\/70/.test(CARD_CODE)
    && !/Check className="[^"]*text-emerald-400/.test(CARD_CODE));
  check('Apply no longer hardcodes the emerald pill',
    !/bg-emerald-500 px-3 py-1/.test(CARD_CODE)
    && !/shadow-\[0_1px_6px_rgba\(16,185,129/.test(CARD_CODE));
  check('Apply adopts the shared button metrics rather than a bespoke pill',
    /rounded-lg/.test(CARD_CODE) && /focus-visible:ring-2/.test(CARD_CODE));
  /* The global stylesheet's `.ui-button:hover` rule would overwrite the tone
     fill in dark mode, so the card must not render Apply through <Button>. */
  check('Apply does not go through the ui-button class the global sheet overrides',
    !CARD_CODE.includes('ui-button') && !/from '@\/components\/ui\/button'/.test(CARD_CODE));
  check('both Apply paths — external applyUrl and internal flow — share one class',
    (CARD_CODE.match(/className=\{applyClass\}/g) ?? []).length === 2);

  /* ── The card frame follows the same score as everything inside it ──── */

  /* A 23% match must not sit in the same frame as a 90% one. The frame's hue
     is derived from the SAME tone function as the badge, so they cannot drift. */
  for (const [score, hue] of [[10, 'rose'], [23, 'rose'], [26, 'amber'],
    [49, 'amber'], [50, 'sky'], [74, 'sky'], [75, 'emerald'], [96, 'emerald']] as const) {
    check(`a ${score}% card frame is ${hue}`, jobMatchCardClasses(score).includes(`${hue}-500`));
  }

  /* The boundary the user named: below 25 is red. */
  check('24% is still red', jobMatchCardClasses(24).includes('rose-500'));
  check('25% is no longer red', !jobMatchCardClasses(25).includes('rose-500'));

  /* Frame, badge and panel must agree for every tone. */
  for (const score of [5, 23, 30, 55, 80, 99]) {
    const tone = toneForScore(score);
    check(`frame and badge agree at ${score}%`,
      jobMatchCardClasses(score) === JOB_MATCH_CARD_CLASSES[tone]);
    /* Compare the HUE token of each: 'border-rose-500/[0.20]' -> 'rose'. */
    const frameHue = jobMatchCardClasses(score).split('-')[1];
    const panelHue = jobMatchPanelClasses(score).panel.split('-')[1];
    const badgeHue = jobMatchTokenClasses(score).split('-')[1];
    check(`frame, panel and badge share one hue at ${score}%`,
      frameHue === panelHue && panelHue === badgeHue);
  }

  /* An unscored card keeps the ORIGINAL white hairline — tinting it would
     state a match nobody computed. */
  check('an unscored card frame is neutral', jobMatchCardClasses(undefined) === JOB_MATCH_CARD_NEUTRAL);
  check('a NaN score frame is neutral', jobMatchCardClasses(Number.NaN) === JOB_MATCH_CARD_NEUTRAL);
  check('the neutral frame is the original white hairline',
    JOB_MATCH_CARD_NEUTRAL.includes('border-white/[0.07]')
    && JOB_MATCH_CARD_NEUTRAL.includes('hover:border-white/[0.14]'));

  /* Weight preserved: every tone keeps an idle AND a hover border, so the
     recolour cannot silently become a heavier or a static frame. */
  for (const tone of ['red', 'yellow', 'blue', 'green'] as const) {
    check(`the ${tone} frame has an idle border`, /(^|\s)border-\w+-500\/20(\s|$)/.test(JOB_MATCH_CARD_CLASSES[tone]));
    check(`the ${tone} frame has a hover border`, /hover:border-\w+-500\/40(\s|$)/.test(JOB_MATCH_CARD_CLASSES[tone]));
    /* tailwind.config does not scan lib/, so an ARBITRARY opacity written only
       here is never generated — the sky tier rendered pale grey that way. */
    check(`the ${tone} frame uses a standard opacity step, not an arbitrary one`,
      !/\[0\.\d+\]/.test(JOB_MATCH_CARD_CLASSES[tone]));
  }

  /* The card must actually USE it, and must no longer hard-code the white one. */
  check('the card applies the tone frame', CARD_CODE.includes('jobMatchCardClasses(job.matchScore)'));
  check('the card no longer hard-codes a white frame',
    !/border border-white\/\[0\.07\][\s\S]{0,120}hover:border-white\/\[0\.14\]/.test(CARD_CODE));
  /* Colour is never the only signal — the percentage still prints. */
  check('the percentage is still rendered beside the frame',
    CARD_CODE.includes('{job.matchScore}% Match'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
