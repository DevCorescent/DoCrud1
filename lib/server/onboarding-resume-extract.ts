/**
 * Pre-auth resume extraction: text in, three suggestions out.
 *
 * ═══ WHY THIS IS NOT /api/onboarding/parse-resume ═══
 *
 * That route calls `generateAiText`. Exposing an LLM to anonymous callers is an
 * unbounded cost and abuse vector, so it keeps its session check and is not
 * touched. Everything here is DETERMINISTIC — no model, no network, no clock —
 * built from utilities the app already owns:
 *
 *   · parseResumeText / normalizeResume  (lib/server/ats)  → skills, titles
 *   · resolveSurface                     (ATS taxonomy)    → canonical skills
 *   · scoreDomains                       (job classifier)  → career directions
 *
 * The same résumé always yields the same suggestions, and a request costs a few
 * milliseconds of CPU rather than a model call.
 *
 * ═══ THESE ARE SUGGESTIONS, NOT FACTS ═══
 *
 * Every field is optional and omitted when it cannot be read confidently. A
 * missing name is returned as absent, never as a guess — the person then types
 * it, which is a better outcome than pre-filling someone else's name.
 */

import { parseResumeText } from '@/lib/server/ats/resume-text';
import { normalizeResume } from '@/lib/server/ats/resume';
import { resolveSurface } from '@/lib/server/ats/skill-taxonomy';
import { scoreDomains } from '@/lib/server/job-sources/classify';
import { JOB_DOMAINS, type JobDomain } from '@/lib/server/job-sources/taxonomy';

/** Only what the onboarding steps can actually use. No raw text leaves here. */
export interface ResumeExtraction {
  name?: string;
  /** JobDomain ids, matching lib/onboarding-roles.ts. */
  roles: string[];
  /** Canonical ATS skill names, matching lib/onboarding-skills.ts. */
  skills: string[];
}

/** How many suggestions are worth making. More is noise the person must undo. */
const MAX_ROLES = 3;
const MAX_SKILLS = 10;

/* Words that mean a header line is a job title or a contact detail rather than
   a person's name. A line containing any of them is not offered as a name. */
const NOT_A_NAME = /\b(engineer|developer|designer|manager|analyst|consultant|intern|scientist|architect|lead|senior|junior|resume|curriculum|vitae|cv|profile|summary|objective|address|phone|email|linkedin|github)\b/i;

/**
 * A person's name from the résumé header, or nothing.
 *
 * Deliberately strict: two to four capitalised words, letters and the
 * punctuation names actually contain, no digits, no role words. Anything else
 * returns undefined so the field stays empty and the person fills it in.
 */
export function extractName(headline: string | null | undefined): string | undefined {
  const line = String(headline ?? '').trim().replace(/\s+/g, ' ');
  if (!line || line.length > 60) return undefined;
  if (NOT_A_NAME.test(line) || /\d/.test(line)) return undefined;

  const words = line.split(' ');
  if (words.length < 2 || words.length > 4) return undefined;
  /* Every word must read like a name part: starts with a letter, contains only
     letters, apostrophes, hyphens or dots. */
  /* Letters plus the punctuation names actually contain. Written without the
     Unicode property escape so the project's ES5 target accepts it; the
     accented ranges cover the Latin scripts this corpus sees. */
  if (!words.every(w => /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'.-]*$/.test(w))) return undefined;
  /* ALL-CAPS headers are common and still names — title-case them rather than
     shouting the person's own name back at them. */
  const allCaps = line === line.toUpperCase();
  return allCaps
    ? words.map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
    : line;
}

/**
 * Career directions, from the roles the résumé actually describes.
 *
 * The job classifier scores domains for a posting; a résumé's titles and
 * narrative are the same kind of text, so it is reused rather than a second
 * scorer being written. Only domains it scored are returned, best first, and
 * `other` is dropped because it is the classifier's "did not match" bucket.
 */
export function extractRoles(titles: readonly string[], narrative: string): string[] {
  const scores = scoreDomains({
    title: titles.join(' — '),
    description: narrative.slice(0, 20_000),
  });
  return (Object.entries(scores) as Array<[JobDomain, number]>)
    .filter(([domain, score]) => domain !== 'other' && score > 0 && JOB_DOMAINS.includes(domain))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ROLES)
    .map(([domain]) => domain);
}

/**
 * Canonical skills the résumé names.
 *
 * `normalizeResume` has already resolved declared skills through the ATS
 * taxonomy, so this only orders and caps them. Anything the taxonomy does not
 * recognise is dropped rather than invented into the vocabulary.
 */
export function extractSkills(canonicalSkills: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of canonicalSkills) {
    const canonical = resolveSurface(String(raw ?? '')) ?? null;
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

/** The whole extraction, from already-extracted résumé text. */
export function extractFromResumeText(text: string): ResumeExtraction {
  const parsed = parseResumeText(text);
  const normalized = normalizeResume(parsed, text);
  return {
    name: extractName(parsed.headline),
    roles: extractRoles(normalized.titles, normalized.narrativeText || text),
    skills: extractSkills(normalized.canonicalSkills),
  };
}
