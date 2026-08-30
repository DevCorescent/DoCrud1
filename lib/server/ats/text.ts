/**
 * Text primitives shared by every scorer.
 *
 * Everything here is pure and clock-free. Nothing calls Date.now(): a score
 * that drifts because a month passed is not reproducible, and "same input,
 * same score" is a hard requirement of this engine. Recency is therefore
 * derived from the ORDER of the resume's own entries, never from today.
 */
import { ALL_SURFACE_FORMS, resolveSurface } from './skill-taxonomy';

export function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Round to one decimal so stored scores compare exactly across runs. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Word-boundary containment. Plain `includes` matches "java" inside
 * "javascript" and "go" inside "google", which quietly manufactures skills the
 * resume never claimed — the exact failure this engine exists to avoid.
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* Skills legitimately end in punctuation (C++, C#, Node.js, CI/CD), so the
     trailing boundary is "not a word character", not \b — \b never fires after
     a '+' or '#'. */
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#]|$)`, 'i').test(haystack.toLowerCase());
}

/** Count non-overlapping occurrences of a phrase — the input to stuffing detection. */
export function countPhrase(haystack: string, phrase: string): number {
  const p = phrase.trim().toLowerCase();
  if (!p) return 0;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystack.toLowerCase().match(
    new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#]|$)`, 'g'),
  );
  return matches ? matches.length : 0;
}

/**
 * Occurrences of `phrase` that are NOT part of a longer skill name.
 *
 * "AWS Lambda" contains the word "AWS", so a plain search reports that the
 * resume proves AWS — which is exactly the false exact-match this engine is
 * built to avoid. A mention only counts as standalone once every longer known
 * skill containing it has been accounted for.
 */
export function standalonePhraseCount(haystack: string, phrase: string): number {
  const total = countPhrase(haystack, phrase);
  if (total === 0) return 0;
  const needle = phrase.trim().toLowerCase();
  let absorbed = 0;
  for (const longer of ALL_SURFACE_FORMS) {
    if (longer.length <= needle.length) continue;
    if (!longer.includes(needle)) continue;
    absorbed += countPhrase(haystack, longer);
  }
  return Math.max(0, total - absorbed);
}

/** True when the phrase appears on its own, not only inside a longer skill. */
export function containsStandalonePhrase(haystack: string, phrase: string): boolean {
  return standalonePhraseCount(haystack, phrase) > 0;
}

/** Every canonical skill the taxonomy can find in a block of text. */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const surface of ALL_SURFACE_FORMS) {
    if (containsPhrase(text, surface)) {
      const canonical = resolveSurface(surface);
      if (canonical) found.add(canonical);
    }
  }
  return Array.from(found).sort();
}

/* ── Measurable outcomes ──────────────────────────────────────────────────
   Numbers only count as impact when they carry a unit or a scale word. A bare
   "2024" in a date, or "3" in "3 years", is not an achievement. */
const METRIC_PATTERNS: RegExp[] = [
  /\b\d+(?:\.\d+)?\s?%/g,                                    // 42%, 99.9%
  /\b(?:\$|€|£|₹|usd |inr )\s?\d[\d,.]*\s?(?:k|m|bn|cr|lakh|million|billion)?\b/gi,
  /\b\d+(?:\.\d+)?\s?x\b/gi,                                 // 3x
  /\b\d[\d,]*\+?\s?(?:users?|customers?|clients?|requests?|records?|rows?|transactions?|downloads?|installs?|orders?|tickets?|leads?|students?|employees?|hours?|days?|weeks?|seconds?|ms|milliseconds?|queries|apis?|endpoints?|servers?|stores?|countries|teams?)\b/gi,
  /\b\d[\d,]*\+/g,                                           // 500+
];

/** Measurements found verbatim. Verbatim matters: rewrites may only reuse these. */
export function extractMetrics(text: string): string[] {
  const out: string[] = [];
  for (const pattern of METRIC_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags));
    if (matches) out.push(...matches.map((m) => m.trim()));
  }
  return Array.from(new Set(out));
}

/** Scale claims that read as impact even without a digit. */
const SCALE_WORDS = [
  'large-scale', 'large scale', 'high traffic', 'high-traffic', 'production',
  'enterprise', 'multi-region', 'nationwide', 'company-wide', 'organisation-wide',
  'organization-wide',
];

export function hasScaleLanguage(text: string): boolean {
  return SCALE_WORDS.some((w) => containsPhrase(text, w));
}

/* ── Action verbs ─────────────────────────────────────────────────────── */
export const STRONG_VERBS = [
  'architected', 'engineered', 'optimized', 'optimised', 'reduced', 'increased',
  'automated', 'designed', 'scaled', 'led', 'launched', 'migrated', 'implemented',
  'spearheaded', 'accelerated', 'eliminated', 'negotiated', 'delivered',
];
export const GOOD_VERBS = [
  'developed', 'built', 'created', 'managed', 'improved', 'configured',
  'integrated', 'maintained', 'analyzed', 'analysed', 'tested', 'deployed',
  'refactored', 'coordinated', 'supported', 'wrote', 'shipped',
];
/** Responsibility language — the thing a hiring manager cannot evaluate. */
export const WEAK_VERBS = [
  'worked on', 'helped', 'assisted', 'responsible for', 'involved in',
  'participated in', 'contributed to', 'tasked with', 'familiar with',
  'exposure to', 'duties included',
];

export type VerbTier = 'strong' | 'good' | 'weak' | 'none';

/** The bullet's leading verb and its tier. Weak phrases win — they set the tone. */
export function classifyVerb(bullet: string): { tier: VerbTier; verb: string | null } {
  const text = bullet.trim().toLowerCase();
  for (const phrase of WEAK_VERBS) {
    if (text.startsWith(phrase) || containsPhrase(text, phrase)) return { tier: 'weak', verb: phrase };
  }
  const first = text.replace(/^[•\-*•\s]+/, '').split(/[\s,]+/)[0] ?? '';
  if (STRONG_VERBS.includes(first)) return { tier: 'strong', verb: first };
  if (GOOD_VERBS.includes(first)) return { tier: 'good', verb: first };
  for (const v of STRONG_VERBS) if (containsPhrase(text, v)) return { tier: 'strong', verb: v };
  for (const v of GOOD_VERBS) if (containsPhrase(text, v)) return { tier: 'good', verb: v };
  return { tier: 'none', verb: null };
}

/* ── Seniority ────────────────────────────────────────────────────────── */
export const SENIORITY_LADDER = [
  'intern', 'junior', 'associate', 'mid', 'senior', 'staff', 'lead', 'principal', 'director',
];

const SENIORITY_ALIASES: Record<string, string> = {
  intern: 'intern', internship: 'intern', trainee: 'intern',
  junior: 'junior', jr: 'junior', entry: 'junior', 'entry-level': 'junior', graduate: 'junior',
  associate: 'associate',
  mid: 'mid', 'mid-level': 'mid', intermediate: 'mid',
  senior: 'senior', sr: 'senior',
  staff: 'staff',
  lead: 'lead', 'team lead': 'lead', 'tech lead': 'lead',
  principal: 'principal',
  director: 'director', head: 'director', vp: 'director',
};

/** The seniority a title claims, or null when it does not say. */
export function detectSeniority(title: string): string | null {
  const lower = ` ${title.toLowerCase()} `;
  /* Longest alias first so "mid-level" is not read as "mid" inside another word. */
  const keys = Object.keys(SENIORITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (containsPhrase(lower, key)) return SENIORITY_ALIASES[key];
  }
  return null;
}

/** Words that say nothing about WHICH role a title is — stripped before comparison. */
const TITLE_NOISE = new Set([
  ...SENIORITY_LADDER, 'sr', 'jr', 'i', 'ii', 'iii', 'iv', 'the', 'of', 'and', 'for',
  'level', 'entry', 'a', 'an', 'in', 'at', 'to',
]);

/** Comparable tokens from a job title: "Senior Backend Engineer" → [backend, engineer]. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 1 && !TITLE_NOISE.has(t));
}

/** Years of experience a phrase asks for: "5+ years" → 5. Null when unstated. */
export function extractRequiredYears(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:\+|\s*-\s*\d+)?\s*(?:\+)?\s*years?/i);
  return match ? Number(match[1]) : null;
}
