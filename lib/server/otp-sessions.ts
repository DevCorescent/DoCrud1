import crypto from 'node:crypto';
import { otpSessionsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { isValidEmail, normalizeEmail } from '@/lib/server/security';

type BusinessSignupOtpSession = {
  id: string;
  purpose: 'business_signup' | 'document_signing' | 'account_action';
  email: string;
  historyId?: string;
  signerKey?: string;
  /** For account_action purpose */
  action?: 'deactivate' | 'delete';
  userId?: string;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  lastSentAt: string;
  expiresAt: string;
  attempts: number;
  verifiedAt?: string;
};

type OtpSessionStore = {
  sessions: BusinessSignupOtpSession[];
};

const DEFAULT_STORE: OtpSessionStore = { sessions: [] };

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEq(a: string, b: string) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(baseIso: string, minutes: number) {
  const base = new Date(baseIso);
  base.setMinutes(base.getMinutes() + minutes);
  return base.toISOString();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateSessionId() {
  return crypto.randomBytes(18).toString('base64url');
}

async function readStore() {
  const store = await readJsonFile<OtpSessionStore>(otpSessionsPath, DEFAULT_STORE);
  const sessions = Array.isArray(store.sessions) ? store.sessions : [];
  return { sessions };
}

async function writeStore(store: OtpSessionStore) {
  await writeJsonFile(otpSessionsPath, store);
}

function pruneExpiredSessions(store: OtpSessionStore, at = Date.now()) {
  const sessions = store.sessions.filter((session) => {
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt > at;
  });
  return { sessions };
}

export async function createBusinessSignupOtpSession(emailRaw: string) {
  const email = normalizeEmail(emailRaw || '');
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid business email to receive an OTP.');
  }

  const now = nowIso();
  const store = pruneExpiredSessions(await readStore(), Date.now());

  // Basic resend throttle per email.
  const recent = store.sessions
    .filter((s) => s.purpose === 'business_signup' && s.email === email)
    .sort((a, b) => +new Date(b.lastSentAt) - +new Date(a.lastSentAt))[0];
  if (recent) {
    const diffMs = Date.now() - new Date(recent.lastSentAt).getTime();
    if (Number.isFinite(diffMs) && diffMs < 45_000) {
      throw new Error('OTP already sent. Please wait a moment and try again.');
    }
  }

  const otp = generateOtp();
  const otpSalt = crypto.randomBytes(16).toString('hex');
  const otpHash = sha256Hex(`${otpSalt}:${otp}`);
  const session: BusinessSignupOtpSession = {
    id: generateSessionId(),
    purpose: 'business_signup',
    email,
    otpHash,
    otpSalt,
    createdAt: now,
    lastSentAt: now,
    expiresAt: addMinutes(now, 10),
    attempts: 0,
  };

  store.sessions.unshift(session);
  await writeStore(store);

  return { sessionId: session.id, otp, expiresAt: session.expiresAt };
}

export async function verifyBusinessSignupOtp(sessionId: string, emailRaw: string, otp: string) {
  const email = normalizeEmail(emailRaw || '');
  if (!sessionId || sessionId.length < 10) {
    throw new Error('OTP session expired. Please request a new OTP.');
  }
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email to verify the OTP.');
  }
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Enter the 6-digit OTP.');
  }

  const store = pruneExpiredSessions(await readStore(), Date.now());
  const idx = store.sessions.findIndex((s) => s.id === sessionId && s.purpose === 'business_signup');
  if (idx < 0) {
    throw new Error('OTP session expired. Please request a new OTP.');
  }
  const session = store.sessions[idx];
  if (session.email !== email) {
    throw new Error('OTP session does not match this email. Request a new OTP.');
  }
  if (session.verifiedAt) {
    return { verified: true, verifiedAt: session.verifiedAt };
  }
  if (session.attempts >= 5) {
    throw new Error('Too many attempts. Request a new OTP.');
  }

  const attemptHash = sha256Hex(`${session.otpSalt}:${code}`);
  session.attempts += 1;

  if (!safeEq(attemptHash, session.otpHash)) {
    store.sessions[idx] = session;
    await writeStore(store);
    throw new Error('Incorrect OTP. Please try again.');
  }

  session.verifiedAt = nowIso();
  store.sessions[idx] = session;
  await writeStore(store);
  return { verified: true, verifiedAt: session.verifiedAt };
}

export async function assertBusinessSignupOtpVerified(sessionId: string, emailRaw: string) {
  const email = normalizeEmail(emailRaw || '');
  if (!sessionId) {
    throw new Error('Email verification is required.');
  }
  const store = pruneExpiredSessions(await readStore(), Date.now());
  const session = store.sessions.find((s) => s.id === sessionId && s.purpose === 'business_signup');
  if (!session) {
    throw new Error('Email verification expired. Please verify again.');
  }
  if (session.email !== email) {
    throw new Error('Email verification does not match. Please verify again.');
  }
  if (!session.verifiedAt) {
    throw new Error('Please verify your email with the OTP before continuing.');
  }
  return { verifiedAt: session.verifiedAt, expiresAt: session.expiresAt };
}

export async function createDocumentSigningOtpSession(input: { email: string; historyId: string; signerKey: string }) {
  const email = normalizeEmail(input.email || '');
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email to receive an OTP.');
  }
  const historyId = String(input.historyId || '').trim();
  const signerKey = String(input.signerKey || '').trim().slice(0, 64);
  if (!historyId) throw new Error('Invalid document session.');
  if (!signerKey) throw new Error('Invalid signer session.');

  const now = nowIso();
  const store = pruneExpiredSessions(await readStore(), Date.now());

  const recent = store.sessions
    .filter((s) => s.purpose === 'document_signing' && s.email === email && s.historyId === historyId && s.signerKey === signerKey)
    .sort((a, b) => +new Date(b.lastSentAt) - +new Date(a.lastSentAt))[0];
  if (recent) {
    const diffMs = Date.now() - new Date(recent.lastSentAt).getTime();
    if (Number.isFinite(diffMs) && diffMs < 45_000) {
      throw new Error('OTP already sent. Please wait a moment and try again.');
    }
  }

  const otp = generateOtp();
  const otpSalt = crypto.randomBytes(16).toString('hex');
  const otpHash = sha256Hex(`${otpSalt}:${otp}`);
  const session: BusinessSignupOtpSession = {
    id: generateSessionId(),
    purpose: 'document_signing',
    email,
    historyId,
    signerKey,
    otpHash,
    otpSalt,
    createdAt: now,
    lastSentAt: now,
    expiresAt: addMinutes(now, 10),
    attempts: 0,
  };
  store.sessions.unshift(session);
  await writeStore(store);
  return { sessionId: session.id, otp, expiresAt: session.expiresAt };
}

export async function verifyDocumentSigningOtp(sessionId: string, emailRaw: string, otp: string, ctx: { historyId: string; signerKey: string }) {
  const email = normalizeEmail(emailRaw || '');
  if (!sessionId || sessionId.length < 10) {
    throw new Error('OTP session expired. Please request a new OTP.');
  }
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email to verify the OTP.');
  }
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Enter the 6-digit OTP.');
  }

  const store = pruneExpiredSessions(await readStore(), Date.now());
  const idx = store.sessions.findIndex((s) => s.id === sessionId && s.purpose === 'document_signing');
  if (idx < 0) throw new Error('OTP session expired. Please request a new OTP.');
  const session = store.sessions[idx];
  if (session.email !== email) throw new Error('OTP session does not match this email. Request a new OTP.');
  if (session.historyId !== ctx.historyId || session.signerKey !== ctx.signerKey) {
    throw new Error('OTP session does not match this document session. Request a new OTP.');
  }
  if (session.verifiedAt) return { verified: true, verifiedAt: session.verifiedAt };
  if (session.attempts >= 5) throw new Error('Too many attempts. Request a new OTP.');

  const attemptHash = sha256Hex(`${session.otpSalt}:${code}`);
  session.attempts += 1;
  if (!safeEq(attemptHash, session.otpHash)) {
    store.sessions[idx] = session;
    await writeStore(store);
    throw new Error('Incorrect OTP. Please try again.');
  }
  session.verifiedAt = nowIso();
  store.sessions[idx] = session;
  await writeStore(store);
  return { verified: true, verifiedAt: session.verifiedAt };
}

export async function assertDocumentSigningOtpVerified(sessionId: string, emailRaw: string, ctx: { historyId: string; signerKey: string }) {
  const email = normalizeEmail(emailRaw || '');
  if (!sessionId) throw new Error('Email verification is required.');
  const store = pruneExpiredSessions(await readStore(), Date.now());
  const session = store.sessions.find((s) => s.id === sessionId && s.purpose === 'document_signing');
  if (!session) throw new Error('Email verification expired. Please verify again.');
  if (session.email !== email) throw new Error('Email verification does not match. Please verify again.');
  if (session.historyId !== ctx.historyId || session.signerKey !== ctx.signerKey) {
    throw new Error('Email verification does not match this signer session.');
  }
  if (!session.verifiedAt) throw new Error('Please verify your email with the OTP before continuing.');
  return { verifiedAt: session.verifiedAt, expiresAt: session.expiresAt };
}

/* ─────────────────────────────────────────────────────────────────────
   Account action OTP  (deactivation / deletion)
───────────────────────────────────────────────────────────────────── */

export async function createAccountActionOtp(input: {
  email: string;
  userId: string;
  action: 'deactivate' | 'delete';
}) {
  const email = normalizeEmail(input.email || '');
  if (!isValidEmail(email)) throw new Error('Invalid email address.');

  const now = nowIso();
  const store = pruneExpiredSessions(await readStore(), Date.now());

  // Throttle: 45 s between resends per user+action
  const recent = store.sessions
    .filter((s) => s.purpose === 'account_action' && s.userId === input.userId && s.action === input.action)
    .sort((a, b) => +new Date(b.lastSentAt) - +new Date(a.lastSentAt))[0];
  if (recent) {
    const diffMs = Date.now() - new Date(recent.lastSentAt).getTime();
    if (Number.isFinite(diffMs) && diffMs < 45_000) {
      throw new Error('OTP already sent. Please wait 45 seconds before requesting again.');
    }
  }

  const otp = generateOtp();
  const otpSalt = crypto.randomBytes(16).toString('hex');
  const otpHash = sha256Hex(`${otpSalt}:${otp}`);

  const session: BusinessSignupOtpSession = {
    id: generateSessionId(),
    purpose: 'account_action',
    email,
    userId: input.userId,
    action: input.action,
    otpHash,
    otpSalt,
    createdAt: now,
    lastSentAt: now,
    expiresAt: addMinutes(now, 10),
    attempts: 0,
  };

  store.sessions.unshift(session);
  await writeStore(store);
  return { sessionId: session.id, otp, expiresAt: session.expiresAt };
}

export async function verifyAccountActionOtp(input: {
  sessionId: string;
  email: string;
  userId: string;
  action: 'deactivate' | 'delete';
  otp: string;
}) {
  const email = normalizeEmail(input.email || '');
  const code  = String(input.otp || '').trim();

  if (!input.sessionId || input.sessionId.length < 10) throw new Error('OTP session expired. Please request a new OTP.');
  if (!isValidEmail(email)) throw new Error('Invalid email.');
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit OTP.');

  const store = pruneExpiredSessions(await readStore(), Date.now());
  const idx = store.sessions.findIndex(
    (s) => s.id === input.sessionId && s.purpose === 'account_action'
      && s.userId === input.userId && s.action === input.action,
  );
  if (idx < 0) throw new Error('OTP session expired or not found. Please request a new OTP.');

  const session = store.sessions[idx];
  if (session.email !== email) throw new Error('OTP session does not match your email.');
  if (session.verifiedAt) return { verified: true, verifiedAt: session.verifiedAt };
  if (session.attempts >= 5) throw new Error('Too many incorrect attempts. Request a new OTP.');

  const attemptHash = sha256Hex(`${session.otpSalt}:${code}`);
  session.attempts += 1;

  if (!safeEq(attemptHash, session.otpHash)) {
    store.sessions[idx] = session;
    await writeStore(store);
    const left = 5 - session.attempts;
    throw new Error(`Incorrect OTP. ${left > 0 ? `${left} attempt${left !== 1 ? 's' : ''} remaining.` : 'No attempts remaining.'}`);
  }

  session.verifiedAt = nowIso();
  store.sessions[idx] = session;
  await writeStore(store);
  return { verified: true, verifiedAt: session.verifiedAt };
}
