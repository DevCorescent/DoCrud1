/**
 * Field-weighted relevance scoring for list search.
 *
 * The problem this exists to fix: several surfaces filtered with
 * `haystack.toLowerCase().includes(query.toLowerCase())`. That has two failure
 * modes the user actually hits:
 *
 *   1. The whole query has to appear verbatim inside ONE field. "react
 *      developer" therefore misses a person with "React" in skills and
 *      "Developer" in their headline — the single most common kind of query.
 *   2. Nothing is ranked. A weak body mention sorts identically to an exact
 *      skill match, so the best answer can appear anywhere in the list.
 *
 * This module scores per term against weighted fields instead, so a structured
 * match (skill, role, location) always outranks an incidental prose mention.
 *
 * Query *understanding* is not reimplemented here: parseQuery() delegates to
 * understandQuerySync() from lib/search-understanding.ts, the same rules layer
 * the server engine uses, so both share one taxonomy, one stopword list and one
 * reading of roles/skills/locations. This module is the ranking half.
 *
 * No network, no LLM, no database — safe in the browser and cheap enough to
 * call per keystroke over an already-loaded list.
 */

import { understandQuerySync } from '@/lib/search-understanding';

/* ── Normalisation ────────────────────────────────────────────────────────── */

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[._/\\|,;:()[\]{}"'`]+/g, ' ')
    .replace(/[^a-z0-9+#\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Crude, deliberately conservative suffix stemmer.
 *
 * Only the endings that actually collide in this data (developer/developers/
 * developing, design/designer/designers, engineer/engineering). It is not a
 * Porter stemmer and does not try to be: aggressive stemming is what makes
 * search return confidently wrong results.
 */
export function stem(word: string): string {
  /* Iterated to a fixed point. A single pass is NOT idempotent and silently
     breaks the pairs this exists to unify: "engineering" -> "engineer" but
     "engineer" -> "engine", so the two never met. Two passes land both on
     "engine". Bounded at two so it cannot chew a word down to nothing. */
  let out = word;
  for (let pass = 0; pass < 2; pass++) {
    if (out.length <= 4) break;
    let changed = false;
    for (const suffix of ['ing', 'ers', 'er', 'ors', 'or', 'es', 's']) {
      if (out.endsWith(suffix) && out.length - suffix.length >= 3) {
        out = out.slice(0, out.length - suffix.length);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return out;
}

export interface ParsedQuery {
  raw: string;
  /** Normalised full query — used for phrase matching. */
  phrase: string;
  /** Content-bearing terms, stopwords removed by the shared rules layer. */
  terms: string[];
  /** Stemmed form of each term, index-aligned with `terms`. */
  stems: string[];
  /**
   * What the taxonomy decided the query IS — its canonical skills, roles and
   * domains. "front end" resolves to the canonical `frontend`, so a row titled
   * "Frontend Developer" is a direct hit even though neither typed word
   * appears. Scored as a word match, because that is what it is.
   */
  canonical: string[];
  /**
   * Wider related terms the taxonomy expanded to (react -> nextjs, javascript).
   * Real evidence, but much weaker: never enough on its own to make a result.
   */
  related: string[];
}

/**
 * Parse through the SAME rules the server engine uses.
 *
 * understandQuerySync() owns the stopword list, the concept taxonomy and the
 * role/skill/location extraction. Reusing it here is the point of the
 * lib/search-understanding.ts split: previously this file kept its own smaller
 * stopword list, so the client and server could disagree about what a query
 * even meant.
 */
export function parseQuery(raw: string): ParsedQuery {
  const phrase = normalize(raw);
  const u = understandQuerySync(raw);
  const all = phrase.split(' ').filter(Boolean);
  /* If the rules stripped everything (a query of pure filler) fall back to the
     raw words so search still does something predictable. */
  const terms = u.terms.length ? u.terms.map(normalize).filter(Boolean) : all;
  const typed = new Set(terms);
  const canonical = Array.from(new Set([...u.skills, ...u.roles, ...u.domains]))
    .map(normalize)
    .filter((t) => t.length >= 2 && !typed.has(t));
  const canonSet = new Set(canonical);
  const related = Array.from(new Set(u.expanded))
    .map(normalize)
    .filter((t) => t.length >= 2 && !typed.has(t) && !canonSet.has(t));
  return { raw, phrase, terms, stems: terms.map(stem), canonical, related };
}

/* ── Typo tolerance ───────────────────────────────────────────────────────── */

/**
 * Levenshtein distance, abandoned as soon as it exceeds `max`.
 *
 * Bounded on purpose: an unbounded edit distance over long strings is both slow
 * and the reason naive fuzzy search surfaces unrelated results.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;   // whole row already too far — stop
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Whether `word` is a plausible typo of `term`.
 *
 * The allowance scales with length and is capped at 2, and short words get no
 * allowance at all — "cat"/"car" are different words, not a typo.
 */
export function isTypoOf(word: string, term: string): boolean {
  if (term.length < 5) return false;
  const max = term.length >= 8 ? 2 : 1;
  return editDistance(word, term, max) <= max;
}

/* ── Scoring ──────────────────────────────────────────────────────────────── */

/** A field of the record, with the weight of a match inside it. */
export interface SearchField {
  /** Field text, or the list for multi-valued fields such as skills. */
  value: string | string[] | null | undefined;
  /** Score for an exact whole-value match (e.g. skill === "react"). */
  exact: number;
  /** Score for a whole-word match inside the field. */
  word: number;
  /** Score for a typo match inside the field. Should be well below `word`. */
  weak: number;
}

export interface RelevanceResult {
  score: number;
  /** How many distinct query terms matched anywhere. Drives the AND-ish bonus. */
  matchedTerms: number;
}

const PHRASE_BONUS = 60;      // the whole query appears verbatim in a strong field
const ALL_TERMS_BONUS = 45;   // every term matched somewhere — "react developer Delhi"

/**
 * Score one record against a parsed query.
 *
 * Shape of the result, in order of influence:
 *   - exact structured matches (a skill that IS the term)
 *   - whole-word matches in strong fields (name, headline, role)
 *   - stem matches, at 70% of a word match — same concept, different ending
 *   - the multi-signal bonus, which is what makes a record matching every part
 *     of "react developer delhi" beat one matching only "developer"
 *   - phrase bonus for "software engineer" appearing as written
 *   - stem/typo matches, and prose mentions, which are worth very little
 */
export function scoreRecord(query: ParsedQuery, fields: SearchField[]): RelevanceResult {
  if (!query.terms.length) return { score: 0, matchedTerms: 0 };

  let score = 0;
  const matched = new Set<number>();
  /* Taxonomy evidence counts as a matched signal for the threshold below —
     "front end" matching a "Frontend Developer" is a real answer even though
     neither typed word appears verbatim. */
  let conceptMatched = false;

  for (const field of fields) {
    const values = Array.isArray(field.value)
      ? field.value
      : field.value
        ? [field.value]
        : [];
    if (!values.length) continue;

    for (const rawValue of values) {
      const value = normalize(String(rawValue));
      if (!value) continue;
      const words = value.split(' ').filter(Boolean);
      const wordSet = new Set(words);
      const stemSet = new Set(words.map(stem));

      /* Phrase: the query as written, inside a field that carries weight. */
      if (query.terms.length > 1 && field.exact >= 40 && value.includes(query.phrase)) {
        score += PHRASE_BONUS;
      }

      const hasConcept = (c: string) => (c.includes(' ') ? value.includes(c) : wordSet.has(c));

      /* Canonical concept: the thing the query resolved to. Worth a word match,
         because "front end" hitting "Frontend Developer" is a direct answer,
         not a loose association. */
      if (query.canonical.length && field.exact >= 40) {
        let hits = 0;
        for (const c of query.canonical) {
          if (hits >= 2) break;
          if (hasConcept(c)) hits += 1;
        }
        if (hits > 0) {
          score += hits * field.word;
          conceptMatched = true;
        }
      }

      /* Related expansions. Capped hard so a pile of loosely-associated terms
         can never outweigh the words actually typed. */
      if (query.related.length && field.exact >= 40) {
        let hits = 0;
        for (const c of query.related) {
          if (hits >= 3) break;
          if (hasConcept(c)) hits += 1;
        }
        score += hits * Math.round(field.word * 0.15);
      }

      query.terms.forEach((term, i) => {
        const termStem = query.stems[i];

        if (value === term) {                       // the field IS the term
          score += field.exact;
          matched.add(i);
          return;
        }
        if (wordSet.has(term)) {                    // whole word inside the field
          score += field.word;
          matched.add(i);
          return;
        }
        if (stemSet.has(termStem)) {
          /* developer ~ developers ~ developing is the SAME concept, so it is
             worth most of a word match — not the typo rate. Scoring it as a
             typo pushed single-term queries like "developing" under the
             relevance threshold and dropped them entirely. */
          score += Math.round(field.word * 0.7);
          matched.add(i);
          return;
        }
        /* Typo, checked last and only against whole words — never against a
           substring, which is where fuzzy matching usually goes wrong. */
        if (words.some((w) => isTypoOf(w, term))) {
          score += field.weak;
          matched.add(i);
        }
      });
    }
  }

  if (score === 0) return { score: 0, matchedTerms: 0 };

  /* Matching every signal is worth more than matching one signal loudly. This
     is what enforces "STRONG STRUCTURED MATCH across all terms > one big hit". */
  if (query.terms.length > 1 && matched.size === query.terms.length) {
    score += ALL_TERMS_BONUS * query.terms.length;
  }

  return { score, matchedTerms: matched.size + (conceptMatched ? 1 : 0) };
}

/**
 * Score with the relevance bar applied — 0 means "not a result".
 *
 * The bar lives here so every surface enforces it identically: a single weak
 * term out of several is noise, and that is what stops an unrelated query from
 * returning filler.
 */
export function scoreWithThreshold(
  query: ParsedQuery,
  fields: SearchField[],
  opts: { minScore?: number } = {},
): number {
  const minScore = opts.minScore ?? 20;
  const { score, matchedTerms } = scoreRecord(query, fields);
  if (score < minScore) return 0;
  /* One weak term out of several is noise, not a result. A single WORD-level
     hit in a strong field (title, name, role) is kept — that is a real answer,
     which is why the bar here sits at a word match rather than above it. */
  if (query.terms.length > 1 && matchedTerms < 2 && score < 50) return 0;
  return score;
}

/**
 * Rank a list, dropping records that do not clear the relevance bar.
 *
 * The threshold is what stops "quantum underwater accounting" from returning
 * everyone whose bio happens to contain "accounting": on a multi-term query a
 * record must match more than a single term, unless that one match was a strong
 * structured hit.
 */
export function rankBySearch<T>(
  items: T[],
  rawQuery: string,
  fieldsOf: (item: T) => SearchField[],
  opts: { minScore?: number } = {},
): T[] {
  const query = parseQuery(rawQuery);
  if (!query.terms.length) return items;
  const minScore = opts.minScore ?? 20;

  const scored: Array<{ item: T; score: number; index: number }> = [];
  items.forEach((item, index) => {
    const score = scoreWithThreshold(query, fieldsOf(item), { minScore });
    if (score > 0) scored.push({ item, score, index });
  });

  /* Stable: equal scores keep the incoming order, which is the surface's own
     sort (most upraised, newest, …) rather than an arbitrary reshuffle. */
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return scored.map((s) => s.item);
}
