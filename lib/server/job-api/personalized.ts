/**
 * Phase 11 (backend minimum) — the personalized recommendation page.
 *
 * WHY THIS EXISTS. The live recommendation route ranks jobs with
 * lib/server/job-recommend.ts, which is a DIFFERENT scorer from the Phase 6 ATS
 * engine. Its number is a relevance score, not an ATS match, so the UI could not
 * honestly print "ATS Match 94%" from it. This module adds the three facts the
 * recommendation feed was missing, using the engines that already own them:
 *
 *   1. the ATS score and band            → lib/server/job-sources/ats-match.ts   (Phase 6)
 *   2. eligibility                       → lib/server/job-sources/eligibility.ts (Phase 5)
 *   3. already-applied jobs are excluded → the caller's application list
 *
 * NOTHING IS RE-IMPLEMENTED HERE. No scoring, no eligibility rules, no ranking.
 * The ranked order arrives from the caller and is preserved exactly.
 *
 * ═══ WHY ENRICHMENT HAPPENS AFTER PAGING ═══
 *
 * A full ATS evaluation parses a résumé against a job description. Running it
 * across every recommended job would mean hundreds of evaluations to render
 * twenty rows. So the list is EXCLUDED and PAGED first, and only the page that
 * is actually being returned is enriched — bounded work per request, no matter
 * how large the corpus grows.
 *
 * PURE. No fetch, no database, no session. The caller supplies the jobs, the
 * candidate and the applied set; this decides nothing about who may see what.
 */
import type { HiringJobPosting } from '@/types/document';
import {
  evaluateJobMatch, normalizeCandidateForMatch, type MatchCandidate,
} from '@/lib/server/job-sources/ats-match';
import {
  evaluateJobEligibility, type EligibilityProfile,
} from '@/lib/server/job-sources/eligibility';
import { paginate, type Page } from './queries';

export interface PersonalizedJobRow {
  id: string;
  title: string;
  organizationName: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  createdAt?: string;
  applyUrl?: string;
  preferredSkills?: string[];
  /** The live relevance scorer's own explanations. Passed through, never invented. */
  matchReasons: string[];
  /**
   * One sentence naming why this posting suits this viewer, from the same
   * scorer. Empty when there is no real overlap to describe — a job with none
   * of your skills is not made suitable by being nearby, and saying so would
   * teach people to distrust every other sentence here.
   */
  matchSummary?: string;
  /** Per-dimension breakdown from the relevance scorer, strongest first. */
  matchFactors?: Array<{ kind: string; label: string; detail: string; points: number; max: number }>;
  /**
   * The RELEVANCE scorer's view of what the posting asks for and the profile
   * does not show. Kept separate from `missingRequiredSkills`, which is the
   * ATS résumé pass — two different questions, and merging them would make
   * both unreadable.
   */
  relevanceMissingSkills?: string[];
  /**
   * Phase 6 ATS. NULL — not 0 — when there is not enough of a candidate to
   * score: a member with no profile and no résumé has an unknown match, and
   * printing "0%" would tell them they are a bad fit when nobody has looked.
   */
  atsScore: number | null;
  atsBand: string | null;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  /** Phase 5. NULL when no preferences are stated — never guessed. */
  eligibility: { status: string; reasons: string[] } | null;
}

/**
 * A hard ceiling on how many rows one request will ATS-evaluate.
 *
 * The page size is already clamped upstream, but this is the guarantee that
 * matters: no query string can turn one request into hundreds of résumé
 * parses.
 */
export const MAX_ENRICHED_PER_PAGE = 25;

export interface PersonalizedInput {
  /** Already ranked by the caller. THIS ORDER IS PRESERVED. */
  rankedJobs: readonly HiringJobPosting[];
  /** Null when the viewer has no usable profile or résumé signals. */
  candidate: MatchCandidate | null;
  /** Job ids this viewer has already applied to. */
  appliedJobIds?: ReadonlySet<string>;
  /** Null when the viewer has stated no preferences. */
  eligibilityProfile?: EligibilityProfile | null;
  /** Reasons from the live relevance scorer, keyed by job id. */
  reasonsByJobId?: ReadonlyMap<string, string[]>;
  /** Same source, same pass: the scorer's one-sentence "why", by job id. */
  summaryByJobId?: ReadonlyMap<string, string>;
  /** Same source, same pass: the scorer's per-dimension breakdown, by job id. */
  factorsByJobId?: ReadonlyMap<string, Array<{ kind: string; label: string; detail: string; points: number; max: number }>>;
  /** Requirements the posting leans on that the viewer does not show, by job id. */
  missingByJobId?: ReadonlyMap<string, string[]>;
  page?: unknown;
  pageSize?: unknown;
}

/**
 * Build one page of personalized recommendations.
 *
 * Order of operations is deliberate and is the whole design:
 *   exclude applied → paginate → enrich the page only.
 */
export function personalizedPage(input: PersonalizedInput): Page<PersonalizedJobRow> & {
  /** True when an ATS score could be computed at all. Lets the UI explain a blank. */
  scored: boolean;
} {
  const applied = input.appliedJobIds ?? new Set<string>();

  /* EXCLUDED FIRST, so a job the viewer already applied to never occupies a
     slot on the page — filtering after paging would leave holes and make the
     total a lie. */
  const eligible = input.rankedJobs.filter((job) => job?.id && !applied.has(job.id));

  const page = paginate(eligible, input.page, input.pageSize);
  const slice = page.items.slice(0, MAX_ENRICHED_PER_PAGE);

  const candidate = input.candidate;
  const prefs = input.eligibilityProfile;

  /* ONE CANDIDATE, MANY JOBS. The résumé is identical for every job on this
     page, so it is normalized once here rather than once per job. Scores are
     unchanged — the same normalized résumé the per-job path would have built,
     built once. */
  const sharedResume = candidate ? normalizeCandidateForMatch(candidate) : undefined;

  const items: PersonalizedJobRow[] = slice.map((job) => {
    const row: PersonalizedJobRow = {
      id: String(job.id),
      title: String(job.title ?? '') || 'Open role',
      organizationName: String(job.organizationName ?? ''),
      location: job.location || undefined,
      workMode: job.workMode || undefined,
      employmentType: job.employmentType || undefined,
      createdAt: job.createdAt || undefined,
      applyUrl: job.applyUrl || undefined,
      preferredSkills: Array.isArray(job.preferredSkills)
        ? job.preferredSkills.slice(0, 8) : undefined,
      matchReasons: input.reasonsByJobId?.get(String(job.id)) ?? [],
      matchSummary: input.summaryByJobId?.get(String(job.id)) || undefined,
      matchFactors: input.factorsByJobId?.get(String(job.id)),
      relevanceMissingSkills: input.missingByJobId?.get(String(job.id)),
      atsScore: null,
      atsBand: null,
      matchedSkills: [],
      missingRequiredSkills: [],
      missingPreferredSkills: [],
      eligibility: null,
    };

    if (candidate) {
      /* Phase 6, unmodified. A failure on one job must not take the page down
         with it — that job simply carries no score. */
      try {
        const match = evaluateJobMatch(job, candidate, { resume: sharedResume });
        row.atsScore = match.score;
        row.atsBand = match.band;
        row.matchedSkills = match.matchedSkills.slice(0, 12);
        row.missingRequiredSkills = match.missingRequiredSkills.slice(0, 12);
        row.missingPreferredSkills = match.missingPreferredSkills.slice(0, 12);
      } catch { /* unscored, not zero-scored */ }
    }

    if (prefs) {
      try {
        const verdict = evaluateJobEligibility(job, prefs);
        /* `unknown` is a real Phase 5 outcome and is passed through as-is.
           It means neither side stated enough to decide — collapsing it into
           "ineligible" would reject a candidate on missing information. */
        row.eligibility = { status: verdict.status, reasons: verdict.reasons };
      } catch { /* left null */ }
    }

    return row;
  });

  return { items, page: page.page, pageSize: page.pageSize, total: page.total, scored: Boolean(candidate) };
}
