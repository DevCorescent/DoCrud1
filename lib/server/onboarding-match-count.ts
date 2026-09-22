/**
 * The onboarding job-match COUNT — how many published postings match the
 * candidate's answers, by the SAME rule the homepage "Job matches" tile uses.
 *
 * ═══ ONE ENGINE, NOT TWO ═══
 *
 * The homepage tile is `recommendedSet(scoreRecommendations(...)).total`: every
 * published posting is scored with `recommendMatch` against the member's
 * profile, and a posting counts when `isRecommended` — a shared skill or a
 * matching role, never merely "remote" or "recent". This module produces THAT
 * number for a candidate who has no account yet. It builds the profile with the
 * same `buildRecProfile`, scores with the same `recommendMatch`, and counts with
 * the same `isRecommended`. There is no onboarding-only matcher, no threshold of
 * its own, and no weight it could drift on.
 *
 * ═══ WHAT THE PROFILE IS ═══
 *
 * When the candidate signs up, `/api/onboarding/signup/verify` persists their
 * `skills`, `roles` and `customRoles`. Of those, the scorer reads exactly one:
 * `skills` (see RECOMMENDATION_INPUT_FIELDS in user-profiles.ts, which names
 * roles/customRoles as the fields it does NOT read). So the profile scored here
 * is `buildRecProfile({ skills })` — precisely the profile the homepage would
 * score the moment the account exists. Roles are accepted in the answers so the
 * request shape matches what gets persisted, and they are ignored here for the
 * same reason the homepage ignores them: the engine does not read them.
 *
 * ═══ WHY THE FEATURES PATH ═══
 *
 * Scoring scans each description for skills. Done inline that is ~9 s for the
 * full corpus (measured, 12,659 postings); done once per corpus version via
 * `recFeaturesFor` and handed to the scorer as `recSkills`/`recYears` it is
 * ~150–270 ms with the SAME result — the personalized feed already ranks this
 * way, and the totals were measured identical on six profiles against the real
 * corpus. A missing feature set makes the scorer scan inline for that posting,
 * which is slower, never different.
 *
 * ═══ WHAT IS NEVER INVENTED ═══
 *
 * Nothing is counted that was not handed in, and nothing handed in is counted
 * unless it is published and matches. The count is an integer; the display
 * bucket (floor to a multiple of five) is derived from it by the rule every
 * other onboarding figure uses, so the screen can never promise more than the
 * engine found. A profile with no signals counts 0 — the engine's own answer,
 * not a placeholder.
 */
import { createHash } from 'node:crypto';
import {
  buildRecProfile, hasProfileSignals, isRecommended, recommendMatch,
  type RecJob, type RecProfile,
} from '@/lib/server/job-recommend';
import type { RecFeatures } from '@/lib/server/recommendation-features';
import { registerRecommendationCache } from '@/lib/server/recommendation-cache';
import { getCompanyJobDisplayCount } from '@/lib/company-explorer';

/** The answers the count is derived from — the same shape onboarding persists. */
export interface OnboardingMatchAnswers {
  skills?: readonly string[];
  roles?: readonly string[];
  customRoles?: readonly string[];
}

/**
 * The profile the engine will see once this candidate has an account: skills
 * only, because that is the one onboarding answer the scorer reads.
 */
export function onboardingRecProfile(answers: OnboardingMatchAnswers): RecProfile {
  return buildRecProfile({ skills: [...(answers.skills ?? [])] });
}

/**
 * The scorer's view of a posting — the projection `rankPersonalized` uses,
 * with derived features spread in only when this posting has them.
 */
export function toRecJob(
  j: Record<string, unknown>,
  features?: Map<string, RecFeatures> | null,
): RecJob {
  const id = String(j.id ?? '');
  const f = features?.get(id);
  return {
    id,
    title: String(j.title ?? ''),
    organizationName: String(j.organizationName ?? ''),
    location: String(j.location ?? ''),
    employmentType: String(j.employmentType ?? ''),
    workMode: String(j.workMode ?? ''),
    experienceLevel: String(j.experienceLevel ?? ''),
    description: String(j.description ?? ''),
    preferredSkills: Array.isArray(j.preferredSkills) ? (j.preferredSkills as string[]) : [],
    targetRoleKeywords: Array.isArray(j.targetRoleKeywords) ? (j.targetRoleKeywords as string[]) : [],
    createdAt: String(j.createdAt ?? ''),
    ...(f ? { recSkills: f.skills, recYears: f.years } : {}),
  };
}

/**
 * How many of `jobs` the engine recommends for these answers.
 *
 * Only published postings are considered — the accessor that feeds this
 * already guarantees that, and the check here means a caller can never widen
 * it by handing in more. A profile with no signals is 0 by the engine's own
 * rule (`hasProfileSignals`), exactly as the homepage tile reads 0 for it.
 */
export function countOnboardingMatches(
  jobs: ReadonlyArray<Record<string, unknown>>,
  answers: OnboardingMatchAnswers,
  now: number,
  features?: Map<string, RecFeatures> | null,
): number {
  const profile = onboardingRecProfile(answers);
  if (!hasProfileSignals(profile)) return 0;
  let total = 0;
  for (const j of jobs) {
    if (j.status !== 'published') continue;
    if (isRecommended(recommendMatch(profile, toRecJob(j, features), now))) total += 1;
  }
  return total;
}

/** The display bucket: floor to a multiple of five, never up. */
export function matchBucket(total: number): number {
  return getCompanyJobDisplayCount(total);
}

/* ─── memo ───────────────────────────────────────────────────────────────
   Keyed by corpus version AND the canonical skill set, so two candidates with
   different answers can never share a number, and a job write (which clears
   every registered recommendation cache) or a corpus change (a new version)
   drops the entry. Fresh for the same window the homepage tile uses. */

const FRESH_MS = 60_000;
const MAX_ENTRIES = 500;
const memo = new Map<string, { total: number; ts: number }>();
const inFlight = new Map<string, Promise<number>>();
registerRecommendationCache({ clear: () => { memo.clear(); inFlight.clear(); } });

/** Lower-cased, trimmed, de-duplicated, sorted — order and spelling do not make a new key. */
export function canonicalSkills(answers: OnboardingMatchAnswers): string[] {
  return Array.from(new Set((answers.skills ?? []).map((s) => String(s).toLowerCase().trim()).filter(Boolean))).sort();
}

export function matchCountKey(corpusVersion: string | null, answers: OnboardingMatchAnswers): string {
  const skills = createHash('sha256').update(JSON.stringify(canonicalSkills(answers))).digest('hex').slice(0, 32);
  return `${corpusVersion ?? 'unversioned'}:${skills}`;
}

/**
 * Serve a fresh memo entry, or compute once and remember it. Concurrent
 * callers on the same key share one computation.
 */
export async function memoizedMatchCount(
  key: string,
  compute: () => Promise<number>,
  now: number = Date.now(),
): Promise<number> {
  const hit = memo.get(key);
  if (hit && now - hit.ts < FRESH_MS) return hit.total;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = compute()
    .then((total) => {
      if (memo.size >= MAX_ENTRIES) {
        const oldest = memo.keys().next().value;
        if (oldest !== undefined) memo.delete(oldest);
      }
      memo.set(key, { total, ts: now });
      return total;
    })
    .finally(() => { inFlight.delete(key); });
  inFlight.set(key, run);
  return run;
}

/** Test seams. */
export function clearOnboardingMatchCounts(): void { memo.clear(); inFlight.clear(); }
export function onboardingMatchCountState(): { size: number } { return { size: memo.size }; }
