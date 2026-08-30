/**
 * Job-match token presentation.
 *
 * The score comes from `recommendMatch()` in lib/server/job-recommend.ts and
 * arrives on the card as `job.matchScore`, already an integer 0–100 computed
 * server-side. NOTHING HERE COMPUTES A SCORE. This module only decides how an
 * existing number is dressed, so there is no second ranking algorithm and no
 * chance of the badge disagreeing with the ordering.
 *
 * This is the JOB MATCH score — how relevant a role is to a member's profile.
 * It is not the ATS match score, which compares one resume against one job
 * description. The two are separate products of separate engines; only the
 * band thresholds are shared (lib/score-tone.ts).
 */
import { toneForScore, TONE_LABEL, type ScoreTone } from './score-tone';

export type { ScoreTone };

/**
 * The tone for a job-match percentage.
 *
 *   score < 25          red
 *   25 <= score < 50    yellow
 *   50 <= score < 75    blue
 *   score >= 75         green
 */
export function getJobMatchTone(score: number): ScoreTone {
  return toneForScore(score);
}

/** "Strong", "Competitive", … — the band as a word, for assistive tech. */
export function getJobMatchLabel(score: number): string {
  return TONE_LABEL[getJobMatchTone(score)];
}

/**
 * Token classes per tone.
 *
 * Restrained on purpose: a tinted background at ~10%, a hairline border and
 * coloured text — the same weight the emerald badge had before, so only the
 * hue changes and no card grows or shifts. Every tone declares a LIGHT value
 * and a `dark:` value.
 *
 * The dark text colours are arbitrary-value classes rather than `text-*-300`
 * shades of slate, deliberately: a global rule in app/globals.css rewrites any
 * class string containing `text-slate-900`/`text-black` for dark mode, which
 * previously rendered white-on-white buttons in the ATS UI. Colour utilities
 * outside that family are unaffected, and these are.
 */
export const JOB_MATCH_TONE_CLASSES: Record<ScoreTone, string> = {
  red: 'border-rose-500/25 bg-rose-500/[0.12] text-rose-700 dark:text-rose-300',
  yellow: 'border-amber-500/25 bg-amber-500/[0.12] text-amber-700 dark:text-amber-300',
  blue: 'border-sky-500/25 bg-sky-500/[0.12] text-sky-700 dark:text-sky-300',
  green: 'border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-300',
};

/** The complete class string for a match badge at `score`. */
export function jobMatchTokenClasses(score: number): string {
  return JOB_MATCH_TONE_CLASSES[getJobMatchTone(score)];
}
