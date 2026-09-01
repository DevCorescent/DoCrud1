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

/**
 * The "Why this matches you" panel, per tone.
 *
 * The panel explains a match, so it has no business being emerald when the
 * badge above it is rose: a 18% match rendered a green "why this matches you"
 * card, which read as an endorsement the score does not support. Same weight as
 * before — a hairline border and a ~5% tint — only the hue now follows the
 * score, so panel and badge can never disagree.
 */
export const JOB_MATCH_PANEL_CLASSES: Record<ScoreTone, { panel: string; label: string; icon: string }> = {
  red: { panel: 'border-rose-500/[0.16] bg-rose-500/[0.05]', label: 'text-rose-300/70', icon: 'text-rose-400' },
  yellow: { panel: 'border-amber-500/[0.16] bg-amber-500/[0.05]', label: 'text-amber-300/70', icon: 'text-amber-400' },
  blue: { panel: 'border-sky-500/[0.16] bg-sky-500/[0.05]', label: 'text-sky-300/70', icon: 'text-sky-400' },
  green: { panel: 'border-emerald-500/[0.16] bg-emerald-500/[0.05]', label: 'text-emerald-300/70', icon: 'text-emerald-400' },
};

export function jobMatchPanelClasses(score: number) {
  return JOB_MATCH_PANEL_CLASSES[getJobMatchTone(score)];
}

/**
 * A filled ACTION in the match tone — the Apply button.
 *
 * Filled rather than tinted: this is the card's primary action and has to hold
 * its own against the tinted badge and panel. Each tone declares a light value
 * and a dark one, because the card's Apply is the one control on it that a
 * member reaches for in either theme, and a fill tuned only for a dark page
 * washes out on a light one.
 *
 * Yellow takes dark text on a bright fill instead of white: white on amber is
 * the one combination in this set that fails legibility at 12px bold.
 * `text-amber-950` is deliberately outside the slate/black family that
 * app/globals.css rewrites in dark mode.
 */
export const JOB_MATCH_ACTION_CLASSES: Record<ScoreTone, string> = {
  red: 'bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400',
  yellow: 'bg-amber-600 text-white hover:bg-amber-500 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300',
  blue: 'bg-sky-600 text-white hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400',
  green: 'bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400',
};

/**
 * The neutral action, for a card with no match score at all.
 *
 * Copied from the `default` variant of components/ui/button.tsx so an unscored
 * Apply is exactly the product's standard button. There is no tone to track, so
 * inventing one would be fabricating a score.
 */
export const JOB_MATCH_ACTION_NEUTRAL =
  'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/[0.10] dark:text-slate-50 dark:border dark:border-white/[0.12] dark:backdrop-blur-md dark:hover:bg-white/[0.16]';

/** The fill for an Apply button at `score`, or the neutral button without one. */
export function jobMatchActionClasses(score?: number): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return JOB_MATCH_ACTION_NEUTRAL;
  return JOB_MATCH_ACTION_CLASSES[getJobMatchTone(score)];
}
