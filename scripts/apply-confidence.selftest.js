/**
 * The number the member decides to press submit on.
 *
 * `extension/confidence.js` is loaded straight from the extension folder — the
 * same file the browser runs, not a copy — so this tests the thing that ships.
 *
 *   npm run test:apply-confidence
 */

const { score } = require('../extension/confidence.js');

let passed = 0;
const failures = [];

function check(what, got, want) {
  if (got === want) { passed += 1; return; }
  failures.push(`${what}\n    expected ${JSON.stringify(want)}\n    got      ${JSON.stringify(got)}`);
}

const filled = (c, extra) => Object.assign({ confidence: c }, extra);
const empty = (extra) => Object.assign({ confidence: null }, extra);

/* ── Nothing filled ────────────────────────────────────────────────────
   The trap this guards: with three weighted terms and no answers, "settled"
   is vacuously 1 and the score comes out 20 for a form nobody has touched. */

check('empty form scores zero', score([]).value, 0);
check('form with only empty fields scores zero',
  score([empty({ required: true }), empty()]).value, 0);
check('nothing filled is never ready', score([]).ready, false);

/* ── A perfect form ────────────────────────────────────────────────────── */

const perfect = score([
  filled(1, { required: true }), filled(1, { required: true }), filled(1),
]);
check('certain answers, nothing flagged, scores 100', perfect.value, 100);
check('and is ready', perfect.ready, true);
check('and says so', perfect.band, 'strong');
check('with no blockers', perfect.blockers.length, 0);

/* ── Coverage dominates ────────────────────────────────────────────────
   A missing required field has to hurt more than a shaky answer, because the
   employer's form will reject the first and accept the second. */

const missingRequired = score([filled(1, { required: true }), empty({ required: true })]);
const shakyButComplete = score([filled(0.5, { required: true }), filled(0.5, { required: true })]);
check('a missing required field outranks two weak answers',
  missingRequired.value < shakyButComplete.value, true);
check('and is reported', missingRequired.blockers[0], '1 required field is still empty');
check('and blocks submission', missingRequired.ready, false);

check('plural is right', score([
  filled(1, { required: true }), empty({ required: true }), empty({ required: true }),
]).blockers[0], '2 required fields are still empty');

/* ── Quality ───────────────────────────────────────────────────────────── */

const sure = score([filled(1, { required: true })]);
const unsure = score([filled(0.45, { required: true })]);
check('a guess scores below a certainty', unsure.value < sure.value, true);
check('an empty field does not drag quality down',
  score([filled(1, { required: true }), empty()]).value,
  score([filled(1, { required: true })]).value);

/* ── Settling ────────────────────────────────────────────────────────────
   This is the part that has to move in real time: reading a flagged answer is
   the member's action, and the score is what tells them it counted. */

const beforeReading = score([filled(1, { required: true }), filled(0.6, { review: true })]);
const afterReading = score([filled(1, { required: true }), filled(0.6, { review: true, acknowledged: true })]);
check('checking a flagged answer raises the score', afterReading.value > beforeReading.value, true);
check('an unchecked answer blocks submission', beforeReading.ready, false);
check('a checked one does not', afterReading.ready, true);
check('and it is named', beforeReading.blockers[0], '1 answer has not been checked');

/* A high score is not permission. This is the whole reason `ready` is a
   separate boolean rather than a threshold on `value`. */
const highButIncomplete = score([
  filled(1, { required: true }), filled(1, { required: true }), filled(1, { required: true }),
  filled(1, { required: true }), filled(1, { required: true }), filled(1, { required: true }),
  filled(1, { required: true }), filled(1, { required: true }), filled(1, { required: true }),
  empty({ required: true }),
]);
check('a 90-odd score with a required field missing is still not ready',
  highButIncomplete.value >= 85 && highButIncomplete.ready === false, true);

/* ── Forms that mark nothing required ──────────────────────────────────── */

const noneRequired = score([filled(1), filled(1), empty(), empty()]);
check('falls back to overall coverage', noneRequired.value, Math.round(100 * (0.45 * 0.5 + 0.35 + 0.20)));
check('and cannot be blocked by a requirement that does not exist',
  noneRequired.blockers.length, 0);

/* ── Bands ─────────────────────────────────────────────────────────────── */

check('0 is low', score([]).band, 'low');
check('a half-answered form is not called good',
  ['low', 'fair'].includes(score([filled(0.5, { required: true }), empty({ required: true })]).band), true);

/* ── Bad input ───────────────────────────────────────────────────────────
   Fed from the DOM, so it will eventually be fed something strange. */

check('non-array is survivable', score(null).value, 0);
check('a nonsense confidence does not produce NaN',
  Number.isFinite(score([filled(NaN, { required: true })]).value), true);
check('a confidence above 1 is clamped',
  score([filled(99, { required: true })]).value, 100);
check('holes in the list are ignored', score([null, filled(1, { required: true })]).value, 100);

/* ── Report ────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(`\n${failures.length} failed:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
console.log('Confidence scoring OK.');
