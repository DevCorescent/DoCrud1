/**
 * Signups that exist ONLY as a verification code.
 *
 * ═══ THE RULE THIS MODULE ENFORCES ═══
 *
 * No account, no profile, no workspace and no session exist until the code
 * emailed to the address has come back. Everything the person typed is held
 * here, keyed by an unguessable handle, until then — and if the code never
 * arrives the whole thing expires and leaves nothing behind.
 *
 * The previous flow created the account first and mailed the code afterwards,
 * so a delivery failure left a real, signed-in, unverified account behind, and
 * an address the owner had never proven belonged to them. That is the hole
 * this closes.
 *
 * ═══ WHAT IS STORED, AND WHAT IS NOT ═══
 *
 * The PASSWORD is never held in a readable form. It is put through the same
 * scrypt hashing the user store uses at the moment it is received, and only the
 * hash and its salt are kept — so this store is worth no more to anyone who
 * reads it than the user table already is.
 *
 * The CODE is never held in a readable form either: only `sha256(salt:code)`,
 * checked with a timing-safe comparison.
 *
 * ═══ THE LIMITS ═══
 *
 * · A record lives 30 minutes and no longer.
 * · Five wrong codes destroy it — no "one more try" by requesting a resend,
 *   because a resend rewrites the code on the SAME record and keeps the count.
 * · Verification consumes the record inside the storage lock, so one code
 *   creates at most one account even if two requests arrive together.
 * · One live record per email address. Starting again replaces it rather than
 *   accumulating codes that all still work.
 */
import crypto from 'node:crypto';
import {
  pendingSignupsPath, readJsonFile, withStorageLock, writeJsonFile,
} from '@/lib/server/storage';
import { createPasswordHash, isValidEmail, normalizeEmail } from '@/lib/server/security';
import type { OAuthOnboarding } from '@/lib/server/oauth-intent';

/* Thirty minutes, matching the window the existing email-verification sessions
   have always used. Ten was too tight in practice: a code that takes a couple
   of minutes to arrive, plus a person who reads it on their phone, plus one
   mistyped digit, and the record was gone — and because no account exists yet,
   an expiry means re-entering the whole form rather than just asking for
   another code. The email copy states this same number. */
export const PENDING_SIGNUP_TTL_MS = 30 * 60 * 1000;
export const PENDING_SIGNUP_MAX_ATTEMPTS = 5;
/** A resend before this has elapsed is refused; the route also rate-limits. */
export const PENDING_SIGNUP_RESEND_COOLDOWN_MS = 30 * 1000;
/** A hard ceiling on codes per record, so a resend loop cannot mail forever. */
export const PENDING_SIGNUP_MAX_SENDS = 5;
/** Nothing legitimate needs more than this many live records at once. */
const MAX_RECORDS = 500;

export type PendingAccountKind = 'individual' | 'business';

export type PendingSignup = {
  /** The opaque handle the browser holds. 32 random bytes, base64url. */
  id: string;
  email: string;
  name: string;
  accountKind: PendingAccountKind;
  organizationName?: string;
  industry?: string;
  /** scrypt, exactly as the user store computes it. The password itself is gone. */
  passwordHash: string;
  passwordSalt: string;
  /** Already coerced and capped by the caller before it reaches this store. */
  onboarding?: OAuthOnboarding;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  lastSentAt: string;
  expiresAt: string;
  attempts: number;
  sends: number;
  /** For the policy-acceptance record written when the account is finally made. */
  policyIp?: string;
  referralCode?: string;
};

type Store = { pending: PendingSignup[] };

const EMPTY: Store = { pending: [] };

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEq(a: string, b: string) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Cryptographically secure 6-digit code, with no leading-zero bias. */
function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function hashOtp(otp: string) {
  const otpSalt = crypto.randomBytes(16).toString('hex');
  return { otpSalt, otpHash: sha256Hex(`${otpSalt}:${otp}`) };
}

function live(records: PendingSignup[], at = Date.now()): PendingSignup[] {
  return records.filter((record) => {
    const expiresAt = new Date(record?.expiresAt ?? '').getTime();
    return Number.isFinite(expiresAt) && expiresAt > at;
  });
}

async function readLive(): Promise<PendingSignup[]> {
  const store = await readJsonFile<Store>(pendingSignupsPath, EMPTY);
  return live(Array.isArray(store.pending) ? store.pending : []);
}

async function writeAll(records: PendingSignup[]) {
  /* Newest first, capped. An expired record is already gone by construction;
     the cap is the backstop for a flood that outruns expiry. */
  await writeJsonFile(pendingSignupsPath, { pending: records.slice(0, MAX_RECORDS) });
}

export type CreatePendingSignupInput = {
  email: string;
  name: string;
  password: string;
  accountKind: PendingAccountKind;
  organizationName?: string;
  industry?: string;
  onboarding?: OAuthOnboarding;
  policyIp?: string;
  referralCode?: string;
};

/**
 * Stage a signup and mint its first code.
 *
 * Returns the code in the clear exactly once, to its caller, so the caller can
 * mail it. It is not stored, logged, or returned to the browser.
 */
export async function createPendingSignup(
  input: CreatePendingSignupInput,
): Promise<{ pending: PendingSignup; otp: string }> {
  const email = normalizeEmail(input.email || '');
  if (!isValidEmail(email)) throw new Error('Enter a valid email address.');
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw new Error('Enter your name.');
  if (!input.password || input.password.length < 8) {
    throw new Error('Use a password of at least 8 characters.');
  }
  if (input.accountKind === 'business' && !String(input.organizationName || '').trim()) {
    throw new Error('Tell us your organization name.');
  }

  const otp = generateOtp();
  const now = new Date();
  const record: PendingSignup = {
    id: crypto.randomBytes(32).toString('base64url'),
    email,
    name,
    accountKind: input.accountKind,
    organizationName: String(input.organizationName || '').trim().slice(0, 160) || undefined,
    industry: String(input.industry || '').trim().slice(0, 80) || undefined,
    ...createPasswordHash(input.password),
    onboarding: input.onboarding,
    ...hashOtp(otp),
    createdAt: now.toISOString(),
    lastSentAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PENDING_SIGNUP_TTL_MS).toISOString(),
    attempts: 0,
    sends: 1,
    policyIp: input.policyIp,
    referralCode: input.referralCode,
  };

  await withStorageLock(pendingSignupsPath, async () => {
    const records = await readLive();
    /* One live record per address: a second start replaces the first, so an
       abandoned attempt cannot leave a working code behind. */
    await writeAll([record, ...records.filter((r) => r.email !== email)]);
  });

  return { pending: record, otp };
}

/**
 * Mint a NEW code for an existing record — WITHOUT retiring the old one yet.
 *
 * The resend counters move now, so a send that fails cannot be hammered for
 * free; the CODE only changes once `commitPendingSignupOtp` says the new one
 * actually went out. That ordering matters: replacing the hash first would mean
 * a failed delivery destroyed a code the person may already be holding.
 *
 * The record is reused rather than replaced, so `attempts` carries over — a
 * resend is not a way to buy five more guesses.
 */
export async function beginPendingSignupResend(
  id: string,
): Promise<{ pending: PendingSignup; otp: string; hashed: { otpHash: string; otpSalt: string } }> {
  const handle = String(id || '');
  if (!handle) throw new Error('Start again — this signup session has expired.');

  const otp = generateOtp();
  const hashed = hashOtp(otp);

  return withStorageLock(pendingSignupsPath, async () => {
    const records = await readLive();
    const index = records.findIndex((r) => r.id === handle);
    if (index < 0) throw new Error('Start again — this signup session has expired.');

    const current = records[index];
    if (current.attempts >= PENDING_SIGNUP_MAX_ATTEMPTS) {
      throw new Error('Too many incorrect codes. Please start again.');
    }
    if (current.sends >= PENDING_SIGNUP_MAX_SENDS) {
      throw new Error('Too many codes requested for this signup. Please start again.');
    }
    const since = Date.now() - new Date(current.lastSentAt).getTime();
    if (Number.isFinite(since) && since < PENDING_SIGNUP_RESEND_COOLDOWN_MS) {
      throw new Error('A code was just sent. Please wait a moment before asking for another.');
    }

    const next: PendingSignup = {
      ...current,
      lastSentAt: new Date().toISOString(),
      sends: current.sends + 1,
    };
    records[index] = next;
    await writeAll(records);
    return { pending: next, otp, hashed };
  });
}

/** Retire the previous code in favour of one that has actually been delivered. */
export async function commitPendingSignupOtp(
  id: string,
  hashed: { otpHash: string; otpSalt: string },
): Promise<void> {
  const handle = String(id || '');
  if (!handle) return;
  await withStorageLock(pendingSignupsPath, async () => {
    const records = await readLive();
    const index = records.findIndex((r) => r.id === handle);
    if (index < 0) return;
    records[index] = { ...records[index], ...hashed };
    await writeAll(records);
  });
}

export type ConsumeResult =
  | { ok: true; pending: PendingSignup }
  | { ok: false; error: string; attemptsLeft?: number };

/**
 * Check a code and, if it is right, CONSUME the record.
 *
 * Read, decision and write happen inside one lock, and the record is deleted in
 * the same critical section that accepts it — so a code replayed twice in
 * parallel cannot produce two accounts.
 */
export async function consumePendingSignup(
  id: string,
  email: string,
  code: string,
): Promise<ConsumeResult> {
  const handle = String(id || '');
  const normalizedEmail = normalizeEmail(email || '');
  const otp = String(code || '').trim();

  if (!handle || !/^\d{6}$/.test(otp)) {
    return { ok: false, error: 'Enter the 6-digit code we emailed you.' };
  }

  return withStorageLock(pendingSignupsPath, async (): Promise<ConsumeResult> => {
    const records = await readLive();
    const index = records.findIndex((r) => r.id === handle);
    if (index < 0) {
      return { ok: false, error: 'This code has expired. Please start again.' };
    }

    const record = records[index];
    /* The address is part of the credential, not a hint: a handle taken from
       one signup cannot be redeemed against another address. */
    if (record.email !== normalizedEmail) {
      return { ok: false, error: 'This code does not match that email address.' };
    }
    if (record.attempts >= PENDING_SIGNUP_MAX_ATTEMPTS) {
      records.splice(index, 1);
      await writeAll(records);
      return { ok: false, error: 'Too many incorrect codes. Please start again.' };
    }

    if (!safeEq(sha256Hex(`${record.otpSalt}:${otp}`), record.otpHash)) {
      const attempts = record.attempts + 1;
      if (attempts >= PENDING_SIGNUP_MAX_ATTEMPTS) {
        /* Spent. The record goes now rather than lingering as a target. */
        records.splice(index, 1);
        await writeAll(records);
        return { ok: false, error: 'Too many incorrect codes. Please start again.', attemptsLeft: 0 };
      }
      records[index] = { ...record, attempts };
      await writeAll(records);
      return {
        ok: false,
        error: 'That code is not right. Please check the email and try again.',
        attemptsLeft: PENDING_SIGNUP_MAX_ATTEMPTS - attempts,
      };
    }

    /* Correct — and single-use. */
    records.splice(index, 1);
    await writeAll(records);
    return { ok: true, pending: record };
  });
}

/** Drop a staged signup — used when its code could not be delivered. */
export async function discardPendingSignup(id: string): Promise<void> {
  const handle = String(id || '');
  if (!handle) return;
  await withStorageLock(pendingSignupsPath, async () => {
    const records = await readLive();
    await writeAll(records.filter((r) => r.id !== handle));
  });
}

/** The address a handle is bound to, for a resend that must not take one from the body. */
export async function peekPendingSignup(id: string): Promise<PendingSignup | null> {
  const handle = String(id || '');
  if (!handle) return null;
  const records = await readLive();
  return records.find((r) => r.id === handle) ?? null;
}
