/**
 * User eligibility — a HARD GATE, not a score.
 *
 * Answers one question: is there anything in what the user has explicitly
 * asked for that this job demonstrably contradicts? It produces no percentage,
 * no ranking and no similarity. Phase 6 does matching; this decides only
 * whether a job may reach it.
 *
 * THE GOVERNING PRINCIPLE: MISSING INFORMATION IS NEVER A FAILURE.
 * Every rule below can only fail on facts BOTH sides actually stated. A job
 * with no salary cannot fail a salary rule; a user with no location
 * requirement cannot fail a location rule. Silence is not evidence, and the
 * cost of the two mistakes is not symmetric — wrongly showing a job is an
 * annoyance, wrongly hiding one is a job the member never learns exists.
 *
 * WHY THERE ARE THREE OUTCOMES, NOT TWO:
 *   · `eligible`   — nothing the user asked for is contradicted.
 *   · `ineligible` — at least one stated requirement is demonstrably broken.
 *   · `unknown`    — the user asked for something the job does not state, so
 *                    the question genuinely cannot be answered. This is NOT a
 *                    soft rejection; it is a caller's decision what to do with
 *                    it, and it exists precisely so that "we don't know" can
 *                    never be silently recorded as "no".
 *
 * PURE. No clock, no randomness, no network, no database, no mutation of its
 * inputs. The same job and profile always produce the same result.
 */
import type { HiringJobPosting } from '@/types/document';
import { classifyLocation } from './location';

/* ── Contract ─────────────────────────────────────────────────────────────*/

export type EligibilityStatus = 'eligible' | 'ineligible' | 'unknown';

export type EligibilityReason =
  | 'LOCATION_MISMATCH'
  | 'WORK_MODE_MISMATCH'
  | 'EMPLOYMENT_TYPE_MISMATCH'
  | 'EXPERIENCE_MISMATCH'
  | 'DOMAIN_MISMATCH'
  | 'SALARY_MISMATCH';

/** The rules this layer knows about. Stable strings, safe to log. */
export const ELIGIBILITY_RULES = [
  'location', 'workMode', 'employmentType', 'experience', 'domain', 'salary',
] as const;
export type EligibilityRule = typeof ELIGIBILITY_RULES[number];

/**
 * What the evaluator needs to know about the user.
 *
 * EVERY FIELD IS OPTIONAL, and that is the contract, not an oversight: an
 * absent field means "the user has not asked for this", and a rule with
 * nothing to enforce cannot reject anything.
 *
 * This is NOT a new profile model. It is the input shape for one pure
 * function, built from the existing DocrudianProfile by
 * `buildEligibilityProfile` below. Nothing here is stored.
 */
export interface EligibilityProfile {
  /** ISO 3166-1 alpha-2 codes the user will work in, e.g. ['IN']. */
  countries?: string[];
  /** Canonical city names, as produced by the Phase 4 location classifier. */
  cities?: string[];
  workModes?: Array<'remote' | 'hybrid' | 'onsite'>;
  /** Canonical employment types (`full_time`, `contract`, …). */
  employmentTypes?: string[];
  /** Phase 4 domain keys. Never a free-text label. */
  domains?: string[];
  /**
   * Years of experience the user HAS.
   *
   * Only ever compared against a job's own explicitly stated
   * `minExperienceYears`. It is never derived from a job title — see the note
   * on `buildEligibilityProfile`.
   */
  experienceYears?: number;
  /** The least the user will accept, in `salaryCurrency` per `salaryPeriod`. */
  minSalary?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

export interface JobEligibilityResult {
  status: EligibilityStatus;
  /** Every rule that failed, not just the first. Order follows ELIGIBILITY_RULES. */
  reasons: EligibilityReason[];
  /** Rules that had enough information from BOTH sides to reach a verdict. */
  evaluatedRules: EligibilityRule[];
  /** Rules the user asked for that the job does not state. */
  unknownRules: EligibilityRule[];
}

/** What one rule can conclude. `n/a` means the user asked for nothing here. */
type Verdict = 'pass' | 'fail' | 'unknown' | 'n/a';

/* ── Helpers ──────────────────────────────────────────────────────────────*/

const lower = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** A non-empty, lower-cased, de-duplicated list, or undefined. */
function list(values: readonly string[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = Array.from(new Set(values.map(lower).filter(Boolean)));
  return out.length ? out : undefined;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/* ── Rules ────────────────────────────────────────────────────────────────*/

/**
 * Location.
 *
 * A remote job that the user is willing to work remotely is not bound to a
 * city, so a city requirement does not apply to it — that is the one place
 * where work mode legitimately changes the location question. A remote job
 * whose `remoteEligibleRegions` are stated is still checked against them: a
 * "remote (US only)" role is genuinely closed to someone who can only work in
 * India, and the canonical model carries that field precisely so it is not
 * assumed open.
 *
 * Multi-location postings use EVERY city named, via the Phase 4 classifier, so
 * "Bengaluru / Hyderabad / Pune" satisfies a user who wants any one of them.
 */
function locationRule(job: HiringJobPosting, user: EligibilityProfile): { verdict: Verdict } {
  const wantCountries = list(user.countries);
  const wantCities = list(user.cities);
  if (!wantCountries && !wantCities) return { verdict: 'n/a' };

  const remoteJob = lower(job.workMode) === 'remote';
  const userAcceptsRemote = (list(user.workModes) ?? []).includes('remote');

  /* A remote role the user can take remotely: region limits still bind, but a
     city requirement does not. */
  if (remoteJob && userAcceptsRemote) {
    const regions = list(job.remoteEligibleRegions);
    if (wantCountries && regions) {
      return { verdict: regions.some((r) => wantCountries.includes(r)) ? 'pass' : 'fail' };
    }
    /* No stated region limit means the posting did not say — not that it is
       worldwide. With nothing to compare, the rule cannot fail. */
    return { verdict: 'pass' };
  }

  /* Country first: it is the coarser, more reliable fact. */
  if (wantCountries) {
    const jobCountry = lower(job.country);
    if (jobCountry && !wantCountries.includes(jobCountry)) return { verdict: 'fail' };
    if (!jobCountry && !job.location) return { verdict: 'unknown' };
  }

  if (wantCities) {
    /* Re-derived from the raw location so a multi-location posting keeps all
       of its cities; `job.city` is deliberately absent on those. Reuses the
       Phase 4 classifier — no second parser. */
    const cities = classifyLocation(String(job.location ?? '')).cities.map(lower);
    const stored = lower(job.city);
    const all = cities.length ? cities : (stored ? [stored] : []);
    if (!all.length) {
      /* The job states no city we recognise. Unknown, never a mismatch. */
      return { verdict: wantCountries && lower(job.country) ? 'pass' : 'unknown' };
    }
    return { verdict: all.some((c) => wantCities.includes(c)) ? 'pass' : 'fail' };
  }

  return { verdict: lower(job.country) ? 'pass' : 'unknown' };
}

/** Work mode. Fails only when both sides state a mode and none overlaps. */
function workModeRule(job: HiringJobPosting, user: EligibilityProfile): { verdict: Verdict } {
  const want = list(user.workModes);
  if (!want) return { verdict: 'n/a' };
  const mode = lower(job.workMode);
  /* An absent or unrecognised mode is not evidence of anything. Notably, a
     job with no location is NOT treated as remote. */
  if (!mode || !['remote', 'hybrid', 'onsite'].includes(mode)) return { verdict: 'unknown' };
  return { verdict: want.includes(mode) ? 'pass' : 'fail' };
}

/** Employment type, against the Phase 3 canonical enum values. */
function employmentTypeRule(job: HiringJobPosting, user: EligibilityProfile): { verdict: Verdict } {
  const want = list(user.employmentTypes);
  if (!want) return { verdict: 'n/a' };
  const type = lower(job.employmentType);
  if (!type) return { verdict: 'unknown' };
  return { verdict: want.includes(type) ? 'pass' : 'fail' };
}

/**
 * Experience.
 *
 * ONLY explicit years on both sides. The job must state
 * `minExperienceYears`, and the user must state how many years they have.
 *
 * A job's `experienceLevel` ("senior") is deliberately NOT used: it is a band,
 * not a requirement, and the repository's `deriveExperienceLevel` builds the
 * user's side of that comparison by pattern-matching their job TITLES. Gating
 * on it would reject someone for having written "Senior" — or never written
 * it — rather than for anything the employer actually required.
 */
function experienceRule(job: HiringJobPosting, user: EligibilityProfile): { verdict: Verdict } {
  if (!isFiniteNumber(user.experienceYears) || user.experienceYears < 0) return { verdict: 'n/a' };
  const required = job.minExperienceYears;
  if (!isFiniteNumber(required) || required < 0) return { verdict: 'unknown' };
  return { verdict: user.experienceYears >= required ? 'pass' : 'fail' };
}

/**
 * Domain, against the Phase 4 classification.
 *
 * A low-confidence classification is treated as UNKNOWN rather than as a
 * mismatch — the model's own note says low confidence must route to review and
 * never silently to a user, and rejecting on a label the classifier itself is
 * unsure of would do exactly that.
 */
const MIN_DOMAIN_CONFIDENCE = 0.4;

function domainRule(job: HiringJobPosting, user: EligibilityProfile): { verdict: Verdict } {
  const want = list(user.domains);
  if (!want) return { verdict: 'n/a' };
  const domain = lower(job.domain);
  if (!domain) return { verdict: 'unknown' };
  if (isFiniteNumber(job.domainConfidence) && job.domainConfidence < MIN_DOMAIN_CONFIDENCE) {
    return { verdict: 'unknown' };
  }
  return { verdict: want.includes(domain) ? 'pass' : 'fail' };
}

/**
 * Salary.
 *
 * Comparable only when the currency AND the period agree. Comparing an annual
 * rupee figure to a monthly dollar one produces a confident, wrong answer, so
 * a mismatch in either makes the rule UNKNOWN rather than guessing a
 * conversion. Nothing here estimates, converts or fetches a rate.
 *
 * The job's MAXIMUM is what is compared: a range of 5-8 satisfies a user
 * asking for 7, because the employer stated they will pay up to 8. Where only
 * a minimum is stated, that is used instead.
 */
function salaryRule(job: HiringJobPosting, user: EligibilityProfile): { verdict: Verdict } {
  if (!isFiniteNumber(user.minSalary) || user.minSalary <= 0) return { verdict: 'n/a' };

  const ceiling = isFiniteNumber(job.salaryMax) && job.salaryMax > 0
    ? job.salaryMax
    : (isFiniteNumber(job.salaryMin) && job.salaryMin > 0 ? job.salaryMin : null);
  if (ceiling === null) return { verdict: 'unknown' };

  /* Units must match to compare at all. When the user did not state units, the
     job's are taken as given rather than assumed to differ. */
  if (user.salaryCurrency && lower(user.salaryCurrency) !== lower(job.salaryCurrency)) {
    return { verdict: 'unknown' };
  }
  if (user.salaryPeriod && lower(user.salaryPeriod) !== lower(job.salaryPeriod)) {
    return { verdict: 'unknown' };
  }
  return { verdict: ceiling >= user.minSalary ? 'pass' : 'fail' };
}

const RULES: Record<EligibilityRule, {
  run: (job: HiringJobPosting, user: EligibilityProfile) => { verdict: Verdict };
  reason: EligibilityReason;
}> = {
  location: { run: locationRule, reason: 'LOCATION_MISMATCH' },
  workMode: { run: workModeRule, reason: 'WORK_MODE_MISMATCH' },
  employmentType: { run: employmentTypeRule, reason: 'EMPLOYMENT_TYPE_MISMATCH' },
  experience: { run: experienceRule, reason: 'EXPERIENCE_MISMATCH' },
  domain: { run: domainRule, reason: 'DOMAIN_MISMATCH' },
  salary: { run: salaryRule, reason: 'SALARY_MISMATCH' },
};

/* ── Evaluator ────────────────────────────────────────────────────────────*/

/**
 * Decide whether a job may proceed for this user.
 *
 * ALL rules run, always: stopping at the first failure would report one reason
 * when two apply, and an operator debugging why a job was hidden needs the
 * whole picture. Rule order is fixed, so `reasons` is deterministic.
 *
 * Status:
 *   · any rule failed                    -> ineligible
 *   · a stated requirement is undecidable -> unknown
 *   · otherwise                           -> eligible
 *
 * A user who has expressed NO requirements gets `eligible` with no evaluated
 * rules — nothing was asked for, so nothing can be contradicted. That is
 * different from `unknown`, which means the user DID ask and the job is
 * silent.
 */
export function evaluateJobEligibility(
  job: HiringJobPosting,
  user: EligibilityProfile,
): JobEligibilityResult {
  const reasons: EligibilityReason[] = [];
  const evaluatedRules: EligibilityRule[] = [];
  const unknownRules: EligibilityRule[] = [];

  for (const rule of ELIGIBILITY_RULES) {
    const { verdict } = RULES[rule].run(job, user);
    if (verdict === 'n/a') continue;
    if (verdict === 'unknown') { unknownRules.push(rule); continue; }
    evaluatedRules.push(rule);
    if (verdict === 'fail') reasons.push(RULES[rule].reason);
  }

  const status: EligibilityStatus = reasons.length > 0
    ? 'ineligible'
    : unknownRules.length > 0 ? 'unknown' : 'eligible';

  return { status, reasons, evaluatedRules, unknownRules };
}

/* ── Adapter ──────────────────────────────────────────────────────────────*/

/**
 * Build the evaluator's input from the profile the repository already stores.
 *
 * `DocrudianProfile` carries `location`, `domain`, `skills`, `interests` and
 * `lookingFor` — and NO work-mode, employment-type, salary or experience
 * preference. Those fields are therefore left absent here rather than being
 * invented, which under the rules above means they simply never gate. Once a
 * preferences UI exists, it populates the same shape and the rules start
 * applying with no change to the evaluator.
 *
 * The profile's free-text `location` is read through the Phase 4 classifier,
 * so "Bangalore" and "Bengaluru, Karnataka" produce the same requirement as
 * the jobs do — one location vocabulary across both sides of the comparison.
 *
 * NOTE ON EXPERIENCE: nothing is derived here. The repository can infer a
 * seniority band from a member's job titles (`deriveExperienceLevel`), and
 * that is fine for ranking, but it is a guess — using it to HARD-REJECT a job
 * would turn a guess into a closed door.
 */
export function buildEligibilityProfile(
  profile: Partial<Pick<import('@/types/document').DocrudianProfile,
    'location' | 'domain'>> & { preferences?: EligibilityProfile } = {},
): EligibilityProfile {
  const out: EligibilityProfile = {};

  const loc = classifyLocation(String(profile.location ?? ''));
  if (loc.country) out.countries = [loc.country];
  if (loc.cities.length) out.cities = loc.cities;

  const domain = String(profile.domain ?? '').trim().toLowerCase();
  if (domain) out.domains = [domain];

  /* Anything explicitly supplied wins: a stated preference is a fact, while
     everything above is read off a free-text profile field. */
  return { ...out, ...(profile.preferences ?? {}) };
}
