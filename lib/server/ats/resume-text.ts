/**
 * Plain resume TEXT → the parsed shape the engine already understands.
 *
 * THIS IS NOT A SECOND DOCUMENT PARSER. PDF and DOCX extraction stays where it
 * already lives (lib/server/document-parser.ts), and a member's uploaded resume
 * stays where it is already parsed (resumeFiles[].parsedData). This file covers
 * the one case neither of those does: a caller who has nothing but a block of
 * text — pasted into a box, or extracted upstream — and no stored profile to
 * read. It sections that text so `normalizeResume` sees the same shape it would
 * have seen from the database.
 *
 * Everything here is heading-driven and conservative. A section it cannot find
 * is left EMPTY rather than guessed at: an empty Skills section is a finding
 * the audit will report, whereas an invented one is a lie the score is built
 * on. Deliberately clock-free and dependency-free, like the rest of the engine.
 */
import { normalizeWhitespace } from './text';
import type { ParsedResumeInput } from './resume';

/** Headings that open a section, by the section they open. */
const HEADINGS: Array<{ key: SectionKey; patterns: RegExp }> = [
  { key: 'summary', patterns: /^(professional\s+)?(summary|profile|objective|about(\s+me)?)\b/i },
  { key: 'skills', patterns: /^(technical\s+|core\s+)?(skills|technologies|tech\s+stack|competencies|tools)\b/i },
  { key: 'experience', patterns: /^(work\s+|professional\s+|employment\s+)?(experience|history|employment)\b/i },
  { key: 'projects', patterns: /^(projects?|case\s+studies|portfolio)\b/i },
  { key: 'education', patterns: /^(education|academics?|qualifications?)\b/i },
  { key: 'certifications', patterns: /^(certifications?|licen[cs]es?|credentials)\b/i },
  { key: 'achievements', patterns: /^(achievements?|accomplishments?|awards?|honou?rs)\b/i },
];

type SectionKey =
  | 'summary' | 'skills' | 'experience' | 'projects'
  | 'education' | 'certifications' | 'achievements' | 'header';

/** A heading line is short, and is a heading — not a sentence that starts like one. */
function headingFor(line: string): SectionKey | null {
  const text = line.trim().replace(/[:–—-]+$/, '').trim();
  if (!text || text.length > 40) return null;
  if (/[.!?]$/.test(text)) return null;
  for (const { key, patterns } of HEADINGS) {
    if (patterns.test(text)) return key;
  }
  return null;
}

function splitSections(text: string): Record<SectionKey, string[]> {
  const sections: Record<SectionKey, string[]> = {
    header: [], summary: [], skills: [], experience: [],
    projects: [], education: [], certifications: [], achievements: [],
  };
  let current: SectionKey = 'header';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r/g, '');
    const heading = headingFor(line);
    if (heading) { current = heading; continue; }
    if (line.trim()) sections[current].push(line.trimEnd());
  }
  return sections;
}

/** Skill list lines are comma/pipe/bullet separated fragments, not prose. */
function parseSkills(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    /* Drop a "Languages:" style label so the label is not read as a skill. */
    const body = line.replace(/^[\s•\-*]*[A-Za-z /&]{2,24}:\s*/, '');
    for (const part of body.split(/[,;|•]/)) {
      const value = normalizeWhitespace(part).replace(/^[-*\s]+/, '');
      /* A "skill" of five words is a sentence; keeping it would pollute the
         skills-only text the evidence check depends on. */
      if (value && value.length <= 40 && value.split(/\s+/).length <= 4) out.push(value);
    }
  }
  return Array.from(new Set(out));
}

/* A role header carries a period; the lines under it are its bullets. */
const PERIOD_RE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b)\s*(?:–|—|-{1,2}|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{1,2}\/\d{4}|\b(?:19|20)\d{2}\b|present|current|now)/i;

function parseExperience(lines: string[]): NonNullable<ParsedResumeInput['experience']> {
  const roles: NonNullable<ParsedResumeInput['experience']> = [];
  let current: { title: string; company: string; period: string; desc: string[] } | null = null;

  const push = () => {
    if (current) roles.push({ ...current, desc: current.desc.join('\n') });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isBullet = /^[•\-*]/.test(trimmed);
    const period = !isBullet ? trimmed.match(PERIOD_RE) : null;

    if (period) {
      push();
      /* "Senior Engineer — Acme — Jan 2021 - Present": everything before the
         period, split on the usual separators. */
      const head = normalizeWhitespace(trimmed.slice(0, period.index ?? 0))
        .replace(/[–—|,;-]+\s*$/, '');
      const parts = head.split(/\s*(?:–|—|\||,| at | - )\s*/).filter(Boolean);
      current = {
        title: normalizeWhitespace(parts[0] ?? ''),
        company: normalizeWhitespace(parts[1] ?? ''),
        period: normalizeWhitespace(period[0]),
        desc: [],
      };
      continue;
    }
    if (current) {
      current.desc.push(normalizeWhitespace(trimmed.replace(/^[•\-*]\s*/, '')));
    } else if (!isBullet && trimmed.length <= 80) {
      /* A role header with no readable period. Kept, with an empty period —
         the audit reports the missing date rather than the engine inventing it. */
      const parts = trimmed.split(/\s*(?:–|—|\||,| at | - )\s*/).filter(Boolean);
      current = {
        title: normalizeWhitespace(parts[0] ?? ''),
        company: normalizeWhitespace(parts[1] ?? ''),
        period: '',
        desc: [],
      };
    }
  }
  push();
  return roles.filter((r) => r.title || r.desc);
}

const DEGREE_RE = /\b(bachelor'?s?|master'?s?|b\.?tech|b\.?e\b|b\.?sc|bca|ba|bs|m\.?tech|m\.?sc|mca|mba|ms|ph\.?d|doctorate|diploma)\b/i;

function parseEducation(lines: string[]): NonNullable<ParsedResumeInput['education']> {
  return lines
    .map((line) => normalizeWhitespace(line.replace(/^[•\-*]\s*/, '')))
    .filter(Boolean)
    .map((line) => {
      const year = line.match(/\b(19|20)\d{2}\b/)?.[0] ?? '';
      const parts = line.split(/\s*(?:–|—|\||,| at | - )\s*/).filter(Boolean);
      const degreePart = parts.find((p) => DEGREE_RE.test(p)) ?? parts[0] ?? line;
      const schoolPart = parts.find((p) => p !== degreePart && !/^\d{4}$/.test(p.trim())) ?? '';
      return {
        degree: normalizeWhitespace(degreePart.replace(/\b(19|20)\d{2}\b/, '')),
        school: normalizeWhitespace(schoolPart.replace(/\b(19|20)\d{2}\b/, '')),
        year,
      };
    })
    .filter((e) => e.degree || e.school);
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /https?:\/\/[^\s,;]+/i;

/**
 * Structure a block of resume text.
 *
 * The result feeds `normalizeResume(parsed, rawText)` — pass the ORIGINAL text
 * as the second argument too, so contact detection still sees anything the
 * sectioner did not classify.
 */
export function parseResumeText(text: string): ParsedResumeInput {
  const normalized = text.replace(/\r\n?/g, '\n');
  const sections = splitSections(normalized);

  const headerText = sections.header.join('\n');
  const linkedin = headerText.match(/https?:\/\/[^\s,;]*linkedin\.com[^\s,;]*/i)?.[0]
    ?? normalized.match(/https?:\/\/[^\s,;]*linkedin\.com[^\s,;]*/i)?.[0] ?? null;
  const github = headerText.match(/https?:\/\/[^\s,;]*github\.com[^\s,;]*/i)?.[0]
    ?? normalized.match(/https?:\/\/[^\s,;]*github\.com[^\s,;]*/i)?.[0] ?? null;
  const website = headerText.match(URL_RE)?.[0] ?? null;

  /* The headline is the first non-contact header line — usually the name or the
     target role. Lines that are only an email, phone or link are skipped. */
  const headline = sections.header
    .map(normalizeWhitespace)
    .find((line) =>
      line.length >= 3 && line.length <= 80
      && !EMAIL_RE.test(line) && !URL_RE.test(line)
      && !/^\+?[\d\s()-]{7,}$/.test(line)) ?? null;

  /* A location line: "City, Country" without a URL or an @. */
  const location = sections.header
    .map(normalizeWhitespace)
    .find((line) => /^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(line)
      && !EMAIL_RE.test(line) && line.length <= 60) ?? null;

  const experience = parseExperience([...sections.experience, ...sections.projects]);

  return {
    headline,
    bio: normalizeWhitespace(sections.summary.join(' ')) || null,
    location,
    website: website && website !== linkedin && website !== github ? website : null,
    skills: parseSkills(sections.skills),
    experience,
    education: parseEducation(sections.education),
    achievements: sections.achievements
      .map((line) => normalizeWhitespace(line.replace(/^[•\-*]\s*/, '')))
      .filter(Boolean)
      .map((title) => ({ title })),
    certifications: sections.certifications
      .map((line) => normalizeWhitespace(line.replace(/^[•\-*]\s*/, '')))
      .filter(Boolean),
    socialLinks: { linkedin, github, twitter: null },
  };
}
