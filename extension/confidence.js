/**
 * How sure are we that this application is right?
 *
 * ═══ WHY A NUMBER AT ALL ═══
 *
 * "11 of 12 fields filled" counts boxes. It says nothing about whether the
 * answers in them are any good, and it reads identically whether the twelfth
 * box is a middle name or the one asking about visa sponsorship. A person
 * looking at a filled form wants to know one thing: is this safe to send?
 *
 * So the number answers that question and nothing else, and it moves in real
 * time as they answer questions and edit answers, because a score that only
 * appears once is a verdict rather than a guide.
 *
 * ═══ WHAT IT IS MADE OF ═══
 *
 * Three things, and deliberately not more — a score assembled from nine
 * weighted signals cannot be explained in the sentence underneath it, and an
 * unexplainable number is worse than no number.
 *
 *   COVERAGE (45%)  Required fields that have an answer. This dominates
 *                   because an employer's form will simply refuse an
 *                   application missing one, however good the rest is.
 *
 *   QUALITY  (35%)  How sure the matcher was about what it wrote. A value
 *                   placed by an exact `autocomplete="email"` match is not the
 *                   same as one the model guessed from a nearby heading, and
 *                   the score should not pretend otherwise.
 *
 *   SETTLED  (20%)  Flagged answers the person has actually looked at. Every
 *                   drafted sentence and every low-confidence guess starts
 *                   unsettled and is settled by being read — which is the
 *                   whole point of the review step, expressed as arithmetic.
 *
 * ═══ THIS FILE IS LOADED TWICE ═══
 *
 * As a content script in every frame, and by `npm run test:apply-confidence`
 * through `require`. It therefore holds no DOM, no chrome API and no state —
 * it is arithmetic over a list, which is also why it can be tested at all.
 */

(() => {
  const W = { coverage: 0.45, quality: 0.35, settled: 0.20 };

  /** Below this a person should not be pressing submit. */
  const BANDS = [
    [88, 'strong', 'Ready to send'],
    [70, 'good', 'Good — glance over the flagged answers'],
    [45, 'fair', 'Needs a look before you send'],
    [0, 'low', 'Not ready yet'],
  ];

  const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

  /**
   * Score the form as it stands right now.
   *
   * `entries` is one row per control the extension can see:
   *   { required, confidence, review, acknowledged }
   * where `confidence` is null/undefined for a control that is still empty.
   * An empty control is not a low-confidence one — it contributes nothing to
   * quality rather than dragging it down, because nothing was written.
   */
  function score(entries) {
    const rows = Array.isArray(entries) ? entries : [];
    const filled = rows.filter((r) => r && r.confidence != null);

    /* Nothing written is not "20% confident because there is nothing to
       review". It is no answer, and the honest score for no answer is zero. */
    if (filled.length === 0) {
      return {
        value: 0, band: 'low', verdict: 'Nothing filled yet', ready: false,
        blockers: [], counts: { filled: 0, seen: rows.length, requiredLeft: 0, unread: 0 },
      };
    }

    const required = rows.filter((r) => r && r.required);
    const requiredFilled = required.filter((r) => r.confidence != null);
    /* A form that marks nothing required is scored on everything it has, which
       is the only remaining signal about how complete it is. */
    const coverage = required.length
      ? requiredFilled.length / required.length
      : filled.length / rows.length;

    const quality = filled.reduce((sum, r) => sum + clamp01(r.confidence), 0) / filled.length;

    const flagged = filled.filter((r) => r.review);
    const unread = flagged.filter((r) => !r.acknowledged);
    const settled = flagged.length ? 1 - (unread.length / flagged.length) : 1;

    const value = Math.round(100 * (
      W.coverage * clamp01(coverage) + W.quality * clamp01(quality) + W.settled * clamp01(settled)
    ));

    const requiredLeft = required.length - requiredFilled.length;
    const blockers = [];
    if (requiredLeft > 0) {
      blockers.push(requiredLeft === 1
        ? '1 required field is still empty'
        : `${requiredLeft} required fields are still empty`);
    }
    if (unread.length > 0) {
      blockers.push(unread.length === 1
        ? '1 answer has not been checked'
        : `${unread.length} answers have not been checked`);
    }

    const band = BANDS.find(([floor]) => value >= floor) ?? BANDS[BANDS.length - 1];

    return {
      value,
      band: band[1],
      verdict: band[2],
      /* The gate on submitting from the extension. Deliberately NOT a score
         threshold: a form can score 91 and still be missing a required box,
         and "91% sure" is not permission to send an incomplete application. */
      ready: requiredLeft === 0 && unread.length === 0,
      blockers,
      counts: { filled: filled.length, seen: rows.length, requiredLeft, unread: unread.length },
    };
  }

  const api = { score, WEIGHTS: W };
  if (typeof globalThis !== 'undefined') globalThis.DocrudConfidence = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
