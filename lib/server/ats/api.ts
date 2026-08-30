/**
 * The ATS API's request/response layer — pure, and therefore testable.
 *
 * Everything a request does EXCEPT authentication lives here: validation,
 * normalization, evaluation and response shaping. The route
 * (app/api/ats/evaluate/route.ts) resolves the session and the caller's own
 * resume, then hands the payload to `runAtsEvaluation`. That split is what lets
 * every status code and every scoring path be tested by a plain script, with no
 * HTTP server and no next-auth in the loop.
 *
 * Nothing here calls a model, a clock, a database or the network. The same
 * payload always produces byte-identical JSON.
 */
import { evaluateAts, renderAtsReport } from './index';
import { parseResumeText } from './resume-text';
import { normalizeResume, type ParsedResumeInput } from './resume';
import type { AtsEvaluation, RequirementMatch } from './types';

/* ── Limits ───────────────────────────────────────────────────────────────
   Generous enough for a long CV and a long posting, small enough that a
   request cannot be used to burn CPU. Both are measured AFTER trimming. */
export const MAX_RESUME_CHARS = 60_000;
export const MAX_JD_CHARS = 30_000;
/** Below this a job description carries nothing to extract requirements from. */
const MIN_JD_CHARS = 20;
/** Quotes echoed back are capped so a response cannot mirror a whole resume. */
const MAX_QUOTE_CHARS = 400;

export type AtsErrorCode =
  | 'INVALID_INPUT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNPROCESSABLE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'SERVER_ERROR';

export interface AtsApiError {
  error: { code: AtsErrorCode; message: string };
}

export interface AtsApiResponse {
  score: number;
  label: AtsEvaluation['band'];
  summary: string;
  breakdown: {
    keyword: { score: number; weight: number; weightedScore: number };
    experience: { score: number; weight: number; weightedScore: number };
    alignment: { score: number; weight: number; weightedScore: number };
    /** The parsing gate. `capped` is true when it actually lowered the score. */
    parsingCap: { cap: number; applied: boolean; rawScore: number };
  };
  resumeQuality: { score: number };
  parsing: AtsEvaluation['audit'];
  keywords: Array<{
    requirement: string;
    importance: RequirementMatch['requirement']['importance'];
    kind: RequirementMatch['requirement']['kind'];
    status: RequirementMatch['matchType'];
    evidence: RequirementMatch['evidence'];
    contextualProof: boolean;
    matchedAs: string | null;
    proofQuote: string | null;
    credit: number;
  }>;
  impact: {
    score: number;
    actionVerbScore: number;
    quantificationRate: number;
    quantifiedBullets: number;
    totalBullets: number;
    relevanceScore: number;
    yearsScore: number;
    candidateYears: number | null;
    requiredYears: number | null;
    weakestBullet: AtsEvaluation['impact']['weakestBullet'];
  };
  alignment: AtsEvaluation['alignment'];
  actionPlan: string[];
  report: string;
}

export interface AtsApiPayload {
  /** Raw resume text. Sectioned by lib/server/ats/resume-text.ts. */
  resume?: unknown;
  /** Docrud's already-parsed resume. Preferred — nothing is re-parsed. */
  parsedResume?: unknown;
  /** Original text alongside `parsedResume`, for contact/section detection. */
  resumeText?: unknown;
  jobDescription?: unknown;
  jobTitle?: unknown;
}

export type AtsApiResult =
  | { status: 200; body: AtsApiResponse }
  | { status: 400 | 413 | 422 | 500; body: AtsApiError };

function fail(status: 400 | 413 | 422 | 500, code: AtsErrorCode, message: string): AtsApiResult {
  return { status, body: { error: { code, message } } };
}

/** Collapse runs of whitespace but keep line structure — the sectioner needs it. */
function tidy(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function clip(value: string | null): string | null {
  if (value === null) return null;
  return value.length <= MAX_QUOTE_CHARS ? value : `${value.slice(0, MAX_QUOTE_CHARS - 1)}…`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accept only the fields the engine reads, with only the types it expects.
 *
 * A resume is UNTRUSTED INPUT. Copying an arbitrary object through would let a
 * caller smuggle unexpected shapes into the scorers; taking a fixed, typed
 * subset means a payload can carry no field the engine did not ask for, and no
 * prototype pollution reaches it. Scoring rules live in code and cannot be
 * altered by anything inside a resume or a job description.
 */
function coerceParsedResume(value: Record<string, unknown>): ParsedResumeInput {
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? tidy(v) : null;
  const strList = (v: unknown, max: number): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(tidy).filter(Boolean).slice(0, max) : [];
  const objList = <T>(v: unknown, max: number, map: (row: Record<string, unknown>) => T): T[] =>
    Array.isArray(v) ? v.filter(isPlainObject).slice(0, max).map(map) : [];

  const links = isPlainObject(value.socialLinks) ? value.socialLinks : {};
  return {
    headline: str(value.headline),
    bio: str(value.bio),
    location: str(value.location),
    website: str(value.website),
    skills: strList(value.skills, 200),
    experience: objList(value.experience, 60, (row) => ({
      title: str(row.title) ?? '',
      company: str(row.company) ?? '',
      period: str(row.period) ?? '',
      desc: str(row.desc) ?? '',
    })),
    education: objList(value.education, 30, (row) => ({
      degree: str(row.degree) ?? '',
      school: str(row.school) ?? '',
      year: str(row.year) ?? '',
    })),
    achievements: objList(value.achievements, 40, (row) => ({
      title: str(row.title) ?? '',
      desc: str(row.desc) ?? '',
    })),
    certifications: strList(value.certifications, 40),
    socialLinks: {
      linkedin: str(links.linkedin),
      github: str(links.github),
      twitter: str(links.twitter),
    },
  };
}

/** Total characters a parsed resume carries — what the size limit is measured on. */
function parsedResumeSize(resume: ParsedResumeInput): number {
  return JSON.stringify(resume).length;
}

/**
 * Validate, evaluate and shape one request.
 *
 * Authentication is NOT done here — the route owns it, because only the route
 * can see the session. Everything else is.
 */
export function runAtsEvaluation(payload: unknown): AtsApiResult {
  if (!isPlainObject(payload)) {
    return fail(400, 'INVALID_INPUT', 'Request body must be a JSON object.');
  }
  const input = payload as AtsApiPayload;

  /* ── Job description ── */
  if (typeof input.jobDescription !== 'string') {
    return fail(400, 'INVALID_INPUT', 'Resume and job description are required.');
  }
  const jobDescription = tidy(input.jobDescription);
  if (!jobDescription) {
    return fail(400, 'INVALID_INPUT', 'Job description must not be empty.');
  }
  if (jobDescription.length > MAX_JD_CHARS) {
    return fail(413, 'PAYLOAD_TOO_LARGE', `Job description exceeds the ${MAX_JD_CHARS.toLocaleString('en-US')} character limit.`);
  }

  /* ── Resume: parsed data preferred, raw text accepted ── */
  const hasParsed = isPlainObject(input.parsedResume);
  const hasText = typeof input.resume === 'string';
  if (!hasParsed && !hasText) {
    return fail(400, 'INVALID_INPUT', 'Resume and job description are required.');
  }

  let parsed: ParsedResumeInput;
  let rawText = '';

  if (hasParsed) {
    parsed = coerceParsedResume(input.parsedResume as Record<string, unknown>);
    if (parsedResumeSize(parsed) > MAX_RESUME_CHARS) {
      return fail(413, 'PAYLOAD_TOO_LARGE', `Resume exceeds the ${MAX_RESUME_CHARS.toLocaleString('en-US')} character limit.`);
    }
    rawText = typeof input.resumeText === 'string' ? tidy(input.resumeText).slice(0, MAX_RESUME_CHARS) : '';
  } else {
    const text = tidy(input.resume as string);
    if (!text) {
      return fail(400, 'INVALID_INPUT', 'Resume must not be empty.');
    }
    if (text.length > MAX_RESUME_CHARS) {
      return fail(413, 'PAYLOAD_TOO_LARGE', `Resume exceeds the ${MAX_RESUME_CHARS.toLocaleString('en-US')} character limit.`);
    }
    parsed = parseResumeText(text);
    rawText = text;
  }

  /* ── Structurally unusable input, 422 ──
     Distinct from 400: the request was well-formed, but there is nothing in it
     to evaluate. Reported after normalization, because only the engine's own
     audit can say whether a document yielded anything. */
  if (jobDescription.length < MIN_JD_CHARS || !/[a-z]{3}/i.test(jobDescription)) {
    return fail(422, 'UNPROCESSABLE', 'The job description does not contain enough readable text to evaluate.');
  }
  if (normalizeResume(parsed, rawText).charCount === 0) {
    return fail(422, 'UNPROCESSABLE', 'No readable resume content could be extracted.');
  }

  const jobTitle = typeof input.jobTitle === 'string' ? tidy(input.jobTitle).slice(0, 200) : '';

  let result: AtsEvaluation;
  try {
    result = evaluateAts({ resume: parsed, resumeText: rawText, jobDescription, jobTitle });
  } catch {
    /* The message is deliberately fixed. An exception's text can carry file
       paths and internals, and none of that belongs in a client response. */
    return fail(500, 'SERVER_ERROR', 'The resume could not be evaluated. Please try again.');
  }

  return { status: 200, body: shapeResponse(result) };
}

/** The wire format. Aggregates and diagnostics only — never the resume back. */
export function shapeResponse(result: AtsEvaluation): AtsApiResponse {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const { keyword, impact, alignment, audit, formula } = result;

  return {
    score: result.overallScore,
    label: result.band,
    summary: result.executiveSummary,
    breakdown: {
      keyword: { score: keyword.score, weight: 45, weightedScore: round(keyword.score * 0.45) },
      experience: { score: impact.score, weight: 35, weightedScore: round(impact.score * 0.35) },
      alignment: { score: alignment.score, weight: 20, weightedScore: round(alignment.score * 0.20) },
      parsingCap: {
        cap: formula.scoreCap,
        applied: result.overallScore < result.rawScore,
        rawScore: result.rawScore,
      },
    },
    resumeQuality: { score: result.resumeQualityScore },
    parsing: audit,
    keywords: keyword.matches.map((match) => ({
      requirement: match.requirement.canonical,
      importance: match.requirement.importance,
      kind: match.requirement.kind,
      status: match.matchType,
      evidence: match.evidence,
      /* The report's "Contextual Proof Found?" column, as a boolean: a skills
         list is a claim, not proof. */
      contextualProof: match.evidence === 'demonstrated'
        || match.evidence === 'recent' || match.evidence === 'quantified',
      matchedAs: match.matchedSurface,
      proofQuote: clip(match.proofQuote),
      credit: match.credit,
    })),
    impact: {
      score: impact.score,
      actionVerbScore: impact.actionVerbScore,
      quantificationRate: impact.quantificationRate,
      quantifiedBullets: impact.quantifiedBullets,
      totalBullets: impact.totalBullets,
      relevanceScore: impact.relevanceScore,
      yearsScore: impact.yearsScore,
      candidateYears: impact.candidateYears,
      requiredYears: impact.requiredYears,
      /* The per-bullet array is omitted on purpose: it is the largest thing in
         the evaluation, it is the resume echoed back, and no consumer needs it.
         The weakest bullet — the one the report names — is kept. */
      weakestBullet: impact.weakestBullet
        ? {
            original: clip(impact.weakestBullet.original) as string,
            whyItFails: impact.weakestBullet.whyItFails,
            rewrite: clip(impact.weakestBullet.rewrite) as string,
          }
        : null,
    },
    alignment,
    actionPlan: result.actionPlan,
    report: renderAtsReport(result),
  };
}
