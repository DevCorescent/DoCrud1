/**
 * Domain and location classification.
 *
 * The step between deduplication and the eligibility/matching phases: it takes
 * a canonical job draft and returns the classification fields the model
 * already declares. It DECIDES NOTHING about users - no eligibility, no
 * ranking, no ATS scoring. It only labels the job.
 *
 * DETERMINISTIC BY CONSTRUCTION. Weighted keyword scoring over fields the
 * posting already contains. No model, no network, no clock, no randomness, so
 * the same input always yields the same output. `classifyJob` is pure.
 *
 * EVIDENCE IS WEIGHTED BY WHERE IT APPEARS. A phrase in the title is worth far
 * more than the same phrase buried in a description, because a description
 * mentioning "we use React" does not make an accountant a frontend engineer.
 * The order is: source department, then title, then skills, then
 * responsibilities and requirements, then description last.
 *
 * IT REFUSES TO FABRICATE CERTAINTY. When nothing scores above the floor, or
 * when the top two domains are effectively tied, the domain is left ABSENT
 * rather than being guessed. The canonical model's own note on
 * `domainConfidence` says low confidence must route to review and never
 * silently to a user; leaving the field unset is how that is honoured.
 */
import type { CanonicalJobDraft } from './normalize';
import { classifyLocation, resolveWorkMode, type LocationClassification } from './location';
import {
  DOMAIN_RULES, JOB_SUBDOMAINS, SOURCE_CATEGORY_ALIASES,
  type JobDomain,
} from './taxonomy';

/**
 * Bumped whenever the rules change.
 *
 * Stored on every classified record as `classificationVersion`, so a later
 * phase can find and re-classify everything labelled by an older ruleset
 * instead of having to re-classify the whole corpus.
 */
export const CLASSIFICATION_VERSION = 'v1';

/** The floor a domain must clear to be stated at all. */
const MIN_SCORE = 6;
/**
 * How far ahead the winner must be.
 *
 * A job scoring 10 for `software` and 9 for `data` is genuinely ambiguous, and
 * picking the leader would be a coin flip dressed as a fact. Requiring a
 * margin is what turns those into an honest "unclassified".
 */
const MIN_MARGIN = 3;

export interface JobClassification {
  domain?: JobDomain;
  subDomain?: string;
  /** 0-1. Absent whenever `domain` is absent. */
  domainConfidence?: number;
  classificationVersion: string;
  country?: string;
  state?: string;
  city?: string;
  isIndia?: boolean;
  /** Every canonical city named. Multi-location postings keep all of them. */
  cities: string[];
  /** Resolved from the source field, falling back to the location text. */
  workMode?: 'remote' | 'hybrid' | 'onsite';
  /** Per-domain scores, for explaining a decision. Not persisted. */
  scores: Partial<Record<JobDomain, number>>;
}

/** Field weights. A hit in a heavier field counts for more. */
const WEIGHTS = {
  department: 1.6,
  title: 1.5,
  /* A skills list is CURATED by the employer, one entry per line, so a
     framework appearing there is a deliberate statement about the role -
     stronger evidence than the same word occurring in prose. */
  skills: 1.3,
  lists: 0.6,
  description: 0.35,
} as const;

/**
 * Field text, whitespace-collapsed.
 *
 * The rules match multi-word phrases like "software engineer", and a title
 * written "Senior   Software   Engineer" defeated every one of them. The
 * ingestion path already collapses whitespace before this runs, but the
 * classifier must not DEPEND on an upstream step having been applied - it is
 * a public, pure function and is called directly by tests and later phases.
 */
const text = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Score every domain against one job.
 *
 * Each rule contributes at most once per field, not once per occurrence: a
 * description repeating "sales" nine times is not nine times the evidence, and
 * counting occurrences would let a verbose posting outrank a precise title.
 */
export function scoreDomains(draft: Partial<CanonicalJobDraft>): Partial<Record<JobDomain, number>> {
  const fields: Array<[string, number]> = [
    [text(draft.department), WEIGHTS.department],
    [text(draft.title), WEIGHTS.title],
    [text((draft.preferredSkills ?? []).join(' ')), WEIGHTS.skills],
    [text([...(draft.responsibilities ?? []), ...(draft.requirements ?? [])].join(' ')), WEIGHTS.lists],
    [text(draft.description), WEIGHTS.description],
  ];

  const scores: Partial<Record<JobDomain, number>> = {};
  for (const [domain, rules] of Object.entries(DOMAIN_RULES) as Array<[JobDomain, Array<[RegExp, number]>]>) {
    let total = 0;
    for (const [content, weight] of fields) {
      if (!content) continue;
      for (const [pattern, points] of rules) {
        if (pattern.test(content)) total += points * weight;
      }
    }
    if (total > 0) scores[domain] = Math.round(total * 100) / 100;
  }
  return scores;
}

/**
 * The domain a source's own department label implies, if any.
 *
 * A human at the employer chose that label, which makes it the single
 * strongest signal available - but it is added to the score rather than used
 * as an override, because "Operations" means different things at a logistics
 * firm and a SaaS firm, and the title should still be able to disagree.
 */
export function sourceCategoryDomain(department: string): JobDomain | null {
  const key = String(department ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  if (SOURCE_CATEGORY_ALIASES[key]) return SOURCE_CATEGORY_ALIASES[key];
  /* An exact match is preferred; a department like "Engineering - Platform"
     falls back to its leading segment rather than being discarded. */
  const head = key.split(/[-/|,(]/)[0].trim();
  return SOURCE_CATEGORY_ALIASES[head] ?? null;
}

/** The sub-domain, when a sub-domain keyword is matched outright. */
function pickSubDomain(domain: JobDomain, draft: Partial<CanonicalJobDraft>): string | undefined {
  const table = JOB_SUBDOMAINS[domain];
  if (!table) return undefined;
  /* Title and skills only. A sub-domain claimed on the strength of one word
     deep in a description is not worth stating. */
  const hay = text(`${text(draft.title)} ${(draft.preferredSkills ?? []).join(' ')}`);
  for (const [label, pattern] of Object.entries(table)) {
    if (pattern.test(hay)) return label;
  }
  return undefined;
}

/**
 * Classify one draft. Pure.
 *
 * `location` is classified independently of the domain, so a posting whose
 * role is unrecognisable still gets its country and city.
 */
export function classifyJob(draft: Partial<CanonicalJobDraft>): JobClassification {
  const loc: LocationClassification = classifyLocation(text(draft.location));

  const scores = scoreDomains(draft);
  /* The department's implied domain is a strong, deliberately bounded boost:
     enough to break a tie or clear the floor on its own, not enough to beat a
     title that says something else outright. */
  const fromCategory = sourceCategoryDomain(text(draft.department));
  if (fromCategory) {
    scores[fromCategory] = Math.round(((scores[fromCategory] ?? 0) + 8) * 100) / 100;
  }

  const ranked = (Object.entries(scores) as Array<[JobDomain, number]>)
    /* Sorted by score, then by domain name, so a genuine tie still produces a
       STABLE order across runs rather than depending on insertion order. */
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

  const classification: JobClassification = {
    classificationVersion: CLASSIFICATION_VERSION,
    cities: loc.cities,
    scores,
  };

  if (loc.country) classification.country = loc.country;
  if (loc.state) classification.state = loc.state;
  if (loc.city) classification.city = loc.city;
  if (loc.isIndia !== undefined) classification.isIndia = loc.isIndia;

  const workMode = resolveWorkMode(draft.workMode, loc.workModeHint);
  if (workMode) classification.workMode = workMode;

  const top = ranked[0];
  const runnerUp = ranked[1];
  if (!top || top[1] < MIN_SCORE) return classification;
  if (runnerUp && top[1] - runnerUp[1] < MIN_MARGIN) return classification;

  classification.domain = top[0];
  /* Confidence is the winner's share of the field, tempered by its margin.
     It is a reproducible summary of the scores, not a probability - and it is
     never 1.0, because a keyword classifier has not earned certainty. */
  const total = ranked.reduce((sum, [, value]) => sum + value, 0) || 1;
  const share = top[1] / total;
  const margin = runnerUp ? (top[1] - runnerUp[1]) / top[1] : 1;
  classification.domainConfidence = Math.round(Math.min(0.95, (share * 0.6) + (margin * 0.4)) * 100) / 100;

  const sub = pickSubDomain(top[0], draft);
  if (sub) classification.subDomain = sub;

  return classification;
}

/**
 * The subset of a classification that is persisted.
 *
 * `scores` and `cities` are working data and stay out of the record: `scores`
 * is an explanation, and `cities` is already recoverable from the raw
 * `location` by the same parser that produced it. Only fields the canonical
 * model already declares are returned, so this cannot introduce a field the
 * schema does not have.
 */
export function classificationFields(c: JobClassification): {
  domain?: string; subDomain?: string; domainConfidence?: number;
  classificationVersion: string;
  country?: string; state?: string; city?: string; isIndia?: boolean;
} {
  return {
    ...(c.domain ? { domain: c.domain } : {}),
    ...(c.subDomain ? { subDomain: c.subDomain } : {}),
    ...(c.domainConfidence !== undefined ? { domainConfidence: c.domainConfidence } : {}),
    classificationVersion: c.classificationVersion,
    ...(c.country ? { country: c.country } : {}),
    ...(c.state ? { state: c.state } : {}),
    ...(c.city ? { city: c.city } : {}),
    ...(c.isIndia !== undefined ? { isIndia: c.isIndia } : {}),
  };
}
