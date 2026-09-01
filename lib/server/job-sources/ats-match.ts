/**
 * Phase 6 — ATS matching and ranking.
 *
 * Answers "how strongly does this candidate match this job?" and nothing else.
 * Phase 5 answers whether they are eligible at all; the two are kept in
 * SEPARATE fields of the result and are never blended, because they mean
 * different things: eligibility is a gate, a match score is a ranking signal.
 *
 * WHAT THIS IS NOT. It is not a probability of being hired, and must never be
 * labelled as one. A score of 94 says the posting's stated requirements are
 * well covered by what this candidate has written down — nothing about
 * interviews, competition, or the employer's judgement.
 *
 * ═══ WHAT IT REUSES, AND WHY THERE IS NO SECOND ENGINE ═══
 *
 * The repository ALREADY has a complete ATS engine at lib/server/ats: a skill
 * taxonomy with alias resolution, a JD normalizer that assigns each
 * requirement a must/important/nice importance, and keyword, impact and
 * alignment analysers. Rebuilding any of that here would create a second set
 * of scoring rules that would immediately start drifting from the first.
 *
 * So this module is an ADAPTER plus the two structured signals that engine
 * cannot see, because they live on the canonical job rather than in its text:
 *
 *   · lib/server/ats            -> skills, requirements, responsibilities,
 *                                  education, impact, alignment
 *   · Phase 4 `domain`/`subDomain` -> domain affinity
 *   · explicit `minExperienceYears` -> years compatibility
 *   · Phase 5 evaluateJobEligibility -> the gate, reported separately
 *
 * ═══ MISSING DATA IS NEVER A ZERO ═══
 *
 * A component with nothing to measure returns null and is DROPPED from the
 * weighting, with its weight redistributed across the components that do have
 * data. Scoring an absent signal as 0 would punish a candidate for a field the
 * employer never filled in, which is the single easiest way to make a ranking
 * quietly wrong.
 */
import type { HiringJobPosting, DocrudianProfile } from '@/types/document';
import {
  evaluateAts, scoreBand,
  type AtsEvaluation, type ParsedResumeInput,
} from '@/lib/server/ats';
import { resolveSurface, isChildOf } from '@/lib/server/ats/skill-taxonomy';
import {
  evaluateJobEligibility, type EligibilityProfile, type JobEligibilityResult,
} from './eligibility';

/* ── Inputs ───────────────────────────────────────────────────────────────*/

/**
 * One candidate.
 *
 * `profile` and `resume` are the repository's EXISTING shapes — no new
 * candidate model is introduced. A candidate with only a profile scores
 * perfectly well; a parsed resume simply gives the engine more to read.
 */
export interface MatchCandidate {
  /** Stable identity. Used for the ranking tie-break, so it must not change. */
  id: string;
  profile?: Partial<Pick<DocrudianProfile,
    'headline' | 'bio' | 'location' | 'domain' | 'skills' | 'interests'>>;
  /** Docrud's already-parsed resume, when the member has one. */
  resume?: ParsedResumeInput;
  /** Raw resume text. Improves section detection only. */
  resumeText?: string;
  /** Years the candidate HAS. Explicit only — never inferred from a title. */
  experienceYears?: number;
  /** Phase 4 sub-domain the candidate works in, when known. */
  subDomain?: string;
  /** Phase 5 input. Absent means the gate simply finds nothing to enforce. */
  eligibility?: EligibilityProfile;
}

/* ── Result ───────────────────────────────────────────────────────────────*/

/**
 * Per-component scores, 0..100, or null where there was nothing to measure.
 *
 * These are for EXPLANATION. Only the components listed in `WEIGHTS` drive the
 * total; the rest are reported because an employer asking "why 94?" deserves
 * the parts, not just the number.
 */
export interface MatchBreakdown {
  skills: number | null;
  requiredSkills: number | null;
  preferredSkills: number | null;
  experience: number | null;
  domain: number | null;
  responsibilities: number | null;
  requirements: number | null;
  education: number | null;
}

export interface JobMatchResult {
  candidateId: string;
  /** 0..100, integer. Never negative, never above 100, never a fraction. */
  score: number;
  band: string;
  breakdown: MatchBreakdown;
  /** Which components actually contributed, and at what weight. Auditable. */
  contributions: Array<{ component: string; score: number; weight: number }>;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  matchedRequirements: string[];
  missingRequirements: string[];
  /**
   * Phase 5's verdict, carried through UNCHANGED and never folded into
   * `score`. An ineligible candidate can still have a high score; it is the
   * caller's job to respect the gate.
   */
  eligibility: JobEligibilityResult;
  explanation: string[];
}

/**
 * The weights that produce the final score.
 *
 * `skills` dominates because a posting's requirements are the thing an ATS is
 * actually for. Domain and experience are deliberately modest: they are coarse
 * signals, and over-weighting them would rank a same-domain novice above a
 * cross-domain expert.
 *
 * Note `requiredSkills` is NOT weighted separately even though it is reported:
 * the keyword analyser already weights must-have requirements three times a
 * nice-to-have, so adding it again would count the same evidence twice.
 */
const WEIGHTS: Record<string, number> = {
  skills: 0.42,
  experience: 0.18,
  responsibilities: 0.15,
  domain: 0.15,
  education: 0.10,
};

const clamp01to100 = (n: number): number => Math.max(0, Math.min(100, n));

/* ── Adapters ─────────────────────────────────────────────────────────────*/

/**
 * The canonical job as the JD text the existing engine parses.
 *
 * Assembled in importance order — title, then the explicit requirement lists,
 * then prose — because `normalizeJd` reads sentence wording to decide whether
 * a requirement is a must or a nice-to-have, and the structured lists are the
 * employer's own statement of what matters.
 */
export function buildJobDescriptionText(job: Partial<HiringJobPosting>): string {
  const parts: string[] = [];

  /* THE MARKER GOES ON EVERY LINE, not just the heading.
     `normalizeJd` decides must/important/nice per SENTENCE, and it splits
     sentences on newlines — so a "Requirements:" heading above a list of bare
     skill names never reaches those lines, and every requirement came back as
     merely `important`. Measured: the canonical `requirements` array produced
     no must-haves at all until each line carried the word itself. Suffixing
     each line is how the canonical job's structured lists are expressed in the
     text form the existing engine parses, with no change to that engine. */
  const push = (lines: string[] | undefined, suffix: string) => {
    const clean = (lines ?? []).map((l) => String(l ?? '').trim()).filter(Boolean);
    if (clean.length) parts.push(clean.map((l) => `- ${l}${suffix}`).join('\n'));
  };

  if (job.description) parts.push(String(job.description).trim());
  push(job.requirements, ' (required)');
  push(job.responsibilities, '');
  push(job.preferredSkills, ' (preferred)');
  return parts.join('\n\n').trim();
}

/**
 * The candidate as the parsed-resume shape the existing engine reads.
 *
 * A supplied resume wins field by field; the profile fills the gaps. Nothing
 * is fabricated — a candidate with neither yields an empty input, which the
 * engine handles and which this module reports as an unscoreable component
 * rather than as a zero.
 */
export function buildCandidateResume(candidate: MatchCandidate): ParsedResumeInput {
  const p = candidate.profile ?? {};
  const r = candidate.resume ?? {};
  const skills = Array.from(new Set([
    ...(r.skills ?? []),
    ...(p.skills ?? []),
    ...(p.interests ?? []),
  ].map((s) => String(s ?? '').trim()).filter(Boolean)));

  return {
    headline: r.headline ?? p.headline ?? null,
    bio: r.bio ?? p.bio ?? null,
    location: r.location ?? p.location ?? null,
    skills,
    experience: r.experience ?? [],
    education: r.education ?? [],
    achievements: r.achievements ?? [],
    certifications: r.certifications ?? [],
  };
}

/* ── Components the text engine cannot see ────────────────────────────────*/

/**
 * Domain affinity, from the Phase 4 classification.
 *
 * Exact domain and sub-domain is a full match; same domain, different
 * sub-domain is partial, because a frontend engineer is a real candidate for a
 * backend role in a way a marketer is not. A low-confidence classification
 * returns null: the classifier itself is unsure, so ranking on it would give a
 * guess the authority of a measurement.
 */
export function domainScore(
  job: Partial<HiringJobPosting>,
  candidate: MatchCandidate,
): number | null {
  const jobDomain = String(job.domain ?? '').trim().toLowerCase();
  const candDomain = String(candidate.profile?.domain ?? '').trim().toLowerCase();
  if (!jobDomain || !candDomain) return null;
  if (typeof job.domainConfidence === 'number' && job.domainConfidence < 0.4) return null;

  if (jobDomain !== candDomain) return 0;

  const jobSub = String(job.subDomain ?? '').trim().toLowerCase();
  const candSub = String(candidate.subDomain ?? '').trim().toLowerCase();
  if (!jobSub || !candSub) return 85;       // right domain, sub-domain unstated
  return jobSub === candSub ? 100 : 70;     // right domain, different specialism
}

/**
 * Experience compatibility, from EXPLICIT years on both sides only.
 *
 * Never derived from a title. The repository can infer a seniority band from a
 * member's past job titles, and that is fine for a soft recommendation, but
 * here it would let the word "Senior" move a ranking.
 *
 * Meeting the requirement scores full. Falling short degrades smoothly rather
 * than dropping to zero — one year short of five is a real candidate.
 */
export function experienceScore(
  job: Partial<HiringJobPosting>,
  candidate: MatchCandidate,
): number | null {
  const has = candidate.experienceYears;
  const needs = job.minExperienceYears;
  if (typeof has !== 'number' || !Number.isFinite(has) || has < 0) return null;
  if (typeof needs !== 'number' || !Number.isFinite(needs) || needs < 0) return null;
  if (needs === 0) return 100;
  if (has >= needs) return 100;
  return clamp01to100(Math.round((has / needs) * 100));
}

/* ── Skills, read off the existing keyword analysis ───────────────────────*/

interface SkillSplit {
  matched: string[];
  missingRequired: string[];
  missingPreferred: string[];
  requiredScore: number | null;
  preferredScore: number | null;
}

/**
 * Split the engine's requirement matches by the importance it already assigned.
 *
 * `must` is treated as required; `important` and `nice` as preferred. That
 * mapping is the repository's existing representation — the canonical job has
 * no separate "required skills" array, and inventing one for this phase would
 * add a field nothing else writes.
 */
function splitSkills(ats: AtsEvaluation): SkillSplit {
  const matched: string[] = [];
  const missingRequired: string[] = [];
  const missingPreferred: string[] = [];
  let reqEarned = 0; let reqTotal = 0;
  let prefEarned = 0; let prefTotal = 0;

  for (const m of ats.keyword.matches) {
    const required = m.requirement.importance === 'must';
    const hit = m.credit > 0;
    if (hit) matched.push(m.requirement.canonical);
    else if (required) missingRequired.push(m.requirement.canonical);
    else missingPreferred.push(m.requirement.canonical);

    if (required) { reqTotal += 1; reqEarned += m.credit; }
    else { prefTotal += 1; prefEarned += m.credit; }
  }

  return {
    matched: Array.from(new Set(matched)).sort(),
    missingRequired: Array.from(new Set(missingRequired)).sort(),
    missingPreferred: Array.from(new Set(missingPreferred)).sort(),
    requiredScore: reqTotal ? clamp01to100(Math.round((reqEarned / reqTotal) * 100)) : null,
    preferredScore: prefTotal ? clamp01to100(Math.round((prefEarned / prefTotal) * 100)) : null,
  };
}

/**
 * Education, only when BOTH sides state something.
 *
 * The engine's alignment analysis already reads education requirements out of
 * the JD; this reports a score only when the job asked and the candidate
 * listed a qualification. Absent on either side is null, never a penalty — a
 * missing degree field is not a failed requirement.
 */
function educationScore(ats: AtsEvaluation, resume: ParsedResumeInput): number | null {
  const jobAsks = ats.keyword.matches.some((m) => m.requirement.kind === 'education');
  const hasEducation = (resume.education ?? []).some(
    (e) => String(e?.degree ?? '').trim() || String(e?.school ?? '').trim(),
  );
  if (!jobAsks) return null;
  if (!hasEducation) return null;
  const match = ats.keyword.matches.find((m) => m.requirement.kind === 'education');
  return match ? clamp01to100(Math.round(match.credit * 100)) : null;
}

/* ── The evaluator ────────────────────────────────────────────────────────*/

/**
 * Score one candidate against one job.
 *
 * Deterministic and pure: no clock, no randomness, no network, no database,
 * and neither argument is mutated.
 */
export function evaluateJobMatch(
  job: HiringJobPosting,
  candidate: MatchCandidate,
): JobMatchResult {
  const resume = buildCandidateResume(candidate);
  const jdText = buildJobDescriptionText(job);

  const ats = evaluateAts({
    resume,
    resumeText: candidate.resumeText ?? '',
    jobDescription: jdText,
    jobTitle: String(job.title ?? ''),
  });

  const skills = splitSkills(ats);
  const hasAnyRequirement = ats.keyword.matches.length > 0;

  const breakdown: MatchBreakdown = {
    /* Null when the JD stated no recognisable requirement at all — there is
       then nothing to have matched, and 0 would be a verdict on the candidate
       for the employer's empty posting. */
    skills: hasAnyRequirement ? clamp01to100(Math.round(ats.keyword.score)) : null,
    requiredSkills: skills.requiredScore,
    preferredSkills: skills.preferredScore,
    experience: experienceScore(job, candidate),
    domain: domainScore(job, candidate),
    responsibilities: hasAnyRequirement ? clamp01to100(Math.round(ats.alignment.score)) : null,
    requirements: skills.requiredScore ?? skills.preferredScore,
    education: educationScore(ats, resume),
  };

  /* The experience component prefers explicit years; where the job states none
     it falls back to the engine's evidence-based impact score, which measures
     what the candidate has DONE rather than how long they have done it. */
  const experienceComponent = breakdown.experience
    ?? (resume.experience && resume.experience.length ? clamp01to100(Math.round(ats.impact.score)) : null);

  const components: Record<string, number | null> = {
    skills: breakdown.skills,
    experience: experienceComponent,
    responsibilities: breakdown.responsibilities,
    domain: breakdown.domain,
    education: breakdown.education,
  };

  /* Weight redistribution: only components with data participate, and their
     weights are renormalised so the score still spans 0..100. */
  const active = Object.entries(components)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number');
  const totalWeight = active.reduce((sum, [name]) => sum + (WEIGHTS[name] ?? 0), 0);

  const contributions = active
    .map(([name, value]) => ({
      component: name,
      score: value,
      weight: totalWeight > 0 ? Math.round(((WEIGHTS[name] ?? 0) / totalWeight) * 1000) / 1000 : 0,
    }))
    /* Sorted by name so the array is byte-identical for identical inputs. */
    .sort((a, b) => a.component.localeCompare(b.component));

  const score = totalWeight > 0
    ? clamp01to100(Math.round(contributions.reduce((sum, c) => sum + c.score * c.weight, 0)))
    : 0;

  const eligibility = evaluateJobEligibility(job, candidate.eligibility ?? {});

  const explanation: string[] = [];
  if (!active.length) {
    explanation.push('Not enough information on either side to score this match.');
  } else {
    for (const c of contributions) {
      explanation.push(`${c.component}: ${c.score}/100 (weight ${Math.round(c.weight * 100)}%)`);
    }
  }
  if (skills.missingRequired.length) {
    explanation.push(`Missing required: ${skills.missingRequired.join(', ')}`);
  }
  if (eligibility.status !== 'eligible') {
    explanation.push(`Eligibility is "${eligibility.status}" — this is separate from the match score.`);
  }

  return {
    candidateId: candidate.id,
    score,
    band: scoreBand(score),
    breakdown,
    contributions,
    matchedSkills: skills.matched,
    missingRequiredSkills: skills.missingRequired,
    missingPreferredSkills: skills.missingPreferred,
    matchedRequirements: skills.matched,
    missingRequirements: [...skills.missingRequired, ...skills.missingPreferred].sort(),
    eligibility,
    explanation,
  };
}

/* ── Ranking ──────────────────────────────────────────────────────────────*/

/**
 * Rank candidates for one job, best first.
 *
 * Ties break on `candidateId`, ascending — a stable property of the data
 * rather than of the run. Deliberately NOT the current time, insertion order
 * or array position: all three would reorder identical inputs between calls,
 * and an employer refreshing a shortlist must not see it shuffle.
 *
 * Eligibility does NOT reorder anything here. The gate and the ranking are
 * separate concerns, and a caller that wants to hide ineligible candidates
 * filters on `result.eligibility.status` — a decision this function must not
 * make on its behalf.
 */
export function rankCandidates(
  job: HiringJobPosting,
  candidates: MatchCandidate[],
): JobMatchResult[] {
  return candidates
    .map((c) => evaluateJobMatch(job, c))
    .sort((a, b) => (b.score - a.score) || a.candidateId.localeCompare(b.candidateId));
}

/**
 * Whether a canonical skill counts as covering another.
 *
 * Exposed for callers that need the repository's alias rules without running a
 * whole evaluation. It is the taxonomy's own answer, so "React.js" covers
 * "React" while "Java" never covers "JavaScript".
 */
export function skillCovers(candidateSkill: string, requiredSkill: string): boolean {
  const a = resolveSurface(candidateSkill);
  const b = resolveSurface(requiredSkill);
  if (!a || !b) return false;
  return a === b || isChildOf(a, b);
}
