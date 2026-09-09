/**
 * Mail provider abstraction and failure classification.
 *
 * Two jobs, both of which exist because "it failed" is not a useful thing to
 * tell an administrator:
 *
 * 1. CLASSIFY. A 535 suspended mailbox, a DNS failure, a rejected recipient
 *    and a rate limit are four completely different problems with four
 *    different remedies. Retrying a suspended account forever is a waste; not
 *    retrying a timeout loses mail that would have gone through; retrying an
 *    invalid recipient is the one that gets a sender blocklisted. So every
 *    provider error is classified before anything decides what to do with it.
 *
 * 2. ABSTRACT. `MailProvider` gives delivery a seam, so an SMTP account that
 *    the provider has suspended can eventually be swapped for another provider
 *    without touching a single call site.
 *
 * WHAT THIS DOES NOT DO: it does not silently reroute mail. A fallback provider
 * is only used when one is explicitly configured, and a provider-level failure
 * stays visible either way. No arrangement of code here can deliver mail
 * through an account the provider has switched off.
 */
import type { Transporter } from 'nodemailer';
import { getCachedTransporter } from '@/lib/server/smtp-transport';
import { getMailSettings } from '@/lib/server/settings';

/* ── Failure classification ─────────────────────────────────────────────── */

export type MailFailureKind =
  /** Credentials rejected, or the account is suspended/disabled. */
  | 'auth'
  /** Could not reach the server: DNS, refused, timeout. */
  | 'connection'
  /** TLS negotiation or certificate problem. */
  | 'tls'
  /** The provider accepted the connection but refused this message. */
  | 'provider_rejected'
  /** This specific recipient is bad. Never retry; it damages sender reputation. */
  | 'recipient'
  /** Throttled. Retrying later is exactly the right response. */
  | 'rate_limit'
  /** Nothing matched. Treated as transient, but flagged as unclassified. */
  | 'unknown';

export interface MailFailure {
  kind: MailFailureKind;
  /** Safe to show an admin: provider wording, never a credential. */
  message: string;
  /** SMTP reply code when the provider gave one. */
  code?: number;
  /**
   * Whether trying again could plausibly succeed WITHOUT someone changing
   * something. A suspended mailbox is not retryable: no number of attempts
   * fixes a billing problem.
   */
  retryable: boolean;
  /** What the admin should actually do. */
  advice: string;
}

interface RawError {
  message?: string;
  code?: string;
  responseCode?: number;
  command?: string;
  response?: string;
}

/** Permanent recipient rejections. Retrying these is actively harmful. */
const PERMANENT_RECIPIENT_CODES = new Set([510, 511, 513, 550, 551, 553]);
/** Provider asked us to come back later. */
const TRANSIENT_CODES = new Set([421, 450, 451, 452, 471]);

export function classifyMailError(error: unknown): MailFailure {
  const err = (error ?? {}) as RawError;
  const message = String(err.message ?? error ?? 'Mail send failed').slice(0, 400);
  /* Prefer the structured code, but fall back to a leading SMTP reply code in
     the text. Some transports surface the reply only in the message, and
     losing the code there would downgrade a permanent 550 into an "unknown"
     that gets retried — the exact mistake that damages sender reputation. */
  const fromMessage = /(?:^|\s)([45]\d{2})(?:[\s-]|$)/.exec(message);
  const code = typeof err.responseCode === 'number'
    ? err.responseCode
    : fromMessage ? Number(fromMessage[1]) : undefined;
  const netCode = String(err.code ?? '');
  const lower = message.toLowerCase();

  /* Authentication and account state. A suspended mailbox reports as an auth
     failure, and it is the case that must NOT be retried in a loop. */
  if (netCode === 'EAUTH' || code === 535 || code === 534 || code === 530
      || lower.includes('authentication') || lower.includes('suspended')) {
    const suspended = lower.includes('suspend') || lower.includes('disabled');
    return {
      kind: 'auth',
      message,
      code,
      retryable: false,
      advice: suspended
        ? 'The sending mailbox is suspended at the provider. Restore the account '
          + 'or configure a different provider — retrying cannot fix this.'
        : 'The provider rejected the credentials. Check the SMTP username and password.',
    };
  }

  if (netCode === 'ECONNECTION' || netCode === 'ETIMEDOUT' || netCode === 'ECONNREFUSED'
      || netCode === 'ENOTFOUND' || netCode === 'EDNS' || netCode === 'ESOCKETTIMEDOUT') {
    return {
      kind: 'connection',
      message,
      code,
      retryable: true,
      advice: 'The mail server could not be reached. This is usually temporary; the message will be retried.',
    };
  }

  if (netCode === 'ESOCKET' || lower.includes('certificate') || lower.includes('tls')
      || lower.includes('ssl')) {
    return {
      kind: 'tls',
      message,
      code,
      retryable: false,
      advice: 'The secure connection to the mail server failed. Check the host, port and TLS settings.',
    };
  }

  if (lower.includes('rate limit') || lower.includes('too many') || code === 421 || code === 450) {
    return {
      kind: 'rate_limit',
      message,
      code,
      retryable: true,
      advice: 'The provider is throttling delivery. The message will be retried after a delay.',
    };
  }

  if (code && PERMANENT_RECIPIENT_CODES.has(code)) {
    return {
      kind: 'recipient',
      message,
      code,
      retryable: false,
      advice: 'The provider permanently rejected this address. Remove it rather than retrying — '
        + 'repeated attempts damage sender reputation.',
    };
  }

  if (code && TRANSIENT_CODES.has(code)) {
    return {
      kind: 'provider_rejected',
      message,
      code,
      retryable: true,
      advice: 'The provider temporarily refused the message. It will be retried.',
    };
  }

  if (code && code >= 500) {
    return {
      kind: 'provider_rejected',
      message,
      code,
      retryable: false,
      advice: 'The provider permanently refused the message. Retrying will not help.',
    };
  }

  return {
    kind: 'unknown',
    message,
    code,
    retryable: true,
    advice: 'The failure could not be classified. It will be retried once; check the provider logs.',
  };
}

/* ── Retry scheduling ────────────────────────────────────────────────────── */

/** Backoff in ms for attempt N (1-based). Deliberately short and bounded. */
const BACKOFF_MS = [60_000, 300_000, 1_800_000]; // 1 min, 5 min, 30 min
export const MAX_DELIVERY_ATTEMPTS = BACKOFF_MS.length + 1;

/**
 * When (if ever) to try this message again.
 *
 * Returns null when it must not be retried — either because the failure is
 * permanent, or because the attempt budget is spent. A permanent failure is
 * never retried regardless of how many attempts remain.
 */
export function nextRetryAt(failure: MailFailure, attempt: number, now = Date.now()): string | null {
  if (!failure.retryable) return null;
  if (attempt >= MAX_DELIVERY_ATTEMPTS) return null;
  const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
  return new Date(now + delay).toISOString();
}

/* ── The provider interface ──────────────────────────────────────────────── */

export type ProviderStatus = 'healthy' | 'degraded' | 'unavailable' | 'unconfigured';

export interface ProviderHealth {
  /** Human-readable provider name. Never includes credentials. */
  provider: string;
  host: string;
  port: number;
  secure: boolean;
  status: ProviderStatus;
  /** Connection + authentication round trip, in ms. */
  latencyMs: number | null;
  checkedAt: string;
  failure?: MailFailure;
}

/** One outbound message, already rendered and tracked by the mailer. */
export interface MailMessage {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export interface MailSendResult {
  messageId?: string;
  /** Which provider actually accepted it — useful once there is more than one. */
  provider: string;
}

export interface MailProvider {
  readonly name: string;
  /** Hand one message to the provider. Throws on rejection. */
  send(message: MailMessage): Promise<MailSendResult>;
  /** Confirm the provider will accept mail right now. */
  verify(): Promise<ProviderHealth>;
}

/**
 * Strip anything that could END a header and begin a new one.
 *
 * ═══ HEADER INJECTION ═══
 *
 * A mail header is terminated by CRLF. So a value containing CR or LF does not
 * stay a value — everything after the break is parsed as ANOTHER header. A
 * recipient or subject carrying
 *
 *     victim@example.com\r\nBcc: everyone@example.com
 *
 * silently adds a Bcc. Several of the addresses and subjects reaching this seam
 * originate in user input (signature invitations, reminders, document links,
 * profile-driven notifications), so the value is cleaned at the ONE point every
 * message passes through rather than at each of the twelve call sites, where a
 * new one would simply be added without it.
 *
 * CR, LF and NUL are removed rather than escaped: none of them is ever legal in
 * a header value, so nothing legitimate is lost. Length is capped for the same
 * reason — an unbounded header is a denial-of-service surface, not a feature.
 *
 * This complements, and does not replace, the pending nodemailer upgrade:
 * TODO(PHASE-2, dependency): nodemailer 7.0.13 -> 10.x closes GHSA-vvjj-xcjg-gr5g
 *   (CRLF in the transport `name`/EHLO option) and GHSA-268h-hp4c-crq3 (List-*
 *   header comments). Deferred because it is a THREE-major jump across ~12
 *   createTransport call sites and belongs in its own verification pass, not in
 *   a hardening phase. The `raw`, `path` and `href` advisories do NOT apply:
 *   this codebase uses none of those options — attachments are always Buffers.
 */
const HEADER_MAX = 998; // RFC 5322 line-length limit.

export function sanitizeHeaderValue(value: string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value).replace(/[\r\n\0]/g, '').slice(0, HEADER_MAX);
}

/** Same rule for a filename, which also lands in a header (Content-Disposition). */
export function sanitizeFilename(value: string): string {
  return String(value).replace(/[\r\n\0"]/g, '').slice(0, 255);
}

/** The configured SMTP account, wrapped in the provider interface. */
export class SmtpMailProvider implements MailProvider {
  readonly name: string;

  constructor(name = 'SMTP') { this.name = name; }

  async send(message: MailMessage): Promise<MailSendResult> {
    /* The same pooled transport the health check uses. Errors propagate
       unchanged so the caller can classify them — swallowing one here would
       turn a rejection into a silent success. */
    const transporter = (await getCachedTransporter()) as Transporter;
    /* Header values are sanitised HERE, at the one seam every message crosses.
       Bodies (text/html) are untouched — they are not headers and a newline in
       a body is simply a newline. */
    const info = await transporter.sendMail({
      from: sanitizeHeaderValue(message.from),
      to: sanitizeHeaderValue(message.to),
      cc: sanitizeHeaderValue(message.cc),
      bcc: sanitizeHeaderValue(message.bcc),
      replyTo: sanitizeHeaderValue(message.replyTo),
      subject: sanitizeHeaderValue(message.subject),
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        ...a,
        filename: sanitizeFilename(a.filename),
      })),
    });
    return { messageId: info.messageId, provider: this.name };
  }

  async verify(): Promise<ProviderHealth> {
    const settings = await getMailSettings();
    const base = {
      provider: this.name,
      host: settings.host || '',
      port: Number(settings.port) || 0,
      secure: Boolean(settings.secure),
      checkedAt: new Date().toISOString(),
    };

    if (!settings.host || !settings.fromEmail) {
      return { ...base, status: 'unconfigured', latencyMs: null };
    }

    const started = Date.now();
    try {
      /* Reuses the pooled transporter the real send path uses, so this checks
         the same connection and credentials rather than a parallel guess. */
      const transporter = (await getCachedTransporter()) as Transporter;
      await transporter.verify();
      return { ...base, status: 'healthy', latencyMs: Date.now() - started };
    } catch (error) {
      const failure = classifyMailError(error);
      return {
        ...base,
        /* A retryable problem is degraded; a credential or account problem is
           unavailable, because no amount of waiting fixes it. */
        status: failure.retryable ? 'degraded' : 'unavailable',
        latencyMs: Date.now() - started,
        failure,
      };
    }
  }
}

let cached: { health: ProviderHealth; at: number } | null = null;
const HEALTH_TTL_MS = 30_000;

/**
 * Provider health, cached briefly.
 *
 * A verify() opens a real SMTP connection, so this must not run on every page
 * render. `force` is what the "Check provider" button uses.
 */
export async function getProviderHealth(force = false): Promise<ProviderHealth> {
  if (!force && cached && Date.now() - cached.at < HEALTH_TTL_MS) return cached.health;
  const health = await new SmtpMailProvider('SMTP').verify();
  cached = { health, at: Date.now() };
  return health;
}

/**
 * The last known health, WITHOUT opening a connection.
 *
 * A `verify()` is a real SMTP handshake — measured at ~5.5s against the
 * current provider — so a dashboard that waits for one shows a spinner for
 * five seconds before its first paint. Screens that merely display provider
 * status use this and render immediately; the Health tab, where an admin has
 * actually asked, performs the live check.
 *
 * Returns null when no check has run yet in this process, which callers must
 * present as "not checked" rather than as healthy.
 */
export function getCachedProviderHealth(): ProviderHealth | null {
  return cached ? cached.health : null;
}

/* ── The active provider ───────────────────────────────────────────────────

   One instance, so the pooled transport is shared. This is the seam a second
   provider would slot into later; today there is exactly one, and nothing here
   silently reroutes mail. */
let activeProvider: MailProvider | null = null;

export function getMailProvider(): MailProvider {
  if (!activeProvider) activeProvider = new SmtpMailProvider('SMTP');
  return activeProvider;
}

/** Test seam: substitute a provider, or pass null to restore the default. */
export function setMailProviderForTesting(provider: MailProvider | null): void {
  activeProvider = provider;
}
