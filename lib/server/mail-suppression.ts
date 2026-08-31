/**
 * Mail suppression: who must not receive marketing mail.
 *
 * The rule this exists to enforce is narrow and absolute: once someone
 * unsubscribes, no campaign reaches them again. Everything else here follows
 * from making that hard to get wrong.
 *
 * MARKETING ONLY. A suppression never blocks a verification code, a password
 * reset or an account notice. Someone who opts out of newsletters has not
 * asked to be locked out of their own account, and the send-time check lives
 * on the campaign path precisely so a transactional send cannot reach it.
 *
 * The store follows the project's existing pattern - a JSON document behind
 * `readJsonFile`/`writeJsonFile`, mutated inside `withStorageLock` - so it
 * inherits the atomic writes and the append serialisation the outbox already
 * relies on. No new storage tier, no new log.
 */
import crypto from 'crypto';
import {
  mailSuppressionPath, readJsonFile, writeJsonFile, withStorageLock,
} from '@/lib/server/storage';

export type SuppressionReason =
  | 'unsubscribe'
  | 'admin_suppressed'
  /** The provider reported a permanent delivery failure. */
  | 'hard_bounce'
  /** The recipient reported the message as spam. */
  | 'complaint';

/* Reasons an administrator may not simply lift.
   `unsubscribe` and `complaint` are the RECIPIENT's own signal, and quietly
   re-enabling marketing to someone who opted out or reported spam is both a
   breach of their choice and a fast way to lose sending reputation. A hard
   bounce is a fact about an address rather than a wish, so it stays removable
   for the case where the mailbox is genuinely restored. */
const PROTECTED_REASONS: SuppressionReason[] = ['unsubscribe', 'complaint'];

export function isProtectedReason(reason: SuppressionReason): boolean {
  return PROTECTED_REASONS.includes(reason);
}

export interface SuppressionRecord {
  /** Normalized: trimmed and lower-cased. The only form ever stored. */
  email: string;
  reason: SuppressionReason;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Who or what created it: an admin address, or 'recipient' for an opt-out. */
  createdBy: string;
  /** How it arrived, for the audit trail. */
  source: 'admin' | 'unsubscribe_link' | 'provider_event';
}

interface State { records: SuppressionRecord[] }
const fallback: State = { records: [] };
const LOCK = 'mail-suppression';

/**
 * The one normalization.
 *
 * Address comparison has to be case-insensitive or an unsubscribe from
 * `Alice@Example.com` would not protect `alice@example.com` - the same inbox,
 * mailed anyway. Every read, write and check goes through this.
 */
export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export async function getSuppressionRecords(): Promise<SuppressionRecord[]> {
  const state = await readJsonFile<State>(mailSuppressionPath, fallback).catch(() => fallback);
  return Array.isArray(state?.records) ? state.records : [];
}

export async function getSuppression(email: string): Promise<SuppressionRecord | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const records = await getSuppressionRecords();
  return records.find((r) => r.email === normalized) ?? null;
}

/**
 * Add or reactivate a suppression.
 *
 * Idempotent by address: a second unsubscribe updates the existing record
 * rather than appending a duplicate, so clicking the link twice cannot produce
 * two rows for one person.
 *
 * An UNSUBSCRIBE always wins over an admin suppression on the same address.
 * The reverse would let an administrative action quietly overwrite a
 * recipient's own stated choice, which is the one thing this store must never
 * allow.
 */
export async function addSuppression(input: {
  email: string;
  reason: SuppressionReason;
  actor: string;
  source: SuppressionRecord['source'];
}): Promise<{ record: SuppressionRecord; created: boolean }> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('An email address is required.');

  return withStorageLock(LOCK, async () => {
    const records = await getSuppressionRecords();
    const now = new Date().toISOString();
    const existing = records.find((r) => r.email === email);

    if (existing) {
      const next: SuppressionRecord = {
        ...existing,
        active: true,
        /* Precedence, strongest first: an unsubscribe is never overwritten,
           and a protected reason is never downgraded to an unprotected one.
           An admin note must not erase a recipient's own signal. */
        reason: existing.reason === 'unsubscribe' ? 'unsubscribe'
          : isProtectedReason(existing.reason) && !isProtectedReason(input.reason)
            ? existing.reason
            : input.reason,
        updatedAt: now,
      };
      if (next.reason !== existing.reason || next.active !== existing.active) {
        next.createdBy = input.reason === 'unsubscribe' ? input.actor : existing.createdBy;
        next.source = input.reason === 'unsubscribe' ? input.source : existing.source;
      }
      await writeJsonFile(mailSuppressionPath, {
        records: records.map((r) => (r.email === email ? next : r)),
      });
      /* `created: false` even when it was reactivated: the caller uses this to
         decide whether anything actually changed. */
      return { record: next, created: !existing.active };
    }

    const record: SuppressionRecord = {
      email,
      reason: input.reason,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actor,
      source: input.source,
    };
    await writeJsonFile(mailSuppressionPath, { records: [record, ...records] });
    return { record, created: true };
  });
}

/**
 * Deactivate an ADMIN suppression.
 *
 * A recipient's unsubscribe cannot be removed here. Letting an administrator
 * re-enable marketing to someone who opted out is exactly the silent override
 * this store exists to prevent, so the refusal is in the data layer rather
 * than in a UI check that a future caller could bypass.
 */
export async function removeSuppression(
  email: string, actor: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'unsubscribe_protected' }> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, reason: 'not_found' };

  return withStorageLock(LOCK, async () => {
    const records = await getSuppressionRecords();
    const existing = records.find((r) => r.email === normalized && r.active);
    if (!existing) return { ok: false, reason: 'not_found' } as const;
    if (isProtectedReason(existing.reason)) {
      return { ok: false, reason: 'unsubscribe_protected' } as const;
    }
    await writeJsonFile(mailSuppressionPath, {
      records: records.map((r) => (r.email === normalized
        ? { ...r, active: false, updatedAt: new Date().toISOString(), createdBy: actor }
        : r)),
    });
    return { ok: true } as const;
  });
}

/**
 * Which of these addresses must not be mailed.
 *
 * One read for the whole audience rather than a lookup per recipient: the send
 * loop calls this immediately before sending, and a per-address round trip
 * would make the check expensive enough that someone would later be tempted to
 * cache or skip it.
 */
export async function filterSuppressed(emails: string[]): Promise<{
  eligible: string[];
  suppressed: string[];
}> {
  const records = await getSuppressionRecords();
  const blocked = new Set(records.filter((r) => r.active).map((r) => r.email));
  const eligible: string[] = [];
  const suppressed: string[] = [];
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (blocked.has(email)) suppressed.push(raw);
    else eligible.push(raw);
  }
  return { eligible, suppressed };
}

/** Is this single address suppressed? Used by the retry path. */
export async function isSuppressed(email: string): Promise<boolean> {
  const record = await getSuppression(email);
  return Boolean(record?.active);
}

/* ── Unsubscribe tokens ────────────────────────────────────────────────────

   An opaque, signed token. It carries the address and a purpose, and nothing
   else: no session, no password, no OTP, no provider credential. Anyone who
   intercepts one can unsubscribe that address from marketing mail and do
   nothing else at all, which is the whole blast radius by design.

   Signed rather than random so no token store is needed - a random token would
   mean a second table, an expiry policy and a cleanup job, for a link whose
   only power is to stop mail. */

const TOKEN_VERSION = 'u2';

function tokenKey(): Buffer {
  /* Reuses an existing application secret rather than adding another required
     env var. In production this is set; the fallback keeps development
     working, and a token produced under one secret simply fails to open under
     another - it never silently unsubscribes the wrong person. */
  const secret = process.env.MAIL_UNSUBSCRIBE_SECRET
    || process.env.NEXTAUTH_SECRET
    || 'docrud-development-unsubscribe-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt the address rather than signing it.
 *
 * A signed token still carries the address in the clear - base64 is encoding,
 * not concealment - so the unsubscribe URL would put a recipient's email in
 * every mail server log, browser history and referrer header it passed
 * through. AES-GCM keeps the URL free of readable PII and authenticates it at
 * the same time, so no separate signature is needed.
 */
export function createUnsubscribeToken(email: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const body = Buffer.concat([
    cipher.update(normalizeEmail(email), 'utf8'),
    cipher.final(),
  ]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), body]);
  return `${TOKEN_VERSION}.${packed.toString('base64url')}`;
}

/**
 * The address a token refers to, or null if it does not open.
 *
 * Null covers every failure identically - wrong version, tampered ciphertext,
 * bad tag, malformed input - so nothing about WHY a token was rejected leaks
 * back to whoever presented it. The GCM tag makes tampering a decryption
 * failure rather than something this code has to detect itself.
 */
export function readUnsubscribeToken(token: string | null | undefined): string | null {
  const raw = String(token ?? '');
  const dot = raw.indexOf('.');
  if (dot < 0) return null;
  if (raw.slice(0, dot) !== TOKEN_VERSION) return null;

  try {
    const packed = Buffer.from(raw.slice(dot + 1), 'base64url');
    /* 12-byte IV + 16-byte tag, plus at least one byte of ciphertext. */
    if (packed.length < 29) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', tokenKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const email = normalizeEmail(Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final(),
    ]).toString('utf8'));
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}
