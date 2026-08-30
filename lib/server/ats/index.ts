/**
 * ATS evaluation — the entry point.
 *
 *   evaluateAts(resume, jobDescription) → a 0..100 compatibility score
 *
 * The whole engine is pure: no I/O, no clock, no randomness, no model call.
 * Give it the same resume and the same job description and it returns the same
 * number, every time, on every machine — which is what lets a score be stored,
 * compared, disputed and regression-tested.
 *
 * THE SCORE IS COMPATIBILITY WITH ONE JOB DESCRIPTION. It is not a prediction
 * of being hired, and it is not a judgement of the candidate.
 */
import { normalizeResume, type NormalizedResume, type ParsedResumeInput } from './resume';
import { normalizeJd, type NormalizedJd } from './jd';
import { analyzeKeywords } from './keyword';
import { analyzeImpact } from './impact';
import { analyzeAlignment } from './alignment';
import { auditResume, scoreResumeQuality } from './audit';
import { renderReport } from './report';
import { clamp, round1 } from './text';
import type { AtsEvaluation } from './types';

export const WEIGHTS = { keyword: 0.45, experience: 0.35, alignment: 0.20 } as const;

const BANDS: Array<{ min: number; label: AtsEvaluation['band'] }> = [
  { min: 90, label: 'Exceptional Match' },
  { min: 75, label: 'Strong Match' },
  { min: 60, label: 'Good / Competitive' },
  { min: 50, label: 'Moderate Match' },
  { min: 25, label: 'Weak Match' },
  { min: 0, label: 'Poor Match' },
];

export function scoreBand(score: number): AtsEvaluation['band'] {
  return (BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1]).label;
}

export interface AtsInput {
  /** Docrud's already-parsed resume — `resumeFiles[].parsedData`. */
  resume: ParsedResumeInput;
  /** Raw resume text, when available. Improves contact/section detection only. */
  resumeText?: string;
  jobDescription: string;
  /** The posting's title. Falls back to the description's first line. */
  jobTitle?: string;
}

export function evaluateAts(input: AtsInput): AtsEvaluation {
  const resume: NormalizedResume = normalizeResume(input.resume, input.resumeText ?? '');
  const jd: NormalizedJd = normalizeJd(input.jobDescription ?? '', input.jobTitle ?? '');

  const audit = auditResume(resume);
  const keyword = analyzeKeywords(resume, jd);
  const impact = analyzeImpact(resume, jd);
  const alignment = analyzeAlignment(resume, jd);

  const rawScore = round1(clamp(
    keyword.score * WEIGHTS.keyword
    + impact.score * WEIGHTS.experience
    + alignment.score * WEIGHTS.alignment,
  ));

  /* The parsing gate. A cap, never a bonus: a clean parse cannot raise a
     score, it can only decline to lower it. */
  const overallScore = round1(Math.min(rawScore, audit.scoreCap));

  const result: AtsEvaluation = {
    overallScore,
    rawScore,
    band: scoreBand(overallScore),
    executiveSummary: buildSummary(overallScore, keyword, impact, alignment, audit),
    keyword, impact, alignment, audit,
    resumeQualityScore: scoreResumeQuality(resume, audit, impact, keyword),
    actionPlan: buildActionPlan(keyword, impact, alignment, audit),
    formula: {
      keywordScore: keyword.score, keywordWeight: 0.45,
      experienceScore: impact.score, experienceWeight: 0.35,
      alignmentScore: alignment.score, alignmentWeight: 0.20,
      scoreCap: audit.scoreCap,
    },
  };
  return result;
}

/** The markdown report for a completed evaluation. */
export function renderAtsReport(result: AtsEvaluation): string {
  return renderReport(result);
}

/**
 * Two objective sentences: what is strongest, what is weakest. Both are read
 * from the scores — nothing is characterised that was not measured.
 */
function buildSummary(
  score: number,
  keyword: AtsEvaluation['keyword'],
  impact: AtsEvaluation['impact'],
  alignment: AtsEvaluation['alignment'],
  audit: AtsEvaluation['audit'],
): string {
  if (audit.parserQuality === 'empty') {
    return 'No readable resume content was available, so this resume could not be evaluated against the job description. The score is capped until a parsable resume is supplied.';
  }
  if (!keyword.totalWeight) {
    return 'No recognisable requirements could be extracted from this job description, so keyword alignment could not be measured. Paste the full posting, including its requirements section, for a complete evaluation.';
  }

  const proven = keyword.strongMatches.slice(0, 3);
  const first = proven.length
    ? `Strongest alignment is in ${proven.join(', ')}, ${proven.length === 1 ? 'which is' : 'which are'} demonstrated in the experience rather than only listed.`
    : 'No required skill is both matched and demonstrated in the experience section, which is the largest single weakness here.';

  const weaknesses: Array<{ text: string; severity: number }> = [];
  if (keyword.missing.length) {
    weaknesses.push({ text: `${keyword.missing.length} required skill${keyword.missing.length === 1 ? '' : 's'} missing (${keyword.missing.slice(0, 3).join(', ')})`, severity: keyword.missing.length * 10 });
  }
  if (keyword.unproven.length) {
    weaknesses.push({ text: `${keyword.unproven.length} skill${keyword.unproven.length === 1 ? '' : 's'} claimed without supporting experience`, severity: keyword.unproven.length * 6 });
  }
  if (impact.quantificationRate < 30) {
    weaknesses.push({ text: `limited quantified impact (${Math.round(impact.quantificationRate)}% of bullets carry a measurable result)`, severity: 30 - impact.quantificationRate });
  }
  if (alignment.seniorityMismatch) {
    weaknesses.push({ text: 'a seniority gap against what the role asks for', severity: 45 });
  }
  if (alignment.missingCertifications.length) {
    weaknesses.push({ text: `a missing required certification (${alignment.missingCertifications.join(', ')})`, severity: 60 });
  }
  weaknesses.sort((a, b) => b.severity - a.severity);

  const second = weaknesses.length
    ? `The largest weaknesses are ${weaknesses.slice(0, 2).map((w) => w.text).join(' and ')}.`
    : `No major gaps were detected against this job description at ${Math.round(score)}% compatibility.`;

  return `${first} ${second}`;
}

/**
 * The three highest-impact fixes, ordered by how many points each recovers.
 *
 * Wording is deliberately conditional — "if you genuinely have it". The engine
 * cannot know whether a candidate has a skill, and telling someone to add one
 * they lack is telling them to lie.
 */
function buildActionPlan(
  keyword: AtsEvaluation['keyword'],
  impact: AtsEvaluation['impact'],
  alignment: AtsEvaluation['alignment'],
  audit: AtsEvaluation['audit'],
): string[] {
  const candidates: Array<{ text: string; value: number }> = [];

  if (keyword.missing.length) {
    const musts = keyword.matches
      .filter((m) => m.matchType === 'missing' && m.requirement.importance === 'must')
      .map((m) => m.requirement.canonical);
    const named = (musts.length ? musts : keyword.missing).slice(0, 3);
    candidates.push({
      text: `Add evidence of ${named.join(', ')} to your experience if you genuinely have it — ${musts.length ? 'these are stated as requirements' : 'these are named in the posting'} and are currently absent.`,
      value: (musts.length ? 40 : 25) + keyword.missing.length * 3,
    });
  }
  if (keyword.unproven.length) {
    candidates.push({
      text: `Move ${keyword.unproven.slice(0, 3).join(', ')} out of the skills list and into a bullet showing where you used them — listed-only skills earn 40% less credit than demonstrated ones.`,
      value: 20 + keyword.unproven.length * 4,
    });
  }
  if (impact.quantificationRate < 50 && impact.totalBullets > 0) {
    const target = Math.max(1, Math.ceil(impact.totalBullets * 0.5) - impact.quantifiedBullets);
    candidates.push({
      text: `Add measurable outcomes to ${target} more experience bullet${target === 1 ? '' : 's'} — ${impact.quantifiedBullets} of ${impact.totalBullets} currently carry a number.`,
      value: 50 - impact.quantificationRate,
    });
  }
  if (impact.actionVerbScore < 60) {
    candidates.push({
      text: 'Replace responsibility phrasing ("worked on", "responsible for") with achievement verbs such as Engineered, Reduced or Led.',
      value: 60 - impact.actionVerbScore,
    });
  }
  if (alignment.seniorityMismatch) {
    candidates.push({
      text: `This role targets a ${alignment.jdSeniority ?? 'more senior'} level than the resume currently evidences — lead a scoped piece of work you can point to, or target roles one level down while you build that record.`,
      value: 42,
    });
  }
  if (alignment.missingCertifications.length) {
    candidates.push({
      text: `${alignment.missingCertifications.join(', ')} is listed as required and does not appear on the resume — add it if you hold it, as this alone can filter the application out.`,
      value: 55,
    });
  }
  if (alignment.titleScore < 55 && alignment.jdTitle) {
    candidates.push({
      text: `Align your headline with the target role ("${alignment.jdTitle}") where your experience honestly supports it — your closest current title reads as ${alignment.bestResumeTitle ?? 'unrelated'}.`,
      value: 55 - alignment.titleScore,
    });
  }
  if (audit.criticalMissingElements.length) {
    candidates.push({
      text: `Add the missing contact and section details: ${audit.criticalMissingElements.slice(0, 4).join(', ')}.`,
      value: 15 + audit.criticalMissingElements.length * 6,
    });
  }
  if (keyword.stuffing.detected) {
    candidates.push({
      text: `Remove the repeated keywords (${keyword.stuffing.terms.join(', ')}) and state each skill once, in the context where you used it.`,
      value: 35,
    });
  }

  candidates.sort((a, b) => b.value - a.value);
  const plan = candidates.slice(0, 3).map((c) => c.text);
  if (!plan.length) {
    plan.push('No high-impact fixes were identified — this resume already aligns closely with the posting.');
  }
  return plan;
}

export type { AtsEvaluation } from './types';
export type { ParsedResumeInput, NormalizedResume } from './resume';
export type { NormalizedJd } from './jd';
export { normalizeResume } from './resume';
export { normalizeJd } from './jd';
