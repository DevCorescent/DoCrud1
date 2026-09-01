/**
 * Phase 7 — the recommendation queue.
 *
 * ATS asks "how well does this candidate match this job?".
 * This asks "should this job be put in front of this member at all?".
 *
 * ═══ WHAT ALREADY EXISTED, AND IS REUSED RATHER THAN REBUILT ═══
 *
 * The repository already has a deterministic profile-to-job scorer
 * (lib/server/job-recommend.ts: `recommendMatch`, `isRecommended`), a per-viewer
 * cache, an API and a UI. NONE of that is replaced. This module is the
 * QUEUE around them: it gates, blends, deduplicates and persists.
 *
 *   · job-recommend.recommendMatch  -> profile relevance + its own reasons
 *   · Phase 6 evaluateJobMatch      -> ATS match score
 *   · Phase 5 evaluateJobEligibility-> the hard gate
 *   · job.createdAt / postedAt      -> freshness
 *
 * Domain, location, work mode, employment type and experience are NOT scored
 * again here: `recommendMatch` already weighs location and work mode, and
 * Phase 6 already weighs domain and experience. Re-adding them would count the
 * same evidence twice and quietly over-weight whatever a member happens to
 * have filled in.
 *
 * ═══ THE GATES, IN ORDER ═══
 *
 *   1. Phase 5 says `ineligible`      -> never recommended. `unknown` is NOT a
 *                                        rejection and passes through.
 *   2. No genuine profile overlap     -> not a recommendation. This is the
 *                                        repository's own existing rule:
 *                                        "remote" + "posted recently" alone
 *                                        already scores on every open role.
 *   3. Already applied                -> not recommended again.
 *
 * ═══ DETERMINISM ═══
 *
 * `now` is a parameter, never read from the clock inside the scorer, so the
 * same inputs always produce the same output including freshness. Ties break
 * on jobId. No randomness, no insertion order, no wall clock.
 */
import type { HiringJobPosting, HiringJobApplication } from '@/types/document';
import {
  isRecommended, recommendMatch, type RecJob, type RecProfile,
} from '@/lib/server/job-recommend';
import { evaluateJobMatch, type MatchCandidate } from './ats-match';
import { evaluateJobEligibility, type EligibilityStatus } from './eligibility';
import { isJobActive } from './lifecycle';

/* ── Model ────────────────────────────────────────────────────────────────*/

export type RecommendationStatus =
  | 'queued' | 'recommended' | 'dismissed' | 'saved' | 'applied' | 'expired';

/**
 * Statuses a member (or the system) has deliberately reached.
 *
 * A re-run must never move a record OUT of one of these: someone who dismissed
 * a job should not find it recommended again tomorrow because the queue ran.
 * `expired` is included so Phase 8, which owns the lifecycle, can set it
 * without this phase undoing it on the next pass.
 */
const TERMINAL_STATUSES: ReadonlySet<RecommendationStatus> = new Set<RecommendationStatus>([
  'dismissed', 'saved', 'applied', 'expired',
]);

/**
 * One recommendation.
 *
 * Deliberately holds the job ID, never a copy of the job. A denormalised copy
 * goes stale the moment the posting is edited, and the canonical record is one
 * lookup away.
 */
export interface JobRecommendation {
  /** `${userId}:${jobId}` — the logical identity, and what makes it idempotent. */
  id: string;
  userId: string;
  jobId: string;
  /** 0..100 integer. The blended recommendation score, not the ATS score. */
  score: number;
  /** Evidence-derived, human-readable. Never a promise or a probability. */
  reasons: string[];
  eligibility: EligibilityStatus;
  /** Phase 6's score, kept separate and unblended so both remain readable. */
  atsScore: number | null;
  signals: {
    relevance: number;
    ats: number | null;
    freshness: number | null;
    overlap: boolean;
  };
  status: RecommendationStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * How many recommendations one member's queue holds.
 *
 * A constant, not a literal sprinkled through the code, so the window can be
 * tuned in one place. Not exposed to any UI in this phase.
 */
export const RECOMMENDATION_LIMIT = 50;

/**
 * Weights for the blended score.
 *
 * Relevance leads because it is the repository's own measure of whether a job
 * suits this member. ATS is a strong second — it reads the posting's stated
 * requirements. Freshness is deliberately small: a new job is worth surfacing,
 * but never enough to outrank a genuinely better-matched older one.
 */
const WEIGHTS = { relevance: 0.45, ats: 0.35, freshness: 0.20 } as const;

/** Freshness decays to nothing over this window. Ranking only — never removal. */
const FRESHNESS_WINDOW_DAYS = 30;

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Freshness, 0..100, from whichever date the posting actually states.
 *
 * `postedAt` is what the SOURCE claims and is preferred; `createdAt` is when
 * this platform stored it. A posting with neither returns null and is dropped
 * from the weighting rather than scored zero — an undated job is not a stale
 * job.
 *
 * Phase 8 owns expiry. Nothing here removes, archives or hides an old job.
 */
export function freshnessScore(job: Partial<HiringJobPosting>, now: number): number | null {
  const raw = job.postedAt || job.createdAt;
  if (!raw) return null;
  const at = Date.parse(String(raw));
  if (!Number.isFinite(at)) return null;
  const ageDays = (now - at) / 86_400_000;
  /* A future date is treated as "today" rather than as extra credit. */
  if (ageDays <= 0) return 100;
  if (ageDays >= FRESHNESS_WINDOW_DAYS) return 0;
  return clamp(Math.round((1 - ageDays / FRESHNESS_WINDOW_DAYS) * 100));
}

/* ── Scoring ──────────────────────────────────────────────────────────────*/

export interface RecommendationInput {
  userId: string;
  /** The existing RecProfile, built by the repository's own buildRecProfile. */
  profile: RecProfile;
  /** Phase 6 candidate view. Optional: without it, ATS is simply not a signal. */
  candidate?: MatchCandidate;
  /** Job ids this member has already applied to. */
  appliedJobIds?: ReadonlySet<string>;
  /** Fixed clock, so freshness — and therefore ranking — is reproducible. */
  now: number;
}

export interface ScoredJob {
  job: HiringJobPosting;
  score: number;
  reasons: string[];
  eligibility: EligibilityStatus;
  atsScore: number | null;
  signals: JobRecommendation['signals'];
  /** Why it was excluded, when it was. Null when the job is recommendable. */
  excluded: 'expired' | 'ineligible' | 'no_overlap' | 'already_applied' | null;
}

/**
 * Score one job for one member.
 *
 * Pure: no clock, no database, no network, and neither argument is mutated.
 */
export function scoreJobForUser(job: HiringJobPosting, input: RecommendationInput): ScoredJob {
  const recJob: RecJob = {
    id: job.id,
    title: job.title,
    organizationName: job.organizationName,
    location: job.location,
    employmentType: job.employmentType,
    workMode: job.workMode,
    experienceLevel: job.experienceLevel,
    description: job.description,
    preferredSkills: job.preferredSkills,
    targetRoleKeywords: job.targetRoleKeywords,
    createdAt: job.createdAt,
  };
  const match = recommendMatch(input.profile, recJob, input.now);

  const eligibility = evaluateJobEligibility(
    job, input.candidate?.eligibility ?? {},
  ).status;

  /* ATS only when there is a candidate view to score. Absent means "no signal",
     never "scored zero". */
  const atsScore = input.candidate
    ? evaluateJobMatch(job, input.candidate).score
    : null;

  const freshness = freshnessScore(job, input.now);

  /* Weight redistribution over the signals that actually exist — the same rule
     as Phase 6. A member with no resume must not be ranked as if every posting
     scored zero on ATS. */
  const parts: Array<[keyof typeof WEIGHTS, number]> = [
    ['relevance', clamp(match.score)],
  ];
  if (atsScore !== null) parts.push(['ats', atsScore]);
  if (freshness !== null) parts.push(['freshness', freshness]);

  const totalWeight = parts.reduce((sum, [name]) => sum + WEIGHTS[name], 0);
  const score = totalWeight > 0
    ? clamp(Math.round(parts.reduce((sum, [name, value]) => sum + value * (WEIGHTS[name] / totalWeight), 0)))
    : 0;

  /* Reasons come from evidence only. `match.reasons` is the existing scorer's
     own output; the rest are facts about numbers already computed. */
  const reasons = [...match.reasons];
  if (atsScore !== null) reasons.push(`${atsScore}% ATS match`);
  if (freshness !== null && freshness >= 80) reasons.push('Recently posted');
  if (eligibility === 'unknown') {
    reasons.push('Some of your requirements could not be checked against this posting');
  }

  /* An expired posting is checked FIRST: it is not a weak recommendation, it
     is not a vacancy. Phase 8 owns the state; this only declines to surface
     it. Existing recommendation records are untouched — nothing here deletes
     history, it only stops NEW recommendations being generated. */
  const excluded: ScoredJob['excluded'] =
    !isJobActive(job) ? 'expired'
      : eligibility === 'ineligible' ? 'ineligible'
        : input.appliedJobIds?.has(job.id) ? 'already_applied'
          : !isRecommended(match) ? 'no_overlap'
            : null;

  return {
    job, score, reasons, eligibility, atsScore,
    signals: { relevance: clamp(match.score), ats: atsScore, freshness, overlap: match.overlap },
    excluded,
  };
}

/* ── Queue ────────────────────────────────────────────────────────────────*/

/** The logical identity. One record per member per job, forever. */
export function recommendationId(userId: string, jobId: string): string {
  return `${userId}:${jobId}`;
}

export interface BuildOptions {
  limit?: number;
  /** ISO timestamp written to new records. Defaults to `now`. */
  timestamp?: string;
}

/**
 * Build one member's recommendation set from a bounded candidate list.
 *
 * TAKES A CANDIDATE SET, NEVER THE WHOLE DATABASE. The caller decides which
 * jobs to consider — the published feed, a source's latest batch, a location
 * slice — so this stays O(candidates) and can later be fed by an index without
 * changing anything here. It deliberately does no querying of its own.
 *
 * Excluded jobs are dropped, not scored down: an ineligible job is not a weak
 * recommendation, it is not a recommendation.
 */
export function buildRecommendations(
  jobs: readonly HiringJobPosting[],
  input: RecommendationInput,
  options: BuildOptions = {},
): JobRecommendation[] {
  const limit = Math.max(0, options.limit ?? RECOMMENDATION_LIMIT);
  const at = options.timestamp ?? new Date(input.now).toISOString();

  /* De-duplicated by job id BEFORE scoring: the same canonical job arriving
     twice in a candidate list must not produce two records, and scoring it
     twice would be wasted work. First occurrence wins. */
  const seen = new Set<string>();
  const unique: HiringJobPosting[] = [];
  for (const job of jobs) {
    if (!job?.id || seen.has(job.id)) continue;
    seen.add(job.id);
    unique.push(job);
  }

  return unique
    .map((job) => scoreJobForUser(job, input))
    .filter((s) => s.excluded === null)
    /* Score descending, then jobId ascending — a property of the data, so the
       same inputs always rank the same way regardless of array order. */
    .sort((a, b) => (b.score - a.score) || a.job.id.localeCompare(b.job.id))
    .slice(0, limit)
    .map((s): JobRecommendation => ({
      id: recommendationId(input.userId, s.job.id),
      userId: input.userId,
      jobId: s.job.id,
      score: s.score,
      reasons: s.reasons,
      eligibility: s.eligibility,
      atsScore: s.atsScore,
      signals: s.signals,
      status: 'recommended',
      createdAt: at,
      updatedAt: at,
    }));
}

/**
 * Fold a freshly built set onto what is already stored. IDEMPOTENT.
 *
 * Running the queue twice with the same inputs produces a byte-identical
 * result — no duplicate records, and no churn on `updatedAt`, because a record
 * whose score and reasons are unchanged is returned untouched. Without that
 * last part every run would look like an edit to anything watching.
 *
 * A record in a terminal status (dismissed, saved, applied, expired) keeps that
 * status and its timestamps: a re-run must not resurrect a job the member has
 * already dealt with.
 *
 * Existing records NOT in the new set are preserved rather than deleted —
 * removing them is lifecycle work, which is Phase 8.
 */
export function mergeRecommendations(
  existing: readonly JobRecommendation[],
  incoming: readonly JobRecommendation[],
): JobRecommendation[] {
  const byId = new Map<string, JobRecommendation>();
  for (const record of existing) byId.set(record.id, record);

  for (const next of incoming) {
    const prev = byId.get(next.id);
    if (!prev) { byId.set(next.id, next); continue; }

    if (TERMINAL_STATUSES.has(prev.status)) continue;

    const unchanged = prev.score === next.score
      && prev.eligibility === next.eligibility
      && prev.atsScore === next.atsScore
      && JSON.stringify(prev.reasons) === JSON.stringify(next.reasons);
    if (unchanged) continue;

    byId.set(next.id, {
      ...next,
      /* The record is the same one; only its content moved on. */
      createdAt: prev.createdAt,
      status: prev.status,
    });
  }

  return Array.from(byId.values())
    .sort((a, b) => (b.score - a.score) || a.jobId.localeCompare(b.jobId));
}

/**
 * The member-facing queue: what to actually show, best first.
 *
 * Dismissed, applied and expired records are withheld. `saved` is kept, because
 * saving a job is interest, not dismissal.
 */
export function queuedRecommendations(
  records: readonly JobRecommendation[],
  limit = RECOMMENDATION_LIMIT,
): JobRecommendation[] {
  return records
    .filter((r) => r.status === 'recommended' || r.status === 'queued' || r.status === 'saved')
    .sort((a, b) => (b.score - a.score) || a.jobId.localeCompare(b.jobId))
    .slice(0, Math.max(0, limit));
}

/** Job ids this member has applied to, from the EXISTING application records. */
export function appliedJobIds(
  applications: readonly HiringJobApplication[],
  userId: string,
): Set<string> {
  return new Set(
    applications.filter((a) => a?.candidateUserId === userId).map((a) => a.jobId),
  );
}
