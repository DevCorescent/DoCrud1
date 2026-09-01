/**
 * Phase 9 — the application status workflow.
 *
 * Pure transition rules plus append-only history. No database, no email, no
 * clock: the caller supplies `now` and persists the result, exactly as the
 * Phase 5–8 services work.
 *
 * ═══ THE VOCABULARY IS THE EXISTING ONE ═══
 *
 * `HiringJobApplication.status` already had five values and they are
 * unchanged. The API's names map onto them rather than replacing them:
 *
 *   APPLIED         -> 'submitted'      (existing)
 *   REVIEWING       -> 'reviewing'      (existing)
 *   SHORTLISTED     -> 'shortlisted'    (existing)
 *   REJECTED        -> 'rejected'       (existing)
 *   HIRED           -> 'hired'          (existing)
 *   INTERVIEW       -> 'interview'      (new)
 *   ASSIGNMENT      -> 'assignment'     (new)
 *   OFFER_PROPOSED  -> 'offer_proposed' (new)
 *   WITHDRAWN       -> 'withdrawn'      (new)
 *
 * A second status field would have meant two truths about one application, so
 * the union was extended instead and nothing stored needs migrating.
 */
import type { HiringJobApplication } from '@/types/document';

export type ApplicationStatus = HiringJobApplication['status'];

/** The API's public spelling of each stored value. */
export const STATUS_API_NAME: Record<ApplicationStatus, string> = {
  submitted: 'APPLIED',
  reviewing: 'REVIEWING',
  shortlisted: 'SHORTLISTED',
  interview: 'INTERVIEW',
  assignment: 'ASSIGNMENT',
  offer_proposed: 'OFFER_PROPOSED',
  hired: 'HIRED',
  rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN',
};

const BY_API_NAME: Record<string, ApplicationStatus> = Object.fromEntries(
  Object.entries(STATUS_API_NAME).map(([stored, api]) => [api, stored as ApplicationStatus]),
) as Record<string, ApplicationStatus>;

/** Parse an API status name. Returns null for anything unrecognised. */
export function parseStatus(raw: unknown): ApplicationStatus | null {
  const key = String(raw ?? '').trim().toUpperCase();
  if (key in BY_API_NAME) return BY_API_NAME[key];
  /* Also accept the stored spelling, so an internal caller need not translate. */
  const lower = String(raw ?? '').trim().toLowerCase() as ApplicationStatus;
  return lower in STATUS_API_NAME ? lower : null;
}

/** Terminal states. Nothing moves out of these. */
export const TERMINAL: ReadonlySet<ApplicationStatus> =
  new Set<ApplicationStatus>(['hired', 'rejected', 'withdrawn']);

/**
 * Who may set each status.
 *
 * `withdrawn` is the candidate's alone — an employer withdrawing someone's
 * application on their behalf would misrepresent the candidate. Everything
 * else is the employer's recruitment decision, which a candidate must not be
 * able to set for themselves.
 */
export const CANDIDATE_SETTABLE: ReadonlySet<ApplicationStatus> =
  new Set<ApplicationStatus>(['withdrawn']);

/**
 * Allowed forward moves.
 *
 * Deliberately permissive within the funnel — a recruiter may skip an
 * assignment, or shortlist straight to an offer — but never BACKWARD past a
 * terminal state, and never out of one. Rejection is reachable from every live
 * stage, because it can happen at any point.
 */
const NEXT: Record<ApplicationStatus, ReadonlySet<ApplicationStatus>> = {
  submitted: new Set<ApplicationStatus>(['reviewing', 'shortlisted', 'interview', 'assignment', 'offer_proposed', 'hired', 'rejected', 'withdrawn']),
  reviewing: new Set<ApplicationStatus>(['shortlisted', 'interview', 'assignment', 'offer_proposed', 'hired', 'rejected', 'withdrawn']),
  shortlisted: new Set<ApplicationStatus>(['interview', 'assignment', 'offer_proposed', 'hired', 'rejected', 'withdrawn', 'reviewing']),
  interview: new Set<ApplicationStatus>(['assignment', 'offer_proposed', 'hired', 'rejected', 'withdrawn', 'shortlisted']),
  assignment: new Set<ApplicationStatus>(['interview', 'offer_proposed', 'hired', 'rejected', 'withdrawn']),
  offer_proposed: new Set<ApplicationStatus>(['hired', 'rejected', 'withdrawn', 'interview']),
  hired: new Set<ApplicationStatus>([]),
  rejected: new Set<ApplicationStatus>([]),
  withdrawn: new Set<ApplicationStatus>([]),
};

export type TransitionError =
  | 'UNKNOWN_STATUS'
  | 'TERMINAL_STATE'
  | 'INVALID_TRANSITION'
  | 'NOT_PERMITTED'
  | 'NO_CHANGE';

export interface TransitionResult {
  ok: boolean;
  error?: TransitionError;
  /** The updated application. Only present when ok. */
  application?: HiringJobApplication;
  /** True when this change should trigger a rejection email. */
  shouldSendRejectionEmail?: boolean;
}

export interface TransitionInput {
  application: HiringJobApplication;
  to: ApplicationStatus;
  /** Who is making the change. */
  actorId: string;
  actorRole: 'employer' | 'candidate';
  now: string;
  note?: string;
}

/**
 * Apply a status change. PURE — returns a new application, mutates nothing.
 *
 * Idempotent by design: setting the status it already has is refused with
 * `NO_CHANGE` rather than appending a duplicate history entry. That is also
 * what stops a repeated "reject" call from sending a second email.
 */
export function transitionStatus(input: TransitionInput): TransitionResult {
  const { application, to, actorId, actorRole, now, note } = input;
  const from = application.status;

  if (!(to in STATUS_API_NAME)) return { ok: false, error: 'UNKNOWN_STATUS' };
  if (from === to) return { ok: false, error: 'NO_CHANGE' };
  if (TERMINAL.has(from)) return { ok: false, error: 'TERMINAL_STATE' };

  /* Authorization by ROLE, before the transition table: a candidate must not
     be able to shortlist themselves even when the move is otherwise legal. */
  if (actorRole === 'candidate' && !CANDIDATE_SETTABLE.has(to)) {
    return { ok: false, error: 'NOT_PERMITTED' };
  }
  if (actorRole === 'employer' && to === 'withdrawn') {
    return { ok: false, error: 'NOT_PERMITTED' };
  }
  if (!NEXT[from].has(to)) return { ok: false, error: 'INVALID_TRANSITION' };

  /* History is APPENDED, never rewritten. An application that predates Phase 9
     starts its history here rather than pretending earlier changes existed. */
  const history = [...(application.statusHistory ?? []), {
    from, to, changedAt: now, changedBy: actorId,
    ...(note ? { note: String(note).slice(0, 2000) } : {}),
  }];

  const next: HiringJobApplication = {
    ...application,
    status: to,
    statusHistory: history,
    updatedAt: now,
  };

  /* Send once, ever. `rejectionEmailSentAt` is the guard, so a re-reject after
     a reopen cannot mail the candidate twice. */
  const shouldSendRejectionEmail = to === 'rejected' && !application.rejectionEmailSentAt;

  return { ok: true, application: next, shouldSendRejectionEmail };
}

/** The statuses an actor may move this application to right now. */
export function allowedTransitions(
  application: HiringJobApplication,
  actorRole: 'employer' | 'candidate',
): ApplicationStatus[] {
  if (TERMINAL.has(application.status)) return [];
  const allowed = Array.from(NEXT[application.status]);
  return allowed
    .filter((s) => (actorRole === 'candidate' ? CANDIDATE_SETTABLE.has(s) : s !== 'withdrawn'))
    .sort();
}

/** Counts per status for a job's applications. Every status is present. */
export function statusCounts(applications: readonly HiringJobApplication[]): Record<ApplicationStatus, number> {
  const counts = Object.fromEntries(
    (Object.keys(STATUS_API_NAME) as ApplicationStatus[]).map((s) => [s, 0]),
  ) as Record<ApplicationStatus, number>;
  for (const a of applications) {
    if (a?.status && a.status in counts) counts[a.status] += 1;
  }
  return counts;
}
