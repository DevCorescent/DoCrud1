/**
 * Phase 10 — the presentation rules for the My Jobs surface.
 *
 * PURE. No React, no fetch, no DOM. Everything the UI decides — a label, a
 * colour, a timeline, whether a salary is real, which buttons an actor may see
 * — is decided here so it can be tested directly, and so two screens can never
 * drift into disagreeing about the same application.
 *
 * ═══ TWO RULES THAT OUTRANK EVERYTHING ELSE IN THIS FILE ═══
 *
 * 1. THE ATS SCORE IS A MATCH SCORE, NEVER A PROBABILITY. It measures how well
 *    a résumé lines up with a job description. It is not a chance of being
 *    hired, and nothing here may render it as one. `atsMatchLabel` is the only
 *    sanctioned phrasing.
 *
 * 2. THE SERVER IS AUTHORITATIVE. `employerStatusActions` and friends decide
 *    what to *draw*, never what is *permitted*. Phase 9 re-checks every rule on
 *    write. A button this file hides is a button the user should not want; a
 *    button it wrongly shows still fails server-side, which is the correct
 *    failure mode.
 */

/* ── Statuses ─────────────────────────────────────────────────────────────*/

/** The nine API status names, exactly as Phase 9 emits them. */
export const APPLICATION_STATUSES = [
  'APPLIED', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'ASSIGNMENT',
  'OFFER_PROPOSED', 'HIRED', 'REJECTED', 'WITHDRAWN',
] as const;

export type ApiStatus = (typeof APPLICATION_STATUSES)[number];

/** The API name a status control must send back. */
export const STATUS_WIRE_NAME: Record<ApiStatus, string> = {
  APPLIED: 'submitted',
  REVIEWING: 'reviewing',
  SHORTLISTED: 'shortlisted',
  INTERVIEW: 'interview',
  ASSIGNMENT: 'assignment',
  OFFER_PROPOSED: 'offer_proposed',
  HIRED: 'hired',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
};

export const STATUS_LABEL: Record<ApiStatus, string> = {
  APPLIED: 'Applied',
  REVIEWING: 'Reviewing',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  ASSIGNMENT: 'Assignment',
  OFFER_PROPOSED: 'Offer Proposed',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export function isApiStatus(v: unknown): v is ApiStatus {
  return typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

/** A human label for anything the API returns, including a value we don't know. */
export function statusLabel(raw: unknown): string {
  if (isApiStatus(raw)) return STATUS_LABEL[raw];
  const s = String(raw ?? '').trim();
  if (!s) return 'Unknown';
  /* An unrecognised status is shown as-is, tidied. Never silently mapped to a
     status we do prefer — mislabelling someone as "Applied" when the server
     said something else would be a lie about their standing. */
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export type StatusTone = 'neutral' | 'progress' | 'positive' | 'negative';

const TONES: Record<ApiStatus, StatusTone> = {
  APPLIED: 'neutral',
  REVIEWING: 'neutral',
  SHORTLISTED: 'progress',
  INTERVIEW: 'progress',
  ASSIGNMENT: 'progress',
  OFFER_PROPOSED: 'progress',
  HIRED: 'positive',
  REJECTED: 'negative',
  WITHDRAWN: 'negative',
};

export function statusTone(raw: unknown): StatusTone {
  return isApiStatus(raw) ? TONES[raw] : 'neutral';
}

/**
 * Pill classes, light and dark.
 *
 * Every tone also carries a distinct DOT and a distinct WORD, so status is
 * never conveyed by colour alone — a requirement for colour-blind users and
 * for anyone reading this on a washed-out phone screen in sunlight.
 */
export const STATUS_PILL_CLASSES: Record<StatusTone, string> = {
  neutral:
    'border-slate-300 bg-slate-100 text-slate-700 '
    + 'dark:border-white/[0.10] dark:bg-white/[0.05] dark:text-white/60',
  progress:
    'border-sky-300 bg-sky-50 text-sky-800 '
    + 'dark:border-sky-400/25 dark:bg-sky-400/[0.10] dark:text-sky-200/90',
  positive:
    'border-emerald-300 bg-emerald-50 text-emerald-800 '
    + 'dark:border-emerald-400/25 dark:bg-emerald-400/[0.10] dark:text-emerald-200/90',
  negative:
    'border-rose-300 bg-rose-50 text-rose-800 '
    + 'dark:border-rose-400/25 dark:bg-rose-400/[0.10] dark:text-rose-200/90',
};

export const STATUS_DOT_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-slate-400 dark:bg-white/35',
  progress: 'bg-sky-500 dark:bg-sky-400',
  positive: 'bg-emerald-500 dark:bg-emerald-400',
  negative: 'bg-rose-500 dark:bg-rose-400',
};

/* ── Employer / candidate controls ────────────────────────────────────────*/

/** Terminal states, mirrored from Phase 9. Nothing moves out of these. */
export const TERMINAL_STATUSES: ReadonlySet<ApiStatus> =
  new Set<ApiStatus>(['HIRED', 'REJECTED', 'WITHDRAWN']);

/** Forward moves, mirrored from lib/server/job-api/status.ts. */
const NEXT: Record<ApiStatus, readonly ApiStatus[]> = {
  APPLIED: ['REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'ASSIGNMENT', 'OFFER_PROPOSED', 'HIRED', 'REJECTED', 'WITHDRAWN'],
  REVIEWING: ['SHORTLISTED', 'INTERVIEW', 'ASSIGNMENT', 'OFFER_PROPOSED', 'HIRED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['REVIEWING', 'INTERVIEW', 'ASSIGNMENT', 'OFFER_PROPOSED', 'HIRED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['SHORTLISTED', 'ASSIGNMENT', 'OFFER_PROPOSED', 'HIRED', 'REJECTED', 'WITHDRAWN'],
  ASSIGNMENT: ['INTERVIEW', 'OFFER_PROPOSED', 'HIRED', 'REJECTED', 'WITHDRAWN'],
  OFFER_PROPOSED: ['INTERVIEW', 'HIRED', 'REJECTED', 'WITHDRAWN'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export interface StatusAction {
  /** The API status name. */
  status: ApiStatus;
  /** What to send as `status` in the PATCH body. */
  wire: string;
  /** The verb on the button — "Shortlist", not "Shortlisted". */
  label: string;
  tone: StatusTone;
  /** True where the move cannot be undone and deserves a confirmation. */
  destructive: boolean;
}

const VERB: Record<ApiStatus, string> = {
  APPLIED: 'Reopen as Applied',
  REVIEWING: 'Move to Reviewing',
  SHORTLISTED: 'Shortlist',
  INTERVIEW: 'Move to Interview',
  ASSIGNMENT: 'Move to Assignment',
  OFFER_PROPOSED: 'Propose Offer',
  HIRED: 'Hire',
  REJECTED: 'Reject',
  WITHDRAWN: 'Withdraw Application',
};

function action(status: ApiStatus): StatusAction {
  return {
    status,
    wire: STATUS_WIRE_NAME[status],
    label: VERB[status],
    tone: TONES[status],
    /* Terminal moves end the conversation for this candidate and cannot be
       reversed, so each one is gated behind a confirmation step. */
    destructive: TERMINAL_STATUSES.has(status),
  };
}

/**
 * The status buttons an EMPLOYER may see.
 *
 * `WITHDRAWN` is excluded at every stage: withdrawing is the candidate's
 * decision about their own candidacy, and an employer doing it on their behalf
 * would put a decision in their mouth. Phase 9 rejects it server-side too.
 */
export function employerStatusActions(current: unknown): StatusAction[] {
  if (!isApiStatus(current) || TERMINAL_STATUSES.has(current)) return [];
  return NEXT[current].filter((s) => s !== 'WITHDRAWN').map(action);
}

/** The candidate may only ever withdraw, and not once it is over. */
export function candidateStatusActions(current: unknown): StatusAction[] {
  if (!isApiStatus(current) || TERMINAL_STATUSES.has(current)) return [];
  return [action('WITHDRAWN')];
}

/* ── ATS ──────────────────────────────────────────────────────────────────*/

/**
 * The ONLY sanctioned way to render a score.
 *
 * Always the words "ATS Match". Never "chance", "probability", "likelihood",
 * or "odds" — the number says how closely a résumé matches a description, and
 * dressing it up as a hiring forecast would mislead both sides of the hire.
 */
export function atsMatchLabel(score: unknown): string {
  return `ATS Match ${atsPercent(score)}%`;
}

/** A whole percent, clamped into range. Non-numbers read as 0, never NaN%. */
export function atsPercent(score: unknown): number {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** A band name for display. Absent stays absent rather than becoming "Low". */
export function atsBandLabel(band: unknown): string | null {
  const s = String(band ?? '').trim();
  if (!s) return null;
  return s.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Eligibility ──────────────────────────────────────────────────────────*/

/**
 * Phase 5 has three outcomes and `unknown` is a real one: it means neither
 * side stated enough to decide. It is shown as "Not stated", never folded into
 * "Ineligible" — declaring someone ineligible on missing information would be
 * a false negative against a real applicant.
 */
export function eligibilityLabel(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'eligible') return 'Eligible';
  if (s === 'ineligible') return 'Not eligible';
  return 'Not stated';
}

export function eligibilityTone(raw: unknown): StatusTone {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'eligible') return 'positive';
  if (s === 'ineligible') return 'negative';
  return 'neutral';
}

/* ── Money ────────────────────────────────────────────────────────────────*/

const PERIOD_SUFFIX: Record<string, string> = {
  hour: '/hr', day: '/day', week: '/wk', month: '/mo', year: '/yr',
};

/**
 * An offer's salary, or NULL when the offer did not state one.
 *
 * Zero, blank, negative and non-numeric all return null. Rendering a missing
 * salary as "₹0" would show a candidate an offer of nothing — a number the
 * employer never made.
 */
export function formatOfferSalary(offer: {
  salaryAmount?: unknown;
  salaryCurrency?: unknown;
  salaryPeriod?: unknown;
} | null | undefined): string | null {
  if (!offer) return null;
  const amount = Number(offer.salaryAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currency = String(offer.salaryCurrency ?? '').trim().toUpperCase() || 'INR';
  const period = String(offer.salaryPeriod ?? '').trim().toLowerCase();
  let head: string;
  try {
    head = new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    /* An unknown ISO code must not throw a listing off the screen. */
    head = `${currency} ${Math.round(amount).toLocaleString('en-IN')}`;
  }
  return head + (PERIOD_SUFFIX[period] ?? '');
}

/**
 * A job's advertised range. Same rule: absent stays absent.
 * Returns null unless at least one real, positive bound exists.
 */
export function formatSalaryRange(job: {
  salaryMin?: unknown;
  salaryMax?: unknown;
  salaryCurrency?: unknown;
  salaryPeriod?: unknown;
} | null | undefined): string | null {
  if (!job) return null;
  const min = Number(job.salaryMin);
  const max = Number(job.salaryMax);
  const okMin = Number.isFinite(min) && min > 0;
  const okMax = Number.isFinite(max) && max > 0;
  if (!okMin && !okMax) return null;

  const one = (v: number) => formatOfferSalary({
    salaryAmount: v, salaryCurrency: job.salaryCurrency, salaryPeriod: job.salaryPeriod,
  });
  if (okMin && okMax && max > min) return `${one(min)} – ${one(max)}`;
  return one(okMin ? min : max);
}

/* ── Dates ────────────────────────────────────────────────────────────────*/

/**
 * "28 Aug 2026 · 4:32 PM", or null.
 *
 * An unparseable timestamp returns null so the caller can omit the line
 * entirely. "Invalid Date" on an applicant card is worse than no date.
 */
export function formatDateTime(iso: unknown): string | null {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${time.toUpperCase()}`;
}

/** Date only. Null on anything unparseable. */
export function formatDateOnly(iso: unknown): string | null {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Timeline ─────────────────────────────────────────────────────────────*/

export interface TimelineEvent {
  status: ApiStatus | string;
  label: string;
  tone: StatusTone;
  /** ISO, or null where the event is scheduled but has no recorded time. */
  at: string | null;
  when: string | null;
  state: 'done' | 'current' | 'upcoming';
}

export interface TimelineInput {
  status: unknown;
  appliedAt?: unknown;
  statusHistory?: ReadonlyArray<{ from?: unknown; to?: unknown; changedAt?: unknown }> | null;
  /** Stage records, used only to surface a scheduled step that has real data. */
  stages?: { interview?: unknown; assignment?: unknown; offer?: unknown } | null;
}

/**
 * The application's history as a timeline.
 *
 * NOTHING IS INVENTED. Every node comes from a fact the API returned:
 *   · each recorded status change, in the order recorded;
 *   · the application itself, when history is empty but an applied date exists;
 *   · an "upcoming" node ONLY when a stage record genuinely exists for a step
 *     the application has not reached yet — a scheduled interview is a real
 *     event, whereas the next box in a funnel diagram is a guess.
 *
 * The funnel is never extrapolated. Showing "Offer — upcoming" to someone who
 * has had one interview would imply a commitment nobody made.
 */
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const history = Array.isArray(input.statusHistory) ? input.statusHistory : [];

  for (const entry of history) {
    const to = entry?.to;
    if (to === undefined || to === null || String(to).trim() === '') continue;
    const at = Date.parse(String(entry.changedAt ?? '')) ? String(entry.changedAt) : null;
    events.push({
      status: isApiStatus(to) ? to : String(to),
      label: statusLabel(to),
      tone: statusTone(to),
      at,
      when: formatDateTime(at),
      state: 'done',
    });
  }

  /* No history recorded, but the person did apply — that is still one fact. */
  if (events.length === 0 && input.appliedAt) {
    events.push({
      status: 'APPLIED',
      label: STATUS_LABEL.APPLIED,
      tone: 'neutral',
      at: String(input.appliedAt),
      when: formatDateTime(input.appliedAt),
      state: 'done',
    });
  }

  /* The current status is the live node. If history already ends there, that
     last entry becomes current rather than being duplicated. */
  const current = input.status;
  const last = events[events.length - 1];
  if (last && isApiStatus(current) && last.status === current) {
    last.state = 'current';
  } else if (isApiStatus(current)) {
    events.push({
      status: current,
      label: STATUS_LABEL[current],
      tone: statusTone(current),
      at: null,
      when: null,
      state: 'current',
    });
  }

  /* A scheduled step the application has not reached yet — real data only. */
  const stages = input.stages;
  if (stages && isApiStatus(current) && !TERMINAL_STATUSES.has(current)) {
    const seen = new Set(events.map((e) => e.status));
    const upcoming: Array<[ApiStatus, unknown]> = [
      ['INTERVIEW', stages.interview],
      ['ASSIGNMENT', stages.assignment],
      ['OFFER_PROPOSED', stages.offer],
    ];
    for (const [status, record] of upcoming) {
      if (!record || seen.has(status)) continue;
      const at = status === 'INTERVIEW'
        ? (record as { scheduledAt?: unknown }).scheduledAt
        : status === 'ASSIGNMENT'
          ? (record as { dueAt?: unknown }).dueAt
          : null;
      events.push({
        status,
        label: STATUS_LABEL[status],
        tone: 'progress',
        at: at ? String(at) : null,
        when: formatDateTime(at),
        state: 'upcoming',
      });
    }
  }

  return events;
}

/* ── Delete / close ───────────────────────────────────────────────────────*/

export interface RemovalCopy {
  title: string;
  body: string;
  confirmLabel: string;
  /** True when the posting will survive as a closed record. */
  closesOnly: boolean;
}

/**
 * What the confirmation dialog says BEFORE the request goes out.
 *
 * A job with applications cannot be deleted — Phase 9 closes it instead — so
 * the dialog must say "Close", not "Delete". Promising deletion and then
 * closing would be a lie told by the interface.
 */
export function removalCopy(applicantCount: unknown): RemovalCopy {
  const count = Math.max(0, Math.floor(Number(applicantCount) || 0));
  if (count > 0) {
    return {
      closesOnly: true,
      title: 'Close this job?',
      body: `${count} ${count === 1 ? 'person has' : 'people have'} applied, so this posting is closed rather than deleted. `
        + 'It stops accepting applications and leaves the public listings. Every application, message and status stays intact for you and for them.',
      confirmLabel: 'Close job',
    };
  }
  return {
    closesOnly: false,
    title: 'Delete this job?',
    body: 'Nobody has applied, so this posting is removed permanently. This cannot be undone.',
    confirmLabel: 'Delete job',
  };
}

/**
 * What to tell the user AFTER the server answers.
 *
 * The server reports the mode it actually used. We report THAT — never the
 * mode we asked for. A job that was closed is announced as closed even when
 * the button said Delete.
 */
export function removalOutcome(response: { mode?: unknown; note?: unknown }): string {
  if (String(response?.mode ?? '') === 'delete') return 'Job deleted.';
  const note = String(response?.note ?? '').trim();
  return note || 'Job closed. It no longer accepts applications, and existing applications are preserved.';
}

/**
 * What to tell a candidate's employer after a rejection.
 *
 * `emailSent` comes from the server. A failed send is stated plainly: claiming
 * an email went out when it did not would leave the employer believing the
 * candidate has been told when they have not.
 */
export function rejectionOutcome(response: { emailSent?: unknown; emailError?: unknown }): string {
  if (response?.emailSent === true) {
    return 'Candidate rejected. They have been notified in the app and by email.';
  }
  if (String(response?.emailError ?? '') === 'already_sent') {
    return 'Candidate rejected. They were already notified earlier.';
  }
  return 'Candidate rejected and notified in the app. The email could not be sent — no email has gone out.';
}

/* ── Paging ───────────────────────────────────────────────────────────────*/

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
  summary: string;
}

/** Page arithmetic for the pager. An empty list is page 1 of 1, showing 0. */
export function pageMeta(p: { page?: unknown; pageSize?: unknown; total?: unknown }): PageMeta {
  const pageSize = Math.max(1, Math.floor(Number(p?.pageSize) || 20));
  const total = Math.max(0, Math.floor(Number(p?.total) || 0));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(p?.page) || 1)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return {
    page, pageSize, total, totalPages, from, to,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    summary: total === 0 ? 'No results' : `${from}–${to} of ${total}`,
  };
}

/* ── Misc ─────────────────────────────────────────────────────────────────*/

/** Initials for an avatar fallback. Never more than two letters. */
export function initials(name: unknown): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A submission or portfolio link that is safe to render.
 *
 * Only absolute http(s). A `javascript:` or `data:` URL in an href is a stored
 * XSS delivered to whoever opens the application, so anything else becomes
 * null and the link is simply not drawn.
 */
export function safeExternalUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return null;
  return s;
}

/**
 * Whether a résumé can be shown in the browser rather than downloaded.
 *
 * Mirrors `resumeDisposition` on the server: PDFs only. A "View" button for a
 * .docx would open a download dialog and look broken, so it is not drawn.
 * The server enforces this regardless of what the UI decides.
 */
export function resumeCanPreview(fileName: unknown): boolean {
  return /\.pdf$/i.test(String(fileName ?? '').trim());
}

/* ── ATS bands (Phase 11) ─────────────────────────────────────────────────*/

/**
 * The colour ramp for an ATS score.
 *
 * ═══ WHY THE BAND COMES FROM THE BACKEND ═══
 *
 * The Phase 6 engine assigns SIX bands, at 90 / 75 / 60 / 50 / 25 / 0. A UI-side
 * five-band table (90 / 75 / 60 / 40 / 0) agrees with it above 60 and disagrees
 * below: a score of 55 is "Moderate Match" to the engine and would be "Weak" to
 * the table. Printing one word while colouring by the other is how a candidate
 * ends up reading two different verdicts about the same number.
 *
 * So the tone is keyed off the band the ENGINE returned. The score is only a
 * fallback for a band we do not recognise, and the label shown is always the
 * engine's own.
 */
export type AtsTone = 'excellent' | 'strong' | 'moderate' | 'weak' | 'low';

const BAND_TONES: Record<string, AtsTone> = {
  'exceptional match': 'excellent',
  'strong match': 'strong',
  'good / competitive': 'moderate',
  'good/competitive': 'moderate',
  'moderate match': 'weak',
  'weak match': 'weak',
  'poor match': 'low',
};

/** Fallback only: used when the band is absent or unrecognised. */
function toneFromScore(score: number): AtsTone {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'strong';
  if (score >= 60) return 'moderate';
  if (score >= 25) return 'weak';
  return 'low';
}

export function atsTone(score: unknown, band?: unknown): AtsTone {
  const key = String(band ?? '').trim().toLowerCase();
  return BAND_TONES[key] ?? toneFromScore(atsPercent(score));
}

/**
 * Chip classes per tone, light and dark.
 *
 * The chip always carries the band WORD as well as the colour, so the meaning
 * survives for a colour-blind reader and on a washed-out screen.
 */
export const ATS_TONE_CLASSES: Record<AtsTone, string> = {
  excellent:
    'border-emerald-300 bg-emerald-50 text-emerald-800 '
    + 'dark:border-emerald-400/25 dark:bg-emerald-400/[0.10] dark:text-emerald-200/90',
  strong:
    'border-sky-300 bg-sky-50 text-sky-800 '
    + 'dark:border-sky-400/25 dark:bg-sky-400/[0.10] dark:text-sky-200/90',
  moderate:
    'border-amber-300 bg-amber-50 text-amber-800 '
    + 'dark:border-amber-400/25 dark:bg-amber-400/[0.10] dark:text-amber-200/90',
  weak:
    'border-orange-300 bg-orange-50 text-orange-800 '
    + 'dark:border-orange-400/25 dark:bg-orange-400/[0.10] dark:text-orange-200/90',
  low:
    'border-rose-300 bg-rose-50 text-rose-800 '
    + 'dark:border-rose-400/25 dark:bg-rose-400/[0.10] dark:text-rose-200/90',
};

/**
 * What a screen reader announces for a score.
 *
 * "ATS Match 94 percent, Exceptional Match" — the number spelled out with its
 * band, never a bare "94%" whose meaning depends on a colour the reader cannot
 * see. Still a match, never a forecast.
 */
export function atsAriaLabel(score: unknown, band?: unknown): string {
  const label = atsBandLabel(band);
  return `ATS Match ${atsPercent(score)} percent${label ? `, ${label}` : ''}`;
}

/**
 * How long ago a job was posted, from a real timestamp.
 *
 * Freshness is part of the BACKEND's ranking. This is only a rendering of the
 * posted date — it is never a "freshness score", and no percentage is invented
 * for it.
 */
export function postedAgo(iso: unknown, now: number = Date.now()): string | null {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor((now - ms) / 86_400_000);
  if (days < 0) return null;           // a future date is not "posted"
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Posted 1 month ago' : `Posted ${months} months ago`;
}
