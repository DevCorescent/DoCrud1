/**
 * Resume upload — parsing and resume-quality scoring, extracted so it is testable.
 *
 * WHY THIS FILE EXISTS. All of this used to be inline in
 * app/api/profile/upload-resume/route.ts, where it could only be exercised
 * through a real HTTP request with a real session. That is why the failure
 * below survived: 492 ATS checks passed the whole time, because every one of
 * them tested lib/server/ats — the deterministic MATCH engine — and nothing
 * tested this path at all.
 *
 * THE FAILURE. The route's only resume parser was Groq. The configured model
 * had been decommissioned, so `generateAiText` threw `model_not_found`, the
 * error was caught, the parsed object stayed at its empty initializer, and
 * `computeAts({})` returned exactly `{ score: 0, grade: 'F' }` — which was
 * stored on the member's profile and rendered as "0%". An infrastructure
 * outage was displayed to a candidate as a verdict on their resume.
 *
 * THE RULE THIS FILE ENFORCES. A parser failure is not a score. When no parser
 * produces usable data the result is `null`, never a zero: see
 * `resolveParsedResume` and `hasUsableParse`. A genuine 0 remains reachable —
 * `computeAts` is unchanged and still scores a genuinely empty resume as 0/F —
 * but it is only ever computed from data a parser actually returned.
 *
 * NOTHING HERE IS THE ATS MATCH ENGINE. `computeAts` scores resume COMPLETENESS
 * (0..100, A..F) and answers "is this profile filled in". The match engine in
 * lib/server/ats answers "does this resume suit this job" and is untouched.
 */
import { parseResumeText } from '@/lib/server/ats/resume-text';

/* ─── AI-parsed resume schema ─────────────────────────────────────────────── */
export interface ParsedResume {
  headline:     string | null;
  bio:          string | null;
  location:     string | null;
  website:      string | null;
  skills:       string[];
  experience:   Array<{ title: string; company: string; period: string; desc: string | null }>;
  education:    Array<{ degree: string; school: string; year: string | null }>;
  achievements: Array<{ title: string; desc: string | null }>;
  socialLinks:  { linkedin: string | null; github: string | null; twitter: string | null };
}

/* ─── Rule-based resume-quality scoring (no AI needed, always works) ─────── */
export interface AtsScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    contact:      number;
    summary:      number;
    skills:       number;
    experience:   number;
    education:    number;
    achievements: number;
  };
  tips: string[];
}

export const EMPTY_PARSED_RESUME: ParsedResume = {
  headline: null, bio: null, location: null, website: null,
  skills: [], experience: [], education: [], achievements: [],
  socialLinks: { linkedin: null, github: null, twitter: null },
};

/**
 * SEMANTICS FROZEN. Moved verbatim from the route; not one threshold, weight
 * or grade boundary is altered. The bug was never in this function — it was in
 * feeding it an empty object and publishing the result.
 */
export function computeAts(p: ParsedResume): AtsScore {
  const tips: string[] = [];
  let contact = 0, summary = 0, skills = 0, experience = 0, education = 0, achievements = 0;

  // Contact (25 pts)
  if (p.headline)              contact += 8; else tips.push('Add a headline (e.g. "Senior Engineer at Google") — most ATS systems prioritise this');
  if (p.location)              contact += 5; else tips.push('Include your city/country — location is a key recruiter filter');
  if (p.website)               contact += 5;
  if (p.socialLinks.linkedin)  contact += 7; else tips.push('Add your LinkedIn URL — 87% of recruiters use LinkedIn to verify candidates');

  // Summary/Bio (15 pts)
  if (p.bio) {
    summary += 8;
    if (p.bio.length > 150) summary += 7;
    else tips.push('Expand your professional summary to 150+ characters for better ATS keyword coverage');
  } else {
    tips.push('Write a professional summary — it\'s the first section ATS and recruiters read');
  }

  // Skills (20 pts)
  const sc = p.skills.length;
  if (sc >= 15)      skills = 20;
  else if (sc >= 10) skills = 15;
  else if (sc >= 5)  skills = 10;
  else               skills = sc * 2;
  if (sc < 10) tips.push(`Add more skills — you have ${sc}, aim for 10–20 relevant keywords`);

  // Experience (25 pts)
  const ec = p.experience.length;
  if (ec >= 4)      experience += 15;
  else if (ec >= 2) experience += 10;
  else if (ec >= 1) experience += 5;
  else tips.push('Add work experience entries — experience is the #1 factor in ATS ranking');

  const missingDesc   = p.experience.filter(e => !e.desc).length;
  const missingPeriod = p.experience.filter(e => !e.period || e.period.toLowerCase() === 'unknown').length;

  if (ec > 0 && missingDesc === 0)   experience += 5;
  else if (missingDesc > 0)          tips.push('Add impact descriptions to each role — quantify results where possible (e.g. "Reduced load time by 40%")');

  if (ec > 0 && missingPeriod === 0) experience += 5;
  else if (missingPeriod > 0)        tips.push('Include clear date ranges for all positions (e.g. "Jan 2022 – Present")');

  // Education (10 pts)
  if (p.education.length >= 1) education = 10;
  else tips.push('Add your educational background — most ATS systems require at least one entry');

  // Achievements (5 pts)
  if (p.achievements.length >= 3) achievements = 5;
  else if (p.achievements.length >= 1) achievements = 2;
  else tips.push('Add awards, publications, or notable projects to stand out');

  const total = Math.min(contact + summary + skills + experience + education + achievements, 100);
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';

  return {
    score: total,
    grade,
    breakdown: { contact, summary, skills, experience, education, achievements },
    tips: tips.slice(0, 5),
  };
}

/**
 * Coerce an untrusted parse into the stored shape.
 *
 * SEMANTICS FROZEN — moved verbatim from the route. It runs over BOTH parsers'
 * output, so the deterministic fallback is held to exactly the same field
 * limits, trimming and type checks the AI result always was. A model cannot
 * smuggle a shape past it and neither can the fallback.
 */
export function sanitizeParsedResume(parsed: Partial<ParsedResume>): ParsedResume {
  return {
    headline: typeof parsed.headline === 'string' && parsed.headline.trim() ? parsed.headline.trim().slice(0, 100) : null,
    bio:      typeof parsed.bio      === 'string' && parsed.bio.trim()      ? parsed.bio.trim().slice(0, 500)      : null,
    location: typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim()               : null,
    website:  typeof parsed.website  === 'string' && parsed.website.trim()  ? parsed.website.trim()                : null,
    skills: Array.isArray(parsed.skills)
      ? (parsed.skills as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim()).slice(0, 25)
      : [],
    experience: Array.isArray(parsed.experience)
      ? (parsed.experience as Array<Record<string, unknown>>)
          .filter(e => e && typeof e.title === 'string' && String(e.title).trim())
          .map(e => ({
            title:   String(e.title   ?? '').trim(),
            company: String(e.company ?? '').trim(),
            period:  String(e.period  ?? '').trim(),
            desc:    typeof e.desc === 'string' && e.desc.trim() ? e.desc.trim().slice(0, 160) : null,
          }))
          .slice(0, 10)
      : [],
    education: Array.isArray(parsed.education)
      ? (parsed.education as Array<Record<string, unknown>>)
          .filter(e => e && typeof e.degree === 'string' && String(e.degree).trim())
          .map(e => ({
            degree: String(e.degree ?? '').trim(),
            school: String(e.school ?? '').trim(),
            year:   typeof e.year === 'string' && e.year.trim() ? e.year.trim() : null,
          }))
          .slice(0, 8)
      : [],
    achievements: Array.isArray(parsed.achievements)
      ? (parsed.achievements as Array<Record<string, unknown>>)
          .filter(e => e && typeof e.title === 'string' && String(e.title).trim())
          .map(e => ({
            title: String(e.title ?? '').trim(),
            desc:  typeof e.desc === 'string' && e.desc.trim() ? e.desc.trim().slice(0, 200) : null,
          }))
          .slice(0, 8)
      : [],
    socialLinks: {
      linkedin: typeof parsed.socialLinks?.linkedin === 'string' && parsed.socialLinks.linkedin.trim() ? parsed.socialLinks.linkedin.trim() : null,
      github:   typeof parsed.socialLinks?.github   === 'string' && parsed.socialLinks.github.trim()   ? parsed.socialLinks.github.trim()   : null,
      twitter:  typeof parsed.socialLinks?.twitter  === 'string' && parsed.socialLinks.twitter.trim()  ? parsed.socialLinks.twitter.trim()  : null,
    },
  };
}

/**
 * Did a parser actually recover anything?
 *
 * This is the line between "the candidate's resume is thin" and "our parser
 * produced nothing", so it counts only SECTION-level evidence: skills,
 * experience, education, achievements or a summary.
 *
 * The header fields are deliberately excluded. `headline` is whatever the
 * first short line of the document happened to be and `location` is any
 * "Word, Word" pair, so feeding a PDF's raw bytes through the parser yields
 * both — and scoring that produced 8/F for `%PDF-1.4 endstream endobj xref`,
 * which is the same class of lie as the 0/F this whole change exists to
 * remove. A social link or a website URL is excluded for the same reason: a
 * regex finds those in a garbled byte stream too.
 */
export function hasUsableParse(p: ParsedResume): boolean {
  return Boolean(
    p.bio || p.skills.length || p.experience.length
    || p.education.length || p.achievements.length,
  );
}

/**
 * The deterministic parser, adapted to the stored shape.
 *
 * `parseResumeText` is the same heading-driven sectioner the ATS evaluator
 * already trusts (lib/server/ats/resume-text.ts) — it is pure, it reaches no
 * network, and it cannot be taken down by a model retirement. Its output is a
 * `ParsedResumeInput`, which differs from `ParsedResume` only in that its
 * optional fields may be `undefined`; `sanitizeParsedResume` reconciles that.
 */
export function parseResumeDeterministic(text: string): ParsedResume {
  const parsed = parseResumeText(text);
  return sanitizeParsedResume({
    headline: parsed.headline ?? null,
    bio: parsed.bio ?? null,
    location: parsed.location ?? null,
    website: parsed.website ?? null,
    skills: parsed.skills ?? [],
    experience: (parsed.experience ?? []).map((e) => ({
      title: e.title ?? '', company: e.company ?? '', period: e.period ?? '', desc: e.desc ?? null,
    })),
    education: (parsed.education ?? []).map((e) => ({
      degree: e.degree ?? '', school: e.school ?? '', year: e.year ?? null,
    })),
    achievements: (parsed.achievements ?? []).map((a) => ({ title: a.title ?? '', desc: a.desc ?? null })),
    socialLinks: {
      linkedin: parsed.socialLinks?.linkedin ?? null,
      github: parsed.socialLinks?.github ?? null,
      twitter: parsed.socialLinks?.twitter ?? null,
    },
  });
}

/** Where the stored parse came from. `none` means BOTH parsers came up empty. */
export type ParseSource = 'ai' | 'deterministic' | 'none';

export interface ResolvedParse {
  parsed: ParsedResume;
  source: ParseSource;
  /**
   * The resume-quality score — `null` when no parser recovered anything.
   *
   * Null is the whole point. A number here is a statement about the candidate;
   * publishing 0 because Groq was down made that statement falsely.
   */
  atsScore: AtsScore | null;
  /** Diagnostics for the server log. Never contains resume text. */
  notes: string[];
}

/**
 * Strip the code fence a model adds even when told not to, then take the
 * outermost object if the response has prose wrapped around it.
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (!clean) return null;
  try {
    const direct = JSON.parse(clean) as unknown;
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>;
  } catch { /* fall through to the brace scan */ }
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const scanned = JSON.parse(match[0]) as unknown;
    if (scanned && typeof scanned === 'object' && !Array.isArray(scanned)) return scanned as Record<string, unknown>;
  } catch { /* unparseable */ }
  return null;
}

/**
 * AI first, deterministic parser second, honest failure third.
 *
 * `runAi` is injected rather than imported so this is testable without a
 * network: the route passes the real Groq call, the self-test passes a stub
 * that reproduces each way the model has actually failed in production.
 *
 * The fallback runs whenever the AI leg does not yield usable data — a thrown
 * request, `model_not_found`, a timeout, malformed JSON, a well-formed but
 * empty object, or AI not being configured at all. Every one of those is the
 * same fact from this function's point of view: no parse yet, try the parser
 * that cannot fail for external reasons.
 */
export async function resolveParsedResume(
  text: string,
  runAi: (() => Promise<string>) | null,
): Promise<ResolvedParse> {
  const notes: string[] = [];

  if (runAi) {
    let raw = '';
    try {
      raw = await runAi();
    } catch (err) {
      notes.push(`ai-request-failed:${err instanceof Error ? err.name : 'error'}`);
    }

    if (!notes.length && !raw.trim()) notes.push('ai-empty-response');

    if (raw.trim()) {
      const object = extractJsonObject(raw);
      if (!object) {
        notes.push('ai-unparseable-json');
      } else {
        const candidate = sanitizeParsedResume(object as Partial<ParsedResume>);
        if (hasUsableParse(candidate)) {
          return { parsed: candidate, source: 'ai', atsScore: computeAts(candidate), notes };
        }
        notes.push('ai-empty-parse');
      }
    }
  } else {
    notes.push('ai-not-configured');
  }

  /* The deterministic leg. It is pure and local, so the only way it yields
     nothing is that the extracted text genuinely carries no resume. */
  let fallback = EMPTY_PARSED_RESUME;
  try {
    fallback = parseResumeDeterministic(text);
  } catch (err) {
    notes.push(`deterministic-parser-threw:${err instanceof Error ? err.name : 'error'}`);
  }

  if (hasUsableParse(fallback)) {
    notes.push('deterministic-fallback-used');
    return { parsed: fallback, source: 'deterministic', atsScore: computeAts(fallback), notes };
  }

  /* Both legs empty. NOTHING is invented and NO score is published: the caller
     reports a parse failure, which the UI renders as "not scored" rather than
     as the candidate having scored zero. */
  notes.push('all-parsers-empty');
  return { parsed: EMPTY_PARSED_RESUME, source: 'none', atsScore: null, notes };
}
