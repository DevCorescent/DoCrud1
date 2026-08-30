/**
 * Score bands — the one definition of where the colour changes.
 *
 * Two DIFFERENT scores in this product share these thresholds:
 *
 *   ATS match       — how compatible one resume is with one job description
 *                     (lib/server/ats). See components/ats/ats-view-model.ts.
 *   Job match       — how relevant a job is to a member's profile
 *                     (lib/server/job-recommend.ts). See getJobMatchTone below.
 *
 * They are computed by different engines from different inputs and must never
 * be presented as the same number. What they legitimately share is the READING
 * of a percentage: 80 means "strong" wherever it appears, and a member should
 * not have to learn two colour languages.
 *
 * So the thresholds live here once, and each feature keeps its own typed
 * accessor. Neither imports the other's module.
 */

export type ScoreTone = 'red' | 'yellow' | 'blue' | 'green';

/**
 * The band boundaries, stated as the lower bound of each tone.
 *
 * Deliberately half-open — `score >= min`. So 24.9 is red and 25 is yellow;
 * 74.9 is blue and 75 is green. The boundary value always belongs to the
 * HIGHER band.
 */
export const TONE_THRESHOLDS: ReadonlyArray<{ min: number; tone: ScoreTone }> = [
  { min: 75, tone: 'green' },
  { min: 50, tone: 'blue' },
  { min: 25, tone: 'yellow' },
  { min: 0, tone: 'red' },
];

/** Plain-language band names, so colour is never the only signal. */
export const TONE_LABEL: Record<ScoreTone, string> = {
  red: 'Poor',
  yellow: 'Weak',
  blue: 'Competitive',
  green: 'Strong',
};

/**
 * The tone for a 0–100 score.
 *
 * Defensive about its input on purpose: these values arrive from an API, and a
 * NaN or an out-of-range number must produce a colour rather than an exception
 * in the middle of a card list. Out-of-range values are clamped to the nearest
 * valid band; they are NOT rewritten — the caller still displays the number it
 * was given, because silently "correcting" a score would hide a real bug.
 */
export function toneForScore(score: number): ScoreTone {
  if (!Number.isFinite(score)) return 'red';
  const clamped = Math.max(0, Math.min(100, score));
  return (TONE_THRESHOLDS.find((band) => clamped >= band.min) ?? TONE_THRESHOLDS[TONE_THRESHOLDS.length - 1]).tone;
}
