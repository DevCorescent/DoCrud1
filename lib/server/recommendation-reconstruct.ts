/**
 * Rebuilding a recommendation response from a persisted record.
 *
 * ═══ WHY THIS IS SEPARATE ═══
 *
 * The record stores the SCORING outcome and no job document. To answer a
 * request the canonical postings must be fetched from `hiring_jobs` and married
 * back to the stored scores — in the persisted order, which is the ranking the
 * scorer produced and must not be recomputed or re-sorted here.
 *
 * Pure: it is handed the canonical jobs rather than fetching them, so the
 * equivalence suite can prove reconstruction matches a live computation without
 * a database, and so the eventual read path owns the fetch.
 *
 * ═══ A MISSING POSTING IS DROPPED, NEVER INVENTED ═══
 *
 * A job can disappear between precomputation and a read — expired, closed,
 * removed at source. There is nothing honest to render for it, so it is
 * skipped. It is NOT replaced with a placeholder, and its absence is reported
 * so a caller can tell a short page from a wrong one.
 *
 * NOTHING CALLS THIS YET. No route reads precomputed records; this exists so
 * the reconstruction can be proven equivalent before any cutover.
 */
import type { StoredRecommendation } from '@/lib/server/db/recommendation-results';
import { isValidApplyUrl } from '@/lib/jobs-ui';
import { coerceJobUrgency } from '@/lib/job-urgency';

export interface ReconstructedRanking {
  /** Job cards in the persisted order, ready for personalizedPage. */
  rankedJobs: Array<Record<string, unknown>>;
  reasonsByJobId: Map<string, string[]>;
  summaryByJobId: Map<string, string>;
  factorsByJobId: Map<string, NonNullable<StoredRecommendation['factors']>>;
  missingByJobId: Map<string, string[]>;
  /** Persisted ids with no canonical posting — dropped, and counted. */
  missingJobIds: string[];
}

/**
 * Marry stored scores back to canonical postings.
 *
 * `canonicalById` is whatever the caller fetched. Order comes from `results`,
 * never from the map: the ranking is the stored one.
 */
export function reconstructRanking(
  results: ReadonlyArray<StoredRecommendation>,
  canonicalById: ReadonlyMap<string, Record<string, unknown>>,
): ReconstructedRanking {
  const rankedJobs: Array<Record<string, unknown>> = [];
  const reasonsByJobId = new Map<string, string[]>();
  const summaryByJobId = new Map<string, string>();
  const factorsByJobId = new Map<string, NonNullable<StoredRecommendation['factors']>>();
  const missingByJobId = new Map<string, string[]>();
  const missingJobIds: string[] = [];
  const seen = new Set<string>();

  for (const entry of results) {
    /* A duplicate id in the record is a defect upstream, not a decision to make
       here. The FIRST occurrence wins so a page can never show one posting
       twice, and the ranking stays the one that was stored. */
    if (seen.has(entry.jobId)) continue;
    seen.add(entry.jobId);

    const canonical = canonicalById.get(entry.jobId);
    if (!canonical) { missingJobIds.push(entry.jobId); continue; }

    /* The card the live path builds, with the stored score attached. Match
       fields are set only when the record carries them — the same
       omit-when-empty rule the live card uses, so the two serialise alike. */
    const job: Record<string, unknown> = { ...canonical, matchScore: entry.score, matchReasons: entry.reasons };
    if (entry.summary !== undefined) job.matchSummary = entry.summary;
    if (entry.factors !== undefined) job.matchFactors = entry.factors;
    if (entry.matchedSkills !== undefined) job.matchedSkills = entry.matchedSkills;
    if (entry.missingSkills !== undefined) job.missingSkills = entry.missingSkills;

    rankedJobs.push(job);
    reasonsByJobId.set(entry.jobId, entry.reasons);
    if (entry.summary !== undefined) summaryByJobId.set(entry.jobId, entry.summary);
    if (entry.factors !== undefined) factorsByJobId.set(entry.jobId, entry.factors);
    if (entry.missingSkills !== undefined) missingByJobId.set(entry.jobId, entry.missingSkills);
  }

  return { rankedJobs, reasonsByJobId, summaryByJobId, factorsByJobId, missingByJobId, missingJobIds };
}

/**
 * Rebuild the `recommended` / `row` CARDS from a persisted record.
 *
 * ═══ WHY THIS IS NOT `reconstructRanking` ═══
 *
 * Those two functions serve different scopes and must not be confused.
 *
 * `reconstructRanking` hands whole canonical postings to `personalizedPage`,
 * which RE-PROJECTS them into a `PersonalizedJobRow`. Spreading the full job
 * there is correct: the projection happens downstream.
 *
 * The `recommended` and `row` scopes have no such downstream step — the card
 * IS the response. Spreading the full posting would put `description`,
 * `requirements`, `contentHash`, `sourceUrl` and `minimumAtsScore` on the wire,
 * none of which the live card exposes. That is both a contract change and an
 * ingestion-metadata leak, so this rebuilds the exact projection the live path
 * produces, field for field, including the four-skill cap and the
 * omit-when-empty match fields.
 *
 * Pure: canonical postings are supplied, never fetched.
 */
export function reconstructRecommendedCards(
  results: ReadonlyArray<StoredRecommendation>,
  canonicalById: ReadonlyMap<string, Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const cards: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const entry of results) {
    if (seen.has(entry.jobId)) continue;
    seen.add(entry.jobId);
    const j = canonicalById.get(entry.jobId);
    if (!j) continue; // vanished posting — dropped, never invented

    const card: Record<string, unknown> = {
      id: String(j.id ?? ''),
      title: String(j.title ?? '') || 'Open role',
      organizationName: String(j.organizationName ?? ''),
      location: String(j.location ?? ''),
      employmentType: String(j.employmentType ?? ''),
      workMode: String(j.workMode ?? ''),
      preferredSkills: (Array.isArray(j.preferredSkills) ? j.preferredSkills as string[] : []).slice(0, 4),
      applyUrl: isValidApplyUrl(String(j.applyUrl ?? '')) ? String(j.applyUrl) : '',
      createdAt: String(j.createdAt ?? ''),
    };
    const urgency = coerceJobUrgency(j.hiringUrgency);
    if (urgency) card.hiringUrgency = urgency;

    card.matchScore = entry.score;
    card.matchReasons = entry.reasons;
    if (entry.summary !== undefined) card.matchSummary = entry.summary;
    if (entry.factors !== undefined) card.matchFactors = entry.factors;
    if (entry.matchedSkills !== undefined) card.matchedSkills = entry.matchedSkills;
    if (entry.missingSkills !== undefined) card.missingSkills = entry.missingSkills;

    cards.push(card);
  }
  return cards;
}
