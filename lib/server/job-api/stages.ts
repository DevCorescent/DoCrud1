/**
 * Phase 9 — interview, assignment and offer records.
 *
 * These sit ON the application (see types/document.ts) rather than in three new
 * collections: each belongs to exactly one application and is read whenever
 * that application is read, so separate collections would add three joins and
 * three ownership checks to answer questions the application already answers.
 *
 * PURE. Every function takes an application and returns a new one; the caller
 * authenticates, authorizes and persists.
 *
 * ═══ WHO MAY WRITE WHAT ═══
 *
 *   employer  — schedules interviews, sets assignments, proposes offers
 *   candidate — submits an assignment, accepts or declines an offer
 *
 * Neither may write the other's half. An employer marking an offer "accepted"
 * on the candidate's behalf would put words in their mouth about a job they
 * may not want; a candidate setting their own interview would be inventing a
 * commitment from the company.
 */
import type { HiringJobApplication } from '@/types/document';

export type StageError =
  | 'NOT_PERMITTED'
  | 'INVALID_INPUT'
  | 'NO_OFFER'
  | 'NO_ASSIGNMENT'
  | 'ALREADY_ANSWERED';

export interface StageResult {
  ok: boolean;
  error?: StageError;
  application?: HiringJobApplication;
}

const text = (v: unknown, max = 4000): string | undefined => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : undefined;
};

/** An ISO timestamp, or undefined. Never a fabricated date. */
const when = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

/* ── Interview ────────────────────────────────────────────────────────────*/

export function setInterview(input: {
  application: HiringJobApplication;
  actorRole: 'employer' | 'candidate';
  actorId: string;
  now: string;
  scheduledAt?: unknown;
  mode?: unknown;
  notes?: unknown;
}): StageResult {
  if (input.actorRole !== 'employer') return { ok: false, error: 'NOT_PERMITTED' };
  const { application } = input;
  return {
    ok: true,
    application: {
      ...application,
      interview: {
        /* Every field is optional: an employer may record that an interview
           happened without naming a time, and an unparseable date becomes
           absent rather than a wrong one. */
        scheduledAt: when(input.scheduledAt),
        mode: text(input.mode, 200),
        notes: text(input.notes),
        createdAt: application.interview?.createdAt ?? input.now,
        createdBy: application.interview?.createdBy ?? input.actorId,
      },
      updatedAt: input.now,
    },
  };
}

/* ── Assignment ───────────────────────────────────────────────────────────*/

export function setAssignment(input: {
  application: HiringJobApplication;
  actorRole: 'employer' | 'candidate';
  actorId: string;
  now: string;
  title?: unknown;
  instructions?: unknown;
  dueAt?: unknown;
}): StageResult {
  if (input.actorRole !== 'employer') return { ok: false, error: 'NOT_PERMITTED' };
  const title = text(input.title, 300);
  /* A task with no title is not a task. */
  if (!title) return { ok: false, error: 'INVALID_INPUT' };

  const { application } = input;
  return {
    ok: true,
    application: {
      ...application,
      assignment: {
        title,
        instructions: text(input.instructions, 10_000),
        dueAt: when(input.dueAt),
        /* A re-issued assignment keeps any submission already made — losing a
           candidate's work because the brief was edited would be unforgivable. */
        submissionUrl: application.assignment?.submissionUrl,
        submittedAt: application.assignment?.submittedAt,
        createdAt: application.assignment?.createdAt ?? input.now,
        createdBy: application.assignment?.createdBy ?? input.actorId,
      },
      updatedAt: input.now,
    },
  };
}

/** The candidate hands work back. Only they may do this. */
export function submitAssignment(input: {
  application: HiringJobApplication;
  actorRole: 'employer' | 'candidate';
  now: string;
  submissionUrl?: unknown;
}): StageResult {
  if (input.actorRole !== 'candidate') return { ok: false, error: 'NOT_PERMITTED' };
  const { application } = input;
  if (!application.assignment) return { ok: false, error: 'NO_ASSIGNMENT' };

  const url = text(input.submissionUrl, 2000);
  /* Only http(s). A candidate-supplied link is rendered to a recruiter, so a
     javascript: or data: URL must never survive. */
  if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return { ok: false, error: 'INVALID_INPUT' };

  return {
    ok: true,
    application: {
      ...application,
      assignment: { ...application.assignment, submissionUrl: url, submittedAt: input.now },
      updatedAt: input.now,
    },
  };
}

/* ── Offer ────────────────────────────────────────────────────────────────*/

const PERIODS = new Set(['hour', 'day', 'week', 'month', 'year']);

export function proposeOffer(input: {
  application: HiringJobApplication;
  actorRole: 'employer' | 'candidate';
  actorId: string;
  now: string;
  salaryAmount?: unknown;
  salaryCurrency?: unknown;
  salaryPeriod?: unknown;
  startDate?: unknown;
  notes?: unknown;
}): StageResult {
  if (input.actorRole !== 'employer') return { ok: false, error: 'NOT_PERMITTED' };
  const { application } = input;

  /* A salary is recorded only when it is a real, positive figure. A zero or a
     blank means the offer did not state one, and it stays absent rather than
     being rendered to the candidate as an offer of nothing. */
  const raw = Number(input.salaryAmount);
  const salaryAmount = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined;
  const period = String(input.salaryPeriod ?? '').trim().toLowerCase();

  return {
    ok: true,
    application: {
      ...application,
      offer: {
        ...(salaryAmount !== undefined ? { salaryAmount } : {}),
        ...(salaryAmount !== undefined
          ? { salaryCurrency: (text(input.salaryCurrency, 8) ?? 'INR').toUpperCase() }
          : {}),
        ...(salaryAmount !== undefined && PERIODS.has(period)
          ? { salaryPeriod: period as NonNullable<HiringJobApplication['offer']>['salaryPeriod'] }
          : {}),
        startDate: when(input.startDate),
        notes: text(input.notes),
        /* A revised offer clears any previous answer: the candidate is being
           asked again, and carrying forward an old "declined" would misreport
           their position on the new terms. */
        createdAt: input.now,
        createdBy: input.actorId,
      },
      updatedAt: input.now,
    },
  };
}

/** The candidate answers. Only they may, and only once. */
export function respondToOffer(input: {
  application: HiringJobApplication;
  actorRole: 'employer' | 'candidate';
  now: string;
  response?: unknown;
}): StageResult {
  if (input.actorRole !== 'candidate') return { ok: false, error: 'NOT_PERMITTED' };
  const { application } = input;
  if (!application.offer) return { ok: false, error: 'NO_OFFER' };
  if (application.offer.response) return { ok: false, error: 'ALREADY_ANSWERED' };

  const answer = String(input.response ?? '').trim().toLowerCase();
  if (answer !== 'accepted' && answer !== 'declined') return { ok: false, error: 'INVALID_INPUT' };

  return {
    ok: true,
    application: {
      ...application,
      offer: { ...application.offer, response: answer, respondedAt: input.now },
      updatedAt: input.now,
    },
  };
}

/**
 * The stage records as an API payload.
 *
 * Employer notes are withheld from the candidate: an interview note is a
 * recruiter's private assessment, and returning it because the candidate can
 * read their own application would leak it.
 */
export function stageView(
  application: HiringJobApplication,
  viewer: 'employer' | 'candidate',
): Record<string, unknown> {
  const forCandidate = viewer === 'candidate';
  return {
    interview: application.interview
      ? {
          scheduledAt: application.interview.scheduledAt,
          mode: application.interview.mode,
          ...(forCandidate ? {} : { notes: application.interview.notes }),
        }
      : null,
    assignment: application.assignment
      ? {
          title: application.assignment.title,
          instructions: application.assignment.instructions,
          dueAt: application.assignment.dueAt,
          submissionUrl: application.assignment.submissionUrl,
          submittedAt: application.assignment.submittedAt,
        }
      : null,
    offer: application.offer
      ? {
          salaryAmount: application.offer.salaryAmount,
          salaryCurrency: application.offer.salaryCurrency,
          salaryPeriod: application.offer.salaryPeriod,
          startDate: application.offer.startDate,
          notes: application.offer.notes,
          response: application.offer.response ?? null,
          respondedAt: application.offer.respondedAt,
        }
      : null,
  };
}
