/**
 * Module 4 — Title, Seniority & Education Alignment. 20% of the final score.
 *
 * This bucket exists so that technical overlap cannot hide a structural
 * mismatch. A candidate with 1.5 years and every listed technology is still
 * not the Senior Engineer with 5 years the posting asked for, and a report
 * that scores them 90% is not telling them the truth.
 */
import { clamp, round1, containsPhrase, SENIORITY_LADDER, titleTokens } from './text';
import { skillEntry } from './skill-taxonomy';
import type { NormalizedResume } from './resume';
import type { NormalizedJd } from './jd';
import type { AlignmentAnalysis } from './types';

/** Weights inside the 20% bucket. They sum to 1. */
const W_TITLE = 0.40;
const W_SENIORITY = 0.25;
const W_EDUCATION = 0.25;
const W_CERT = 0.10;

/** Each level of shortfall costs this much of the seniority sub-score. */
const SENIORITY_STEP_PENALTY = 30;
/** Being far above the level is a mild mismatch, not a failure. */
const OVERQUALIFIED_STEP_PENALTY = 8;

/** Degrees, ordered, so "Master's" satisfies a posting asking for "Bachelor's". */
const DEGREE_LADDER: Array<{ level: number; patterns: string[] }> = [
  { level: 1, patterns: ['diploma', 'certificate'] },
  { level: 2, patterns: ["bachelor", "bachelor's", 'bachelors', 'b.tech', 'btech', 'b.e', 'be', 'b.sc', 'bsc', 'bca', 'ba', 'bs'] },
  { level: 3, patterns: ["master", "master's", 'masters', 'm.tech', 'mtech', 'm.sc', 'msc', 'mca', 'mba', 'ms'] },
  { level: 4, patterns: ['ph.d', 'phd', 'doctorate'] },
];

function degreeLevel(text: string): number {
  let best = 0;
  for (const rung of DEGREE_LADDER) {
    if (rung.patterns.some((p) => containsPhrase(text, p))) best = Math.max(best, rung.level);
  }
  return best;
}

/**
 * Title similarity, 0..100.
 *
 * Token overlap over the job-defining words only — seniority words are
 * stripped first, because seniority is scored separately and would otherwise
 * be counted twice. "Senior Backend Engineer" vs "Backend Developer" should
 * turn on `backend`, not on `senior`.
 */
function scoreTitle(jdTitle: string, resumeTitles: string[]): { score: number; best: string | null } {
  const target = titleTokens(jdTitle);
  if (!target.length || !resumeTitles.length) return { score: 0, best: null };

  /* Words that describe the same job. Kept small and explicit: a generous
     synonym list is how "Frontend Developer" starts matching "Backend
     Engineer". */
  const EQUIVALENT: Record<string, string[]> = {
    engineer: ['developer', 'programmer'],
    developer: ['engineer', 'programmer'],
    programmer: ['engineer', 'developer'],
    analyst: ['analytics'],
    manager: ['lead'],
  };

  let bestScore = 0;
  let bestTitle: string | null = null;

  for (const title of resumeTitles) {
    const tokens = titleTokens(title);
    if (!tokens.length) continue;
    let hits = 0;
    for (const want of target) {
      if (tokens.includes(want)) { hits += 1; continue; }
      if ((EQUIVALENT[want] ?? []).some((alt) => tokens.includes(alt))) { hits += 0.85; continue; }
    }
    /* Measured against what the JOB asked for, so extra words in a resume
       title neither help nor hurt. */
    const score = clamp((hits / target.length) * 100);
    if (score > bestScore) { bestScore = score; bestTitle = title; }
  }
  return { score: round1(bestScore), best: bestTitle };
}

export function analyzeAlignment(resume: NormalizedResume, jd: NormalizedJd): AlignmentAnalysis {
  const { score: titleScore, best: bestResumeTitle } = scoreTitle(jd.title, resume.titles);

  /* Seniority. Only scored when the posting states one — inferring a level the
     job never asked for would invent a mismatch. */
  const jdIndex = jd.seniority ? SENIORITY_LADDER.indexOf(jd.seniority) : -1;
  const resumeIndex = resume.seniority ? SENIORITY_LADDER.indexOf(resume.seniority) : -1;
  let seniorityScore = 100;
  let seniorityMismatch = false;
  if (jdIndex >= 0 && resumeIndex >= 0) {
    const gap = jdIndex - resumeIndex;
    if (gap > 0) {
      seniorityScore = clamp(100 - gap * SENIORITY_STEP_PENALTY);
      seniorityMismatch = gap >= 2;
    } else if (gap < 0) {
      seniorityScore = clamp(100 - Math.min(3, -gap) * OVERQUALIFIED_STEP_PENALTY);
    }
  } else if (jdIndex >= 0 && resumeIndex < 0) {
    /* The job states a level and the resume never claims one. Not a failure —
       the resume simply did not say — but not full marks either. */
    seniorityScore = 70;
  }

  /* A years shortfall is itself a seniority signal, and the most objective one
     available. Two levels of title gap OR half the required years is the line. */
  if (jd.requiredYears && resume.totalYears !== null && resume.totalYears < jd.requiredYears * 0.5) {
    seniorityMismatch = true;
    seniorityScore = Math.min(seniorityScore, 40);
  }

  /* Education. A posting that asks for nothing cannot be failed on it. */
  const resumeDegreeText = resume.education.map((e) => `${e.degree} ${e.school}`).join(' ');
  let educationScore = 100;
  let educationMet = true;
  if (jd.requiredEducation) {
    const wanted = degreeLevel(jd.requiredEducation);
    const held = degreeLevel(resumeDegreeText || resume.fullText);
    if (wanted > 0) {
      educationMet = held >= wanted;
      educationScore = educationMet ? 100 : held > 0 ? 55 : 20;
      /* A stated preference is not a requirement, so a shortfall costs less. */
      if (!jd.educationRequired && !educationMet) educationScore = Math.max(educationScore, 70);
    }
  }

  /* Certifications. A missing REQUIRED licence is the clearest possible
     disqualifier, so it zeroes its sub-score rather than shading it. */
  const missingCertifications = jd.requiredCertifications.filter((cert) => {
    const entry = skillEntry(cert);
    const surfaces = [cert, ...(entry?.aliases ?? [])];
    const inCertList = resume.certifications.some((held) =>
      surfaces.some((s) => containsPhrase(held, s)));
    return !inCertList && !surfaces.some((s) => containsPhrase(resume.fullText, s));
  });
  const certificationScore = jd.requiredCertifications.length === 0
    ? 100
    : clamp(((jd.requiredCertifications.length - missingCertifications.length)
        / jd.requiredCertifications.length) * 100);

  const score = clamp(
    titleScore * W_TITLE
    + seniorityScore * W_SENIORITY
    + educationScore * W_EDUCATION
    + certificationScore * W_CERT,
  );

  return {
    score: round1(score),
    titleScore,
    seniorityScore: round1(seniorityScore),
    educationScore: round1(educationScore),
    certificationScore: round1(certificationScore),
    jdTitle: jd.title,
    bestResumeTitle,
    jdSeniority: jd.seniority,
    resumeSeniority: resume.seniority,
    seniorityMismatch,
    educationMet,
    requiredEducation: jd.requiredEducation,
    missingCertifications,
  };
}
