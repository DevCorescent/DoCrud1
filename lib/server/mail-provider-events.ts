/**
 * Provider delivery events: bounces and complaints.
 *
 * WHAT THIS IS NOT: a real provider webhook. The configured provider is plain
 * SMTP, which has no callback channel at all - it tells you whether it ACCEPTED
 * a message and nothing about what happened afterwards. So this is a
 * provider-neutral internal contract: a normalized event shape, an
 * authenticated endpoint, and the handling logic. Connecting a provider that
 * actually reports bounces (SES, Postmark, Mailgun) still requires configuring
 * that provider and mapping its payload onto `ProviderEvent`. Nothing here
 * invents a provider response.
 *
 * The flow is deliberately short and reuses what already exists:
 *
 *   event -> validate -> classify -> update outbox + delivery -> suppress
 *
 * The suppression store from Phase 13 does the suppressing. The retry rules in
 * the campaign loop stay authoritative for soft bounces. There is no second
 * event log, no second classifier and no second retry system.
 */
import crypto from 'crypto';
import {
  addSuppression, normalizeEmail, type SuppressionReason,
} from '@/lib/server/mail-suppression';
import {
  getEmailOutbox, updateEmailOutboxEvent, type OutboundEmailEvent,
} from '@/lib/server/email-outbox';
import { getMailCampaigns, upsertMailCampaign } from '@/lib/server/mail-campaigns';
import {
  providerEventsPath, readJsonFile, writeJsonFile, withStorageLock,
} from '@/lib/server/storage';

export type ProviderEventType = 'bounce' | 'complaint';
export type BouncePermanence = 'hard' | 'soft';

/** The normalized shape every provider's payload must be mapped onto. */
export interface ProviderEvent {
  /** The provider's own event id, when it has one. Used for deduplication. */
  id?: string;
  type: ProviderEventType;
  email: string;
  /** Explicit permanence, when the provider states it. */
  bounceType?: BouncePermanence;
  /** SMTP reply code, when the provider passes one through. */
  providerCode?: number;
  /** The provider's wording. Stored, never used to make a decision. */
  message?: string;
  occurredAt?: string;
  /** Which provider reported it, for the audit trail. */
  provider?: string;
}

export interface AppliedEvent {
  type: ProviderEventType;
  email: string;
  permanence: BouncePermanence | null;
  suppressed: boolean;
  suppressionReason: SuppressionReason | null;
  outboxUpdated: boolean;
  deliveriesUpdated: number;
  duplicate: boolean;
}

/* ── Classification ────────────────────────────────────────────────────────
   The existing failure classifier answers "can this be retried?" for a SEND
   error. A bounce is a different question asked later, so the mapping here is
   deliberately small and explicit rather than a second copy of those rules. */

/**
 * Is this bounce permanent?
 *
 * An explicit `bounceType` from the provider always wins - the provider knows
 * more than a status code does. Otherwise 5xx is permanent and 4xx is not,
 * which is what those classes mean in SMTP. Anything unrecognised is treated as
 * SOFT: suppressing an address on a guess would silently stop mailing someone
 * who is perfectly reachable, and that error is much worse than one extra
 * retry.
 */
export function classifyBounce(event: ProviderEvent): BouncePermanence {
  if (event.bounceType === 'hard' || event.bounceType === 'soft') return event.bounceType;
  const code = event.providerCode;
  if (typeof code === 'number') {
    if (code >= 500 && code < 600) return 'hard';
    if (code >= 400 && code < 500) return 'soft';
  }
  return 'soft';
}

/* ── Deduplication ─────────────────────────────────────────────────────────
   A provider that retries its webhook must not suppress twice, audit twice or
   move a counter twice. The store is tiny - just the keys already seen - and
   bounded. */

interface SeenState { keys: { key: string; at: string }[] }
const seenFallback: SeenState = { keys: [] };
const LOCK = 'mail-provider-events';
const MAX_SEEN = 5000;

/**
 * A stable key for one event.
 *
 * The provider's own id when there is one. Otherwise a hash of the parts that
 * identify the occurrence - type, address, code and timestamp - which is
 * deterministic for a redelivery of the SAME event while still letting a
 * genuinely new bounce for the same address through later.
 */
export function eventKey(event: ProviderEvent): string {
  if (event.id) return `id:${event.id}`;
  const parts = [
    event.type,
    normalizeEmail(event.email),
    String(event.providerCode ?? ''),
    /* Rounded to the second: providers vary in precision, and a redelivery
       carrying microseconds should still match. */
    (event.occurredAt ?? '').slice(0, 19),
  ].join('|');
  return `h:${crypto.createHash('sha256').update(parts).digest('hex').slice(0, 32)}`;
}

async function claimEvent(key: string): Promise<boolean> {
  return withStorageLock(LOCK, async () => {
    const state = await readJsonFile<SeenState>(providerEventsPath, seenFallback)
      .catch(() => seenFallback);
    const keys = Array.isArray(state?.keys) ? state.keys : [];
    if (keys.some((k) => k.key === key)) return false;
    const next = [{ key, at: new Date().toISOString() }, ...keys].slice(0, MAX_SEEN);
    await writeJsonFile(providerEventsPath, { keys: next });
    return true;
  });
}

/* ── Application ───────────────────────────────────────────────────────────*/

/** The most recent outbox row for an address, if there is one. */
async function recentOutboxRowFor(email: string): Promise<OutboundEmailEvent | null> {
  const rows = await getEmailOutbox(500).catch(() => []);
  const target = normalizeEmail(email);
  return rows.find((r) => normalizeEmail(r.to) === target) ?? null;
}

/**
 * Record a provider event and act on it.
 *
 * Idempotent: a repeated event is recognised and returns `duplicate: true`
 * without touching suppression, deliveries or the outbox.
 */
export async function applyProviderEvent(event: ProviderEvent): Promise<AppliedEvent> {
  const email = normalizeEmail(event.email);
  const permanence = event.type === 'bounce' ? classifyBounce(event) : null;

  const fresh = await claimEvent(eventKey(event));
  if (!fresh) {
    return {
      type: event.type, email, permanence,
      suppressed: false, suppressionReason: null,
      outboxUpdated: false, deliveriesUpdated: 0, duplicate: true,
    };
  }

  const occurredAt = event.occurredAt || new Date().toISOString();
  const marker = event.type === 'complaint' ? 'complaint'
    : permanence === 'hard' ? 'hard_bounce' : 'soft_bounce';

  /* ── The outbox row, if one exists ──
     The SAME record the send wrote. A bounce is the later half of that
     message's story, so it belongs on that row rather than in a parallel log.
     The row's status is left alone: the provider did accept the message, and
     rewriting that to "failed" would erase what actually happened at send
     time. */
  let outboxUpdated = false;
  const row = await recentOutboxRowFor(email).catch(() => null);
  if (row) {
    await updateEmailOutboxEvent(row.id, (ev) => ({
      ...ev,
      providerEvent: marker,
      providerEventAt: occurredAt,
      /* The provider's own code and wording, preserved. Never a credential. */
      providerEventCode: event.providerCode,
      providerEventMessage: event.message ? String(event.message).slice(0, 400) : undefined,
      updatedAt: new Date().toISOString(),
    })).catch(() => {});
    outboxUpdated = true;
  }

  /* ── Campaign delivery records ──
     A permanent bounce or a complaint stops retrying by setting the EXISTING
     `nextRetryAt` to null, which is how the existing retry system already
     expresses "never again". No second retry state is introduced, and a soft
     bounce leaves the existing rules untouched. */
  let deliveriesUpdated = 0;
  if (permanence === 'hard' || event.type === 'complaint') {
    const campaigns = await getMailCampaigns().catch(() => []);
    for (const campaign of campaigns) {
      const deliveries = campaign.deliveries ?? [];
      if (!deliveries.some((d) => normalizeEmail(d.to) === email)) continue;
      await upsertMailCampaign({
        ...campaign,
        deliveries: deliveries.map((d) => (normalizeEmail(d.to) === email
          ? { ...d, status: 'failed' as const, nextRetryAt: null, providerEvent: marker }
          : d)),
      }).catch(() => {});
      deliveriesUpdated += 1;
    }
  }

  /* ── Suppression ──
     Through the Phase 13 store, so there is one list and one set of rules.
     A soft bounce does NOT suppress: it is a temporary condition, and the
     existing retry rules remain the authority on what to do about it. */
  let suppressed = false;
  let suppressionReason: SuppressionReason | null = null;
  if (event.type === 'complaint' || permanence === 'hard') {
    suppressionReason = event.type === 'complaint' ? 'complaint' : 'hard_bounce';
    await addSuppression({
      email,
      reason: suppressionReason,
      actor: event.provider ? `provider:${event.provider}` : 'provider',
      source: 'provider_event',
    });
    suppressed = true;
  }

  return {
    type: event.type, email, permanence,
    suppressed, suppressionReason, outboxUpdated, deliveriesUpdated, duplicate: false,
  };
}

/**
 * Parse an untrusted payload into a `ProviderEvent`.
 *
 * Returns null for anything unrecognised rather than guessing. An event this
 * code does not understand must not be acted on: the actions here are
 * irreversible from the recipient's point of view.
 */
export function parseProviderEvent(input: unknown): ProviderEvent | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const type = String(raw.type ?? '');
  if (type !== 'bounce' && type !== 'complaint') return null;

  const email = normalizeEmail(String(raw.email ?? ''));
  if (!email.includes('@') || email.length < 3) return null;

  const bounceType = raw.bounceType === 'hard' || raw.bounceType === 'soft'
    ? raw.bounceType : undefined;

  const codeValue = Number(raw.providerCode);
  const providerCode = Number.isInteger(codeValue) && codeValue > 0 ? codeValue : undefined;

  const occurredAtRaw = raw.occurredAt ? String(raw.occurredAt) : undefined;
  const occurredAt = occurredAtRaw && !Number.isNaN(new Date(occurredAtRaw).getTime())
    ? new Date(occurredAtRaw).toISOString()
    : undefined;

  return {
    id: raw.id ? String(raw.id).slice(0, 200) : undefined,
    type,
    email,
    bounceType,
    providerCode,
    message: raw.message ? String(raw.message).slice(0, 400) : undefined,
    occurredAt,
    provider: raw.provider ? String(raw.provider).slice(0, 60) : undefined,
  };
}

/**
 * Authorize a provider callback.
 *
 * There is no provider signature to verify, because the configured provider
 * sends no callbacks. A shared secret in a header is what this deployment can
 * actually enforce today; when a provider with real signatures is configured,
 * its verification belongs here beside this check rather than replacing the
 * endpoint.
 *
 * Header-only and constant-time, matching the cron endpoint: a secret in a
 * query string ends up in access logs and Referer headers.
 */
export function checkProviderEventAuth(
  presented: string | null,
): { authorized: boolean; reason: 'ok' | 'missing-secret-config' | 'invalid-credentials' } {
  const secret = process.env.MAIL_PROVIDER_WEBHOOK_SECRET || '';
  if (!secret) {
    /* Unconfigured in production means CLOSED. An open endpoint here would let
       anyone suppress any address. */
    return { authorized: false, reason: 'missing-secret-config' };
  }
  if (!presented) return { authorized: false, reason: 'invalid-credentials' };

  const a = crypto.createHash('sha256').update(presented, 'utf8').digest();
  const b = crypto.createHash('sha256').update(secret, 'utf8').digest();
  return crypto.timingSafeEqual(a, b)
    ? { authorized: true, reason: 'ok' }
    : { authorized: false, reason: 'invalid-credentials' };
}
