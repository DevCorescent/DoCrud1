/**
 * The recommendation computation, as a PURE function.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `computeRecommendations()` in the route carries a docblock saying a
 * background refresh could reuse it. It cannot: it performs three database
 * reads (feed config, corpus, profile), writes a module-level cache and calls
 * `rememberViewerCount`. A batch calling it would re-read the ~7.4 MB corpus
 * ONCE PER USER — the measured 86 s read, 474 times — which is the architecture
 * Phase 3.2 explicitly rejected.
 *
 * So the scoring itself is lifted out, unchanged, to here. This function takes
 * the corpus it is given and returns the same payload the route builds today.
 * It performs no I/O, reads no session, touches no cache and no clock it was
 * not handed, which makes it callable from a batch that reads the corpus ONCE
 * and scores many profiles against it in memory.
 *
 * ═══ THE SCORER IS NOT TOUCHED ═══
 *
 * `recommendMatch`, `isRecommended` and the ranking comparator are used exactly
 * as the route uses them, in the same order, with the same tie-break and the
 * same field projections. This changes WHEN and WHERE scoring runs, never HOW
 * it scores. `scripts/recommendation-precompute.selftest.ts` executes this
 * function and the route's own logic over identical inputs and requires
 * identical output, field for field.
 */
import {
  isRecommended, recommendMatch, type RecJob, type RecProfile,
} from '@/lib/server/job-recommend';
import { isValidApplyUrl } from '@/lib/jobs-ui';
import { coerceJobUrgency } from '@/lib/job-urgency';

/** One scored posting, before a scope decides what to return. */
export interface ScoredRecommendation {
  score: number;
  recommended: boolean;
  job: Record<string, unknown>;
}

export interface ComputeInput {
  profile: RecProfile;
  /** True when the profile carries enough signal to show a match at all. */
  showMatch: boolean;
  /** The corpus, already loaded. This function never fetches it. */
  jobs: ReadonlyArray<Record<string, unknown>>;
  /** Injected so the result is deterministic for a given instant. */
  now: number;
}

/**
 * Score every posting and rank them.
 *
 * A faithful lift of the route's own block: same RecJob projection, same card
 * fields, same `showMatch` gating, same sort (score desc, then createdAt desc).
 */
export function scoreRecommendations(input: ComputeInput): ScoredRecommendation[] {
  const { profile, showMatch, jobs, now } = input;

  const scored = jobs.map((j) => {
    const recJob: RecJob = {
      id: String(j.id ?? ''),
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
    };
    const match = recommendMatch(profile, recJob, now);
    const job: Record<string, unknown> = {
      id: recJob.id,
      title: recJob.title || 'Open role',
      organizationName: recJob.organizationName,
      location: recJob.location,
      employmentType: recJob.employmentType,
      workMode: recJob.workMode,
      preferredSkills: (recJob.preferredSkills ?? []).slice(0, 4),
      applyUrl: isValidApplyUrl(String(j.applyUrl ?? '')) ? String(j.applyUrl) : '',
      createdAt: recJob.createdAt,
    };
    /* Added by the homepage UI work that landed while this module was out of
       the tree. Only when the employer stated one — omitted rather than sent
       empty, so a card can test for presence and show no tint when absent. */
    const urgency = coerceJobUrgency(j.hiringUrgency);
    if (urgency) job.hiringUrgency = urgency;
    if (showMatch) {
      job.matchScore = match.score;
      job.matchReasons = match.reasons;
      if (match.summary) job.matchSummary = match.summary;
      if (match.factors.length) job.matchFactors = match.factors;
      if (match.matchedSkills.length) job.matchedSkills = match.matchedSkills.slice(0, 12);
      if (match.missingSkills.length) job.missingSkills = match.missingSkills.slice(0, 8);
    }
    return { score: showMatch ? match.score : 0, recommended: showMatch && isRecommended(match), job };
  });

  scored.sort((a, b) => b.score - a.score
    || Date.parse(String(b.job.createdAt)) - Date.parse(String(a.job.createdAt)));
  return scored;
}

/**
 * The recommended SET and its honest size.
 *
 * `total` is the real size of the recommended set BEFORE any carousel trim, so
 * a headline never shrinks to the length of a row — the existing semantics,
 * preserved verbatim.
 */
export function recommendedSet(scored: ScoredRecommendation[]): {
  recommended: ScoredRecommendation[];
  total: number;
} {
  const recommended = scored.filter((s) => s.recommended);
  return { recommended, total: recommended.length };
}

/** What the `row` scope returns: the carousel's worth, ranked. */
export function rowScope(scored: ScoredRecommendation[], maxCards: number): Record<string, unknown>[] {
  return scored.slice(0, maxCards).map((s) => s.job);
}
