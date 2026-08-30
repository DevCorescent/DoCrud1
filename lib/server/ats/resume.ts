/**
 * Normalized resume — the engine's single view of a candidate.
 *
 * REUSES THE EXISTING PARSER. Docrud already parses every upload into
 * `resumeFiles[].parsedData` (see lib/server/user-profiles.ts and
 * app/api/profile/upload-resume/route.ts), and lib/server/document-parser.ts
 * already turns PDF/DOCX into text. This file builds no third parser; it
 * accepts either of those two shapes and normalizes them into one model, so a
 * scorer never has to know where the resume came from.
 */
import {
  classifyVerb, containsPhrase, extractMetrics, extractSkills, hasScaleLanguage,
  normalizeWhitespace, detectSeniority,
} from './text';

/** The stored shape, matching `resumeFiles[].parsedData` exactly. */
export interface ParsedResumeInput {
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  skills?: string[];
  experience?: Array<{ title?: string; company?: string; period?: string; desc?: string }>;
  education?: Array<{ degree?: string; school?: string; year?: string }>;
  achievements?: Array<{ title?: string; desc?: string }>;
  certifications?: string[];
  socialLinks?: { linkedin?: string | null; github?: string | null; twitter?: string | null };
}

export interface ResumeBullet {
  text: string;
  role: string;
  /** True for bullets from the two most recent roles — see `recentRoleCount`. */
  recent: boolean;
}

export interface NormalizedResume {
  /** Everything, joined — used for presence checks only, never for scoring alone. */
  fullText: string;
  /** ONLY the skills list. A skill found here and nowhere else is unproven. */
  skillsSectionText: string;
  /** Experience, projects and achievements — where a skill can be PROVEN. */
  narrativeText: string;
  declaredSkills: string[];
  canonicalSkills: string[];
  bullets: ResumeBullet[];
  titles: string[];
  seniority: string | null;
  /** Years computed from the resume's own periods. Null when undateable. */
  totalYears: number | null;
  education: Array<{ degree: string; school: string; year: string }>;
  certifications: string[];
  contact: {
    email: boolean; phone: boolean; location: boolean;
    linkedin: boolean; github: boolean; portfolio: boolean;
  };
  sections: {
    contact: boolean; experience: boolean; education: boolean; skills: boolean;
    summary: boolean; projects: boolean; certifications: boolean;
  };
  /** Periods the engine could not read — reported, never guessed at. */
  malformedDates: string[];
  charCount: number;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d[\d\s-]{7,}\d/;

/* Periods this engine can read. Anything else is REPORTED as malformed rather
   than guessed at — a wrong date silently distorts the years calculation. */
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const DATE_TOKEN = new RegExp(
  `(?:(?:${MONTHS})[a-z]*\\.?\\s+)?(\\d{4})|(\\d{1,2})[/-](\\d{4})|present|current|now`, 'i',
);

/**
 * A period as fractional years — "Jan 2019" is 2019.0, "Dec 2020" is 2021.0
 * (the month is inclusive, so it runs to the end of December).
 *
 * Month precision matters: rounding to whole years read "Jan 2019 – Dec 2020"
 * as one year instead of two, which halved most candidates' tenure and made
 * the seniority flag fire on people who met the requirement.
 */
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function readEndpoint(chunk: string, inclusive: boolean): { value: number | null; present: boolean } {
  const text = chunk.trim().toLowerCase();
  if (!text) return { value: null, present: false };
  if (/present|current|now|ongoing/.test(text)) return { value: null, present: true };

  const year = text.match(/\b(19|20)\d{2}\b/);
  if (!year) return { value: null, present: false };
  const y = Number(year[0]);

  const named = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  const numeric = text.match(/\b(\d{1,2})[/-](?:19|20)\d{2}\b/);
  let month: number | null = null;
  if (named) month = MONTH_INDEX[named[1]];
  else if (numeric) {
    const m = Number(numeric[1]);
    if (m >= 1 && m <= 12) month = m - 1;
  }

  /* No month named: a start is the beginning of the year, an end is its end. */
  if (month === null) return { value: inclusive ? y + 1 : y, present: false };
  return { value: y + (month + (inclusive ? 1 : 0)) / 12, present: false };
}

function readPeriod(period: string): { start: number | null; end: number | null; present: boolean; ok: boolean } {
  const text = period.trim().toLowerCase();
  if (!text) return { start: null, end: null, present: false, ok: false };

  const parts = text.split(/\s*(?:\u2013|\u2014|-{1,2}|to)\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const a = readEndpoint(parts[0], false);
    const b = readEndpoint(parts[parts.length - 1], true);
    return { start: a.value, end: b.value, present: b.present, ok: a.value !== null };
  }
  const single = readEndpoint(parts[0] ?? '', false);
  return {
    start: single.value,
    end: single.value === null ? null : single.value + 1,
    present: single.present,
    ok: single.value !== null || single.present,
  };
}

/** How many leading roles count as "recent" for evidence strength. */
const RECENT_ROLE_COUNT = 2;

function splitBullets(desc: string): string[] {
  return desc
    .split(/\n+|(?<=[.;])\s+(?=[A-Z])|•|(?:^|\s)[-*]\s+/g)
    .map((s) => normalizeWhitespace(s.replace(/^[•\-*\s]+/, '')))
    .filter((s) => s.length >= 12);
}

/**
 * Build the model from Docrud's already-parsed resume data.
 * `rawText` is optional and only improves section/contact detection.
 */
export function normalizeResume(parsed: ParsedResumeInput, rawText = ''): NormalizedResume {
  const experience = (parsed.experience ?? []).filter(Boolean);
  const education = (parsed.education ?? []).map((e) => ({
    degree: normalizeWhitespace(e.degree ?? ''),
    school: normalizeWhitespace(e.school ?? ''),
    year: normalizeWhitespace(e.year ?? ''),
  })).filter((e) => e.degree || e.school);

  const declaredSkills = (parsed.skills ?? []).map(normalizeWhitespace).filter(Boolean);
  const skillsSectionText = declaredSkills.join(' , ');

  const bullets: ResumeBullet[] = [];
  experience.forEach((role, index) => {
    const roleName = normalizeWhitespace(role.title ?? '') || 'Experience';
    for (const text of splitBullets(role.desc ?? '')) {
      bullets.push({ text, role: roleName, recent: index < RECENT_ROLE_COUNT });
    }
  });
  for (const achievement of parsed.achievements ?? []) {
    const text = normalizeWhitespace([achievement.title, achievement.desc].filter(Boolean).join(' — '));
    if (text.length >= 12) bullets.push({ text, role: 'Achievements', recent: true });
  }

  const narrativeParts = [
    ...experience.map((r) => [r.title, r.company, r.desc].filter(Boolean).join(' ')),
    ...(parsed.achievements ?? []).map((a) => [a.title, a.desc].filter(Boolean).join(' ')),
    parsed.bio ?? '',
  ];
  const narrativeText = normalizeWhitespace(narrativeParts.join('\n'));

  const fullText = normalizeWhitespace([
    parsed.headline ?? '', parsed.bio ?? '', parsed.location ?? '', parsed.website ?? '',
    skillsSectionText, narrativeText,
    education.map((e) => `${e.degree} ${e.school} ${e.year}`).join(' '),
    (parsed.certifications ?? []).join(' '),
    parsed.socialLinks?.linkedin ?? '', parsed.socialLinks?.github ?? '',
    rawText,
  ].filter(Boolean).join('\n'));

  const malformedDates = experience
    .map((r) => normalizeWhitespace(r.period ?? ''))
    .filter((p) => p && (!DATE_TOKEN.test(p) || !readPeriod(p).ok));

  /* Total years: the union of readable spans, so overlapping roles are not
     double-counted. An ongoing role runs to the latest point the resume itself
     mentions, or a year past its own start, whichever is later — this engine
     has no clock, and reading "Present" off the wall would make the same
     resume score differently next month. */
  const endpoints = experience.flatMap((r) => {
    const { start, end } = readPeriod(r.period ?? '');
    return [start, end].filter((v): v is number => v !== null);
  });
  const latestPoint = endpoints.length ? Math.max(...endpoints) : 0;

  let totalYears: number | null = null;
  const spans = experience
    .map((r) => readPeriod(r.period ?? ''))
    .filter((s) => s.start !== null)
    .map((s) => ({
      start: s.start as number,
      end: s.present
        ? Math.max(latestPoint, (s.start as number) + 1)
        : Math.max(s.end ?? (s.start as number), s.start as number),
    }));
  if (spans.length) {
    spans.sort((a, b) => a.start - b.start);
    let covered = 0;
    let cursor = -Infinity;
    for (const span of spans) {
      const from = Math.max(span.start, cursor);
      if (span.end > from) covered += span.end - from;
      cursor = Math.max(cursor, span.end);
    }
    totalYears = Math.round(Math.max(0, covered) * 10) / 10;
  }

  const titles = experience.map((r) => normalizeWhitespace(r.title ?? '')).filter(Boolean);
  const headline = normalizeWhitespace(parsed.headline ?? '');
  const seniority = [headline, ...titles].map(detectSeniority).find(Boolean) ?? null;

  const links = parsed.socialLinks ?? {};
  const contact = {
    email: EMAIL_RE.test(fullText),
    phone: PHONE_RE.test(rawText || fullText),
    location: Boolean(normalizeWhitespace(parsed.location ?? '')),
    linkedin: Boolean(links.linkedin) || /linkedin\.com/i.test(fullText),
    github: Boolean(links.github) || /github\.com/i.test(fullText),
    portfolio: Boolean(normalizeWhitespace(parsed.website ?? ''))
      || /behance|dribbble|notion\.site|portfolio/i.test(fullText),
  };

  const certifications = (parsed.certifications ?? []).map(normalizeWhitespace).filter(Boolean);

  return {
    fullText,
    skillsSectionText,
    narrativeText,
    declaredSkills,
    canonicalSkills: extractSkills([skillsSectionText, narrativeText].join('\n')),
    bullets,
    titles,
    seniority,
    totalYears,
    education,
    certifications,
    contact,
    sections: {
      contact: contact.email || contact.phone,
      experience: experience.length > 0,
      education: education.length > 0,
      skills: declaredSkills.length > 0,
      summary: Boolean(normalizeWhitespace(parsed.bio ?? '')),
      projects: /projects?|case stud/i.test(rawText) || (parsed.achievements ?? []).length > 0,
      certifications: certifications.length > 0
        || (rawText ? containsPhrase(rawText, 'certification') : false),
    },
    malformedDates,
    charCount: fullText.length,
  };
}

/** Bullet-level facts the impact scorer needs, computed once. */
export function describeBullet(bullet: ResumeBullet) {
  const { tier, verb } = classifyVerb(bullet.text);
  const metrics = extractMetrics(bullet.text);
  return {
    tier,
    verb,
    metrics,
    hasResult: metrics.length > 0 || hasScaleLanguage(bullet.text),
    skills: extractSkills(bullet.text),
  };
}
