/**
 * JD Intelligence — what a job description actually asks for.
 *
 * Requirements are read from the job's OWN wording, not from a fixed catalog.
 * Importance comes from the sentence a requirement appears in: a posting that
 * writes "must have" means something different from "nice to have", and
 * treating those alike is how a candidate missing a mandatory certification
 * still scores well.
 */
import {
  containsPhrase, detectSeniority, extractRequiredYears, normalizeWhitespace,
} from './text';
import { ALL_SURFACE_FORMS, resolveSurface, skillEntry } from './skill-taxonomy';
import type { JdRequirement, RequirementImportance } from './types';

export interface NormalizedJd {
  title: string;
  seniority: string | null;
  requiredYears: number | null;
  requirements: JdRequirement[];
  /** Degree phrase the posting asks for, verbatim. Null when it asks for none. */
  requiredEducation: string | null;
  educationRequired: boolean;
  requiredCertifications: string[];
  fullText: string;
}

/* Phrases that mark the sentence around them. Longest first — "nice to have"
   must be tested before "have". */
const MUST_MARKERS = [
  'must have', 'must-have', 'required', 'requirement', 'requirements',
  'essential', 'mandatory', 'you have', 'we require', 'minimum qualifications',
  'basic qualifications', 'is required',
];
const NICE_MARKERS = [
  'nice to have', 'nice-to-have', 'good to have', 'bonus', 'plus', 'preferred',
  'a plus', 'desirable', 'optional', 'would be great', 'ideally',
];

/**
 * Importance for a requirement, from the sentence it appears in.
 * Default is `important`: a skill a posting bothered to name is not optional
 * just because it did not say "must".
 */
function importanceForSentence(sentence: string): RequirementImportance {
  const lower = sentence.toLowerCase();
  /* Nice-to-have wins over must: "Kubernetes is a plus" sits inside a
     Requirements section often enough that the local phrase is the honest
     signal. */
  if (NICE_MARKERS.some((m) => lower.includes(m))) return 'nice';
  if (MUST_MARKERS.some((m) => lower.includes(m))) return 'must';
  return 'important';
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.;:])\s+/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

/* A job title is a short phrase. These bounds are what separate "the posting
   led with its title" from "the posting is one long paragraph". */
const MAX_TITLE_CHARS = 80;
const MAX_TITLE_WORDS = 12;

/**
 * The job title a posting leads with, when it leads with one.
 *
 * The caller's `jobTitle` is always preferred. This fallback exists for the
 * common case of a posting whose first line IS its title.
 *
 * IT MUST BE BOUNDED. The previous version took `fullText.split('\n')[0]`
 * unconditionally, so a job description pasted as a single paragraph — which is
 * how most people paste from a job board — made the ENTIRE posting the title.
 * That title was then displayed in the report and quoted verbatim inside an
 * action-plan recommendation, producing a "recommendation" hundreds of
 * characters long containing the whole JD.
 *
 * When no plausible title can be read, this returns '' rather than a guess: an
 * unknown title is a fact the scorer already handles, whereas a wrong one
 * silently corrupts title alignment.
 */
function deriveTitle(fullText: string): string {
  const firstLine = normalizeWhitespace(fullText.split('\n').find((l) => l.trim()) ?? '');
  if (!firstLine) return '';

  const plausible = (candidate: string) =>
    candidate.length > 0
    && candidate.length <= MAX_TITLE_CHARS
    && candidate.split(/\s+/).length <= MAX_TITLE_WORDS;

  if (plausible(firstLine)) return firstLine;

  /* A long first line may still OPEN with the title, e.g.
     "Senior Backend Engineer - We are looking for...". Try its leading clause,
     but only accept it if it looks like a title on its own. */
  const clause = normalizeWhitespace(firstLine.split(/\s[–—|]\s|\s-\s|[.:;]\s/)[0] ?? '');
  return plausible(clause) ? clause : '';
}

const DEGREE_RE = /\b(bachelor'?s?|master'?s?|b\.?tech|b\.?e\b|b\.?sc|bca|m\.?tech|m\.?sc|mca|mba|ph\.?d|doctorate|degree|diploma)\b[^.;\n]*/i;

export function normalizeJd(jobDescription: string, jobTitle = ''): NormalizedJd {
  const fullText = normalizeWhitespace(jobDescription);
  const sentences = splitSentences(fullText);

  const title = normalizeWhitespace(jobTitle) || deriveTitle(fullText);

  /* One requirement per canonical skill, keeping the STRONGEST importance seen.
     A skill named in both "Requirements" and "nice to have" is a requirement. */
  const byCanonical = new Map<string, JdRequirement>();
  const rank: Record<RequirementImportance, number> = { must: 3, important: 2, nice: 1 };

  for (const sentence of sentences) {
    const importance = importanceForSentence(sentence);
    for (const surface of ALL_SURFACE_FORMS) {
      if (!containsPhrase(sentence, surface)) continue;
      const canonical = resolveSurface(surface);
      if (!canonical) continue;
      const entry = skillEntry(canonical);
      const requirement: JdRequirement = {
        canonical,
        surface,
        kind: entry?.kind ?? 'skill',
        importance,
      };
      const existing = byCanonical.get(canonical);
      if (!existing || rank[importance] > rank[existing.importance]) {
        byCanonical.set(canonical, requirement);
      }
    }
  }

  /* A skill named by a NARROWER requirement implies the broader one is wanted
     too — but only as an `important`, never promoted to `must`. */
  for (const requirement of Array.from(byCanonical.values())) {
    for (const parent of skillEntry(requirement.canonical)?.parents ?? []) {
      if (!byCanonical.has(parent)) {
        byCanonical.set(parent, {
          canonical: parent, surface: parent, kind: 'skill',
          importance: requirement.importance === 'must' ? 'important' : 'nice',
        });
      }
    }
  }

  const educationSentence = sentences.find((s) => DEGREE_RE.test(s)) ?? null;
  const requiredEducation = educationSentence
    ? normalizeWhitespace(educationSentence.match(DEGREE_RE)?.[0] ?? '')
    : null;
  const educationRequired = Boolean(
    educationSentence && importanceForSentence(educationSentence) !== 'nice',
  );

  const requirements = Array.from(byCanonical.values()).sort((a, b) => {
    const byRank = rank[b.importance] - rank[a.importance];
    return byRank !== 0 ? byRank : a.canonical.localeCompare(b.canonical);
  });

  return {
    title,
    seniority: detectSeniority(title) ?? detectSeniority(fullText),
    requiredYears: extractRequiredYears(fullText),
    requirements,
    requiredEducation,
    educationRequired,
    requiredCertifications: requirements
      .filter((r) => r.kind === 'certification' && r.importance !== 'nice')
      .map((r) => r.canonical),
    fullText,
  };
}
