/**
 * Module 1 — Parsing & Structural Audit, plus the Resume Quality Score.
 *
 * The audit is a GATE, not a percentage. Giving it a share of the 100 would
 * break the requested 45/35/20 split, and it answers a different question
 * anyway: not "does this resume suit this job" but "can this document be read
 * at all". A resume nobody can parse must not score 85 because it was stuffed
 * with the right words, so a broken parse CAPS the final score instead.
 *
 * Optional sections never fail a resume. Plenty of strong resumes carry no
 * Projects section, and penalising that would be a formatting opinion, not an
 * ATS finding.
 */
import { clamp, round1 } from './text';
import type { NormalizedResume } from './resume';
import type { ImpactAnalysis, KeywordAnalysis, ParsingAudit } from './types';

/** What each level of brokenness caps the final score at. */
const CAP_EMPTY = 10;
const CAP_UNREADABLE = 25;
const CAP_DEGRADED = 70;
const CAP_HEALTHY = 100;

/** Below this many characters a "resume" carries no information to score. */
const MIN_READABLE_CHARS = 120;

export function auditResume(resume: NormalizedResume): ParsingAudit {
  const criticalMissingElements: string[] = [];
  const redFlags: string[] = [];

  if (!resume.contact.email) criticalMissingElements.push('Email address');
  if (!resume.contact.phone) criticalMissingElements.push('Phone number');
  if (!resume.contact.location) criticalMissingElements.push('Location');
  if (!resume.contact.linkedin) criticalMissingElements.push('LinkedIn URL');
  if (!resume.sections.experience) criticalMissingElements.push('Experience section');
  if (!resume.sections.education) criticalMissingElements.push('Education section');
  if (!resume.sections.skills) criticalMissingElements.push('Skills section');

  if (resume.malformedDates.length) {
    redFlags.push(
      `${resume.malformedDates.length} experience date${resume.malformedDates.length === 1 ? '' : 's'} could not be read (${resume.malformedDates.slice(0, 2).join('; ')})`,
    );
  }
  if (resume.sections.experience && resume.bullets.length === 0) {
    redFlags.push('Experience entries have no descriptions, so no achievement can be assessed');
  }
  const longBullets = resume.bullets.filter((b) => b.text.length > 320).length;
  if (longBullets) redFlags.push(`${longBullets} bullet(s) run past 320 characters and will be truncated by many parsers`);
  if (resume.charCount > 24000) redFlags.push('Resume text is unusually long, which slows or truncates ATS parsing');
  if (!resume.sections.summary) redFlags.push('No professional summary, so the target role is not stated up front');

  /* Parser health. Note the ORDER: emptiness is checked before structure, so a
     blank document is never described as merely "missing sections". */
  let parserQuality: ParsingAudit['parserQuality'] = 'healthy';
  if (resume.charCount === 0) parserQuality = 'empty';
  else if (resume.charCount < MIN_READABLE_CHARS) parserQuality = 'unreadable';
  else if (!resume.sections.experience && !resume.sections.skills) parserQuality = 'unreadable';
  else if (criticalMissingElements.length >= 4 || !resume.sections.experience) parserQuality = 'degraded';

  const scoreCap =
    parserQuality === 'empty' ? CAP_EMPTY
    : parserQuality === 'unreadable' ? CAP_UNREADABLE
    : parserQuality === 'degraded' ? CAP_DEGRADED
    : CAP_HEALTHY;

  return {
    parserQuality,
    scoreCap,
    sectionCoverage: resume.sections,
    contactCompleteness: resume.contact,
    criticalMissingElements,
    redFlags,
  };
}

/**
 * Resume Quality, 0..100 — a SEPARATE axis from the match score.
 *
 * Deliberately job-independent apart from the stuffing signal: it answers "is
 * this a well-built resume", which stays true whichever job it is sent to. It
 * is never added to the ATS match score; the two are reported side by side
 * precisely because a strong resume aimed at the wrong role scores high here
 * and low there, and that difference is the useful information.
 */
export function scoreResumeQuality(
  resume: NormalizedResume,
  audit: ParsingAudit,
  impact: ImpactAnalysis,
  keyword: KeywordAnalysis,
): number {
  const contactValues = Object.values(resume.contact);
  const contactScore = (contactValues.filter(Boolean).length / contactValues.length) * 100;

  /* Only the sections a resume genuinely needs. Projects and certifications
     are excluded on purpose — their absence is a choice, not a defect. */
  const requiredSections = [
    resume.sections.contact, resume.sections.experience,
    resume.sections.education, resume.sections.skills, resume.sections.summary,
  ];
  const sectionScore = (requiredSections.filter(Boolean).length / requiredSections.length) * 100;

  const bulletScore = impact.bullets.length
    ? impact.bullets.reduce((sum, b) => sum + b.quality, 0) / impact.bullets.length
    : 0;

  const datePenalty = Math.min(20, resume.malformedDates.length * 10);
  const stuffPenalty = keyword.stuffing.penalty;
  const flagPenalty = Math.min(12, audit.redFlags.length * 4);

  const score = clamp(
    contactScore * 0.20
    + sectionScore * 0.20
    + bulletScore * 0.25
    + impact.actionVerbScore * 0.15
    + clamp(impact.quantificationRate * 2) * 0.20
    - datePenalty - stuffPenalty - flagPenalty,
  );
  return round1(score);
}
