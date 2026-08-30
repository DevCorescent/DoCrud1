/**
 * ATS evaluator — view logic, extracted so it can be tested.
 *
 * The page component owns rendering and nothing else. Every decision that has a
 * right answer — which colour a score gets, which message an HTTP status
 * produces, what a request body should contain, which rows a filter keeps —
 * lives here as a pure function, because those are the things worth asserting
 * and a React tree is not testable in this repo without adding a test runner.
 *
 * NO SCORING HAPPENS HERE. Every number displayed by the page comes from
 * POST /api/ats/evaluate; this file only decides how to present what the API
 * already decided. Recomputing any part of the score in the browser would
 * create a second source of truth, which is the one thing the deterministic
 * engine exists to prevent.
 */
import type { AtsApiResponse } from '@/lib/server/ats/api';

/* A TYPE-ONLY import: erased at compile time, so no server module — and no
   scoring code — is pulled into the client bundle. The alternative, restating
   the response shape by hand, would drift from the API the first time it
   changed. */
export type { AtsApiResponse };
export type AtsKeywordRow = AtsApiResponse['keywords'][number];
export type AtsMatchStatus = AtsKeywordRow['status'];

/* ── Score colour ────────────────────────────────────────────────────────
   The exact thresholds, in one place, used by every indicator on the page.
   `label` exists so the status is never carried by colour alone — a
   red/green distinction is invisible to a red-green colourblind reader, and
   unreadable to a screen reader. */
export type ScoreTone = 'red' | 'yellow' | 'blue' | 'green';

export function scoreTone(score: number): ScoreTone {
  if (score < 25) return 'red';
  if (score < 50) return 'yellow';
  if (score < 75) return 'blue';
  return 'green';
}

export const TONE_LABEL: Record<ScoreTone, string> = {
  red: 'Poor', yellow: 'Weak', blue: 'Competitive', green: 'Strong',
};

/** Tailwind classes per tone. Light values first, dark after, in both themes. */
export const TONE_CLASSES: Record<ScoreTone, { text: string; ring: string; chip: string }> = {
  red: {
    text: 'text-rose-600 dark:text-rose-300',
    ring: 'stroke-rose-500 dark:stroke-rose-400',
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  yellow: {
    text: 'text-amber-600 dark:text-amber-300',
    ring: 'stroke-amber-500 dark:stroke-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  blue: {
    text: 'text-sky-600 dark:text-sky-300',
    ring: 'stroke-sky-500 dark:stroke-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  green: {
    text: 'text-emerald-600 dark:text-emerald-300',
    ring: 'stroke-emerald-500 dark:stroke-emerald-400',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
};

/* ── Match status presentation ───────────────────────────────────────────
   Every status carries a glyph AND a word. The glyph alone would be another
   colour-only signal. */
export const STATUS_META: Record<AtsMatchStatus, { glyph: string; label: string; tone: ScoreTone }> = {
  exact: { glyph: '✓', label: 'Exact', tone: 'green' },
  normalized: { glyph: '↗', label: 'Normalized', tone: 'green' },
  semantic: { glyph: '≈', label: 'Semantic', tone: 'blue' },
  partial: { glyph: '⚠', label: 'Partial', tone: 'yellow' },
  related: { glyph: '◌', label: 'Related only', tone: 'yellow' },
  missing: { glyph: '✕', label: 'Missing', tone: 'red' },
};

export type KeywordFilter = 'all' | 'matched' | 'partial' | 'missing';

export const KEYWORD_FILTERS: Array<{ id: KeywordFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'matched', label: 'Matched' },
  { id: 'partial', label: 'Partial' },
  { id: 'missing', label: 'Missing' },
];

/** Which rows a filter keeps. "Matched" means a real match, not a neighbour. */
export function filterKeywords(rows: AtsKeywordRow[], filter: KeywordFilter): AtsKeywordRow[] {
  switch (filter) {
    case 'matched':
      return rows.filter((r) => r.status === 'exact' || r.status === 'normalized' || r.status === 'semantic');
    case 'partial':
      return rows.filter((r) => r.status === 'partial' || r.status === 'related');
    case 'missing':
      return rows.filter((r) => r.status === 'missing');
    default:
      return rows;
  }
}

export function filterCount(rows: AtsKeywordRow[], filter: KeywordFilter): number {
  return filterKeywords(rows, filter).length;
}

/* ── Errors ──────────────────────────────────────────────────────────────
   One message per failure the user can actually act on. Nothing from the
   server's own error text is displayed: it is written for a developer, and a
   500's message can carry internals. */
export function errorMessageForStatus(status: number): string {
  switch (status) {
    case 429: return 'Too many ATS evaluations. Please try again later.';
    case 400: return 'Add a resume and a job description to analyze your match.';
    case 401: return 'Please sign in to use the ATS evaluator.';
    case 404: return "We couldn't find that resume on your account. Pick another one.";
    case 413: return 'That resume or job description is too long. Shorten it and try again.';
    case 422: return "We couldn't extract enough usable information from your resume or the job description.";
    case 405: return 'Something went wrong while analyzing your resume. Please try again.';
    default:
      return status >= 500
        ? 'Something went wrong while analyzing your resume. Please try again.'
        : 'We could not analyze this resume. Check your inputs and try again.';
  }
}

export const NETWORK_ERROR_MESSAGE =
  'We could not reach the evaluator. Check your connection and try again.';

/** Upload failures. 429 is new in this phase; the rest mirror the evaluator. */
export function uploadErrorMessageForStatus(status: number): string {
  switch (status) {
    case 400: return 'That file could not be used. Upload a PDF, DOCX, DOC, RTF, MD or TXT resume.';
    case 401: return 'Please sign in to upload a resume.';
    case 413: return 'That file is too large. Upload a resume under 10 MB.';
    case 422: return "We couldn't extract enough usable resume information from that file.";
    case 429: return 'Too many resume uploads. Please try again later.';
    default: return 'We could not process that resume. Please try again.';
  }
}

/** The evaluator's own 429, kept separate so each flow names its own action. */
export const RATE_LIMITED_MESSAGE = 'Too many ATS evaluations. Please try again later.';

/* ── Request ─────────────────────────────────────────────────────────── */

export interface AtsRequestDraft {
  /** A resume already stored on the profile. Preferred — nothing is re-parsed. */
  resumeId?: string;
  /** Pasted text, used only when there is no stored resume selected. */
  resumeText?: string;
  jobDescription: string;
  jobTitle?: string;
}

export type AtsRequestBody =
  | { resumeId: string; jobDescription: string; jobTitle?: string }
  | { resume: string; jobDescription: string; jobTitle?: string };

/**
 * The body to POST.
 *
 * `resumeId` wins whenever one is selected: the server then reuses the resume
 * Docrud has ALREADY parsed, so nothing is parsed twice and no resume text
 * crosses the network. Returns null when there is nothing to send, which is
 * also what disables the button — one rule, not two that can disagree.
 */
export function buildRequestBody(draft: AtsRequestDraft): AtsRequestBody | null {
  const jobDescription = draft.jobDescription.trim();
  if (!jobDescription) return null;
  const jobTitle = draft.jobTitle?.trim() || undefined;

  if (draft.resumeId) return { resumeId: draft.resumeId, jobDescription, jobTitle };

  const resume = draft.resumeText?.trim();
  if (!resume) return null;
  return { resume, jobDescription, jobTitle };
}

/** Whether "Analyze Resume" can be pressed. Same rule as buildRequestBody. */
export function canAnalyze(draft: AtsRequestDraft, running: boolean): boolean {
  return !running && buildRequestBody(draft) !== null;
}

/* ── Derived views ───────────────────────────────────────────────────── */

/** Contact and section rows for the parsing audit, from API data only. */
export function auditRows(parsing: AtsApiResponse['parsing']): Array<{ label: string; state: 'ok' | 'missing' }> {
  const { contactCompleteness: c, sectionCoverage: s } = parsing;
  return [
    { label: 'Email', state: c.email ? 'ok' : 'missing' },
    { label: 'Phone', state: c.phone ? 'ok' : 'missing' },
    { label: 'Location', state: c.location ? 'ok' : 'missing' },
    { label: 'LinkedIn', state: c.linkedin ? 'ok' : 'missing' },
    { label: 'GitHub', state: c.github ? 'ok' : 'missing' },
    { label: 'Portfolio', state: c.portfolio ? 'ok' : 'missing' },
    { label: 'Experience', state: s.experience ? 'ok' : 'missing' },
    { label: 'Education', state: s.education ? 'ok' : 'missing' },
    { label: 'Skills', state: s.skills ? 'ok' : 'missing' },
    { label: 'Summary', state: s.summary ? 'ok' : 'missing' },
    { label: 'Projects', state: s.projects ? 'ok' : 'missing' },
    { label: 'Certifications', state: s.certifications ? 'ok' : 'missing' },
  ];
}

/** "Why this job matches you" — proven matches only, strongest first. */
export function strengths(result: AtsApiResponse): AtsKeywordRow[] {
  return result.keywords
    .filter((k) => k.contextualProof && (k.status === 'exact' || k.status === 'normalized' || k.status === 'semantic'))
    .sort((a, b) => b.credit - a.credit)
    .slice(0, 6);
}

/** "What is holding your score back" — missing must-haves before nice-to-haves. */
export function gaps(result: AtsApiResponse): AtsKeywordRow[] {
  const rank: Record<AtsKeywordRow['importance'], number> = { must: 3, important: 2, nice: 1 };
  return result.keywords
    .filter((k) => k.status === 'missing' || k.status === 'related' || !k.contextualProof)
    .sort((a, b) => (rank[b.importance] - rank[a.importance]) || (a.credit - b.credit))
    .slice(0, 6);
}

/** A percentage for display. The API's number is never altered, only rounded. */
export function displayScore(score: number): number {
  return Math.round(score);
}

/* ── History ─────────────────────────────────────────────────────────── */

export interface AtsHistoryRow {
  id: string;
  jobTitle: string;
  resumeName: string | null;
  overallScore: number;
  label: string;
  createdAt: string;
}

/**
 * A history date, formatted from the stored ISO string.
 *
 * Explicitly en-US and UTC. A locale-dependent format would render differently
 * on the server and in the browser and trip React's hydration check, and a
 * local timezone would make the same record read as two different days.
 */
export function formatHistoryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}
