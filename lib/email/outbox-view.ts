/**
 * How an outbox row is presented, derived once and shared.
 *
 * The outbox is an AUDIT TRAIL, and the whole value of an audit trail is that
 * it does not overstate what it knows. Two rules follow from that and they run
 * through every function here:
 *
 * 1. SMTP acceptance is not delivery. This application has no delivery
 *    callbacks: the provider taking a message is the strongest evidence it
 *    ever holds. So the vocabulary is "accepted by provider", never
 *    "delivered", and there is no code path that produces the second word.
 *
 * 2. A derived answer is labelled as derived. Rows written before Phase 11
 *    have no stored classification, so one is computed from the recorded error
 *    text - which is a good answer, but a reconstruction. Presenting it
 *    identically to a value recorded at the moment of failure would be a quiet
 *    lie about provenance, and provenance is the point.
 *
 * Pure and dependency-light so the API, the UI contract and the tests all read
 * the same derivation rather than three that agree by habit.
 */
import { classifyMailError, type MailFailureKind } from '@/lib/server/mail-provider';

export interface OutboxEventLike {
  id: string;
  createdAt: string;
  status: string;
  type: string;
  to: string;
  subject: string;
  messageId?: string;
  sentAt?: string;
  sentBy?: string;
  error?: string;
  failureKind?: string;
  providerCode?: number;
  retryable?: boolean;
  attempts?: number;
  updatedAt?: string;
  failedAt?: string;
  tracking?: { opens?: number; clicks?: number; lastOpenedAt?: string; lastClickedAt?: string };
  metadata?: Record<string, string>;
}

/* ── Source ────────────────────────────────────────────────────────────────
   Derived from what the senders already record, rather than stored a second
   time. `metadata.campaignId` and `metadata.test` have been written by the
   campaign loop and the test-send route since earlier phases; reading them is
   cheaper and more truthful than backfilling a new column. */

export type OutboxSource = 'campaign' | 'system_email' | 'test' | 'transactional';

export const OUTBOX_SOURCES: OutboxSource[] = [
  'campaign', 'system_email', 'test', 'transactional',
];

export interface OutboxSourceInfo {
  source: OutboxSource;
  label: string;
  campaignId?: string;
  campaignTitle?: string;
  systemEmailType?: string;
  /** True for anything that must be excluded from production statistics. */
  isTest: boolean;
}

export function describeOutboxSource(ev: OutboxEventLike): OutboxSourceInfo {
  const md = ev.metadata ?? {};

  /* Test first: a test send may ALSO name a system email type, and it must
     never be counted as one. */
  if (md.test === 'true' || ev.type === 'test') {
    return {
      source: 'test',
      label: 'Test send',
      systemEmailType: md.systemEmail || undefined,
      campaignId: md.campaignId || undefined,
      isTest: true,
    };
  }
  if (md.campaignId) {
    return {
      source: 'campaign',
      label: 'Campaign',
      campaignId: md.campaignId,
      campaignTitle: md.campaignTitle || undefined,
      isTest: false,
    };
  }
  if (md.systemEmail) {
    return {
      source: 'system_email',
      label: 'System email',
      systemEmailType: md.systemEmail,
      isTest: false,
    };
  }
  return { source: 'transactional', label: 'Transactional', isTest: false };
}

/* ── Status ────────────────────────────────────────────────────────────────
   The stored states are unchanged. Only the wording is decided here. */

export type OutboxDisplayStatus =
  | 'accepted' | 'failed' | 'pending_retry' | 'processing' | 'blocked';

export const OUTBOX_STATUS_LABEL: Record<OutboxDisplayStatus, string> = {
  /* The single most important string in this module. */
  accepted: 'Accepted by provider',
  failed: 'Failed',
  pending_retry: 'Pending retry',
  processing: 'Processing',
  blocked: 'Blocked by policy',
};

/**
 * What actually happened, in the vocabulary above.
 *
 * `pendingRetry` cannot be read off the outbox row alone: retry scheduling
 * lives on the CAMPAIGN's delivery records, which is where the retry state
 * machine already is. The caller passes it in rather than this module
 * inventing a second source of truth for it.
 */
export function outboxDisplayStatus(
  ev: OutboxEventLike, opts: { pendingRetry?: boolean } = {},
): OutboxDisplayStatus {
  if (ev.status === 'sent' || ev.status === 'tested') return 'accepted';
  if (ev.status === 'queued') return 'processing';
  if (ev.status === 'failed') {
    /* A policy block is not a delivery failure - nothing was ever attempted,
       and telling an admin the provider failed would send them to investigate
       an SMTP server that was never contacted. */
    if (/disabled by admin policy/i.test(ev.error ?? '')) return 'blocked';
    if (opts.pendingRetry) return 'pending_retry';
    return 'failed';
  }
  return 'processing';
}

/* ── Failure ─────────────────────────────────────────────────────────────── */

export interface OutboxFailureInfo {
  kind: MailFailureKind | string;
  code?: number;
  retryable: boolean;
  advice: string;
  message: string;
  /**
   * True when the classification was reconstructed from the stored error text
   * rather than recorded at the time of failure. Shown to the admin.
   */
  derived: boolean;
}

/* Node's network error codes, as they appear inside a stored message.

   The classifier's connection rules key off `err.code`, which exists on the
   original Error object and NOT on the string that survives in the outbox. So
   reconstructing a classification from stored text alone downgraded every
   timeout and refused connection to "unknown" - retryable, but unexplained.
   Recovering the token puts the reconstruction back on the same rules instead
   of writing a second set of them here. */
const NET_CODE_PATTERN =
  /\b(ETIMEDOUT|ESOCKETTIMEDOUT|ECONNREFUSED|ECONNECTION|ENOTFOUND|EDNS|ESOCKET|EAUTH|EENVELOPE|EMESSAGE)\b/;

function reclassifyStoredError(message: string) {
  const netCode = NET_CODE_PATTERN.exec(message)?.[1];
  /* Shaped like the error the classifier normally receives, so the SAME
     branches run - nothing about the rules is duplicated. */
  return classifyMailError(netCode ? { message, code: netCode } : message);
}

export function outboxFailure(ev: OutboxEventLike): OutboxFailureInfo | null {
  if (ev.status !== 'failed' && !ev.error) return null;
  if (!ev.error && ev.failureKind === undefined) return null;

  /* Recorded at failure time: use it verbatim. The advice string is not
     stored, so it is looked up from the same classifier by re-classifying the
     message - the KIND still comes from the record. */
  const reclassified = reclassifyStoredError(ev.error ?? '');

  if (ev.failureKind !== undefined) {
    return {
      kind: ev.failureKind,
      code: ev.providerCode,
      retryable: ev.retryable === true,
      advice: reclassified.kind === ev.failureKind ? reclassified.advice : '',
      message: ev.error ?? reclassified.message,
      derived: false,
    };
  }

  /* Nothing recorded. Reconstruct, and say so. */
  return {
    kind: reclassified.kind,
    code: reclassified.code,
    retryable: reclassified.retryable,
    advice: reclassified.advice,
    message: ev.error ?? reclassified.message,
    derived: true,
  };
}

/* ── Secrets ───────────────────────────────────────────────────────────────
   Metadata is written by many senders and is the most likely place for
   something sensitive to arrive by accident. It is filtered on the way OUT,
   so a future sender that records the wrong thing cannot leak it through this
   console. An allow-list would be safer still, but would silently hide useful
   operational keys as senders are added; this deny-list is checked by a test
   that enumerates the shapes that matter. */

const SECRET_KEY_PATTERN =
  /(otp|token|password|passwd|secret|credential|apikey|api_key|authorization|cookie|session|signature|private)/i;

export const REDACTED = '[redacted]';

export function redactOutboxMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!metadata) return out;
  for (const key of Object.keys(metadata)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : String(metadata[key] ?? '');
  }
  return out;
}

/* ── Retry wording ─────────────────────────────────────────────────────────
   Derived from the campaign's delivery record, which owns retry state. */

export interface RetryDisplay {
  text: string;
  /** True only when another automatic attempt is actually scheduled. */
  scheduled: boolean;
}

export function describeRetry(
  opts: {
    attempts?: number;
    maxAttempts: number;
    retryable?: boolean;
    nextRetryAt?: string | null;
  },
): RetryDisplay {
  const attempts = Number(opts.attempts ?? 0);

  if (opts.retryable === false) {
    return { text: 'Permanent — will not be retried', scheduled: false };
  }
  if (opts.nextRetryAt) {
    return {
      text: `Attempt ${attempts} of ${opts.maxAttempts} · next retry ${opts.nextRetryAt}`,
      scheduled: true,
    };
  }
  if (attempts >= opts.maxAttempts) {
    return {
      text: `Attempt ${attempts} of ${opts.maxAttempts} — retries exhausted`,
      scheduled: false,
    };
  }
  return { text: `Attempt ${attempts} of ${opts.maxAttempts}`, scheduled: false };
}
