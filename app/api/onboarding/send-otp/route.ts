import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { enforceCaptcha, isCaptchaConfigured } from '@/lib/server/security/captcha';
import { otpSessionsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { enforceRateLimits, getClientIp, rateKeyEmail, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { sendOtpEmail } from '@/lib/server/otp-email';

/**
 * Re-verify the address on an account that ALREADY EXISTS.
 *
 * This is not the signup path any more. Creating an account from onboarding
 * goes through /api/onboarding/signup/start and /verify, which mail the code
 * BEFORE anything is created; this endpoint remains for the case where an
 * account exists and its address still needs proving — the Google-created
 * account whose address changed, and the legacy onboarding screens.
 *
 * The email itself is built and delivered by lib/server/otp-email.ts, the one
 * sender the whole product uses. It used to be built here, over a private pair
 * of transports whose 6-second connect budget was shorter than the configured
 * relay's documented cold start — which is why codes stopped arriving while
 * every other email in the product still did.
 */

export const dynamic = 'force-dynamic';
/* Long enough for the sender to walk its transports; see lib/server/otp-email.ts. */
export const maxDuration = 60;

type EmailVerificationOtpSession = {
  id: string;
  purpose: 'email_verification';
  email: string;
  userId: string;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
};

type OtpStore = {
  sessions: Array<Record<string, unknown>>;
};

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateOtp() {
  // Cryptographically secure 6-digit code (no leading-zero bias)
  return String(crypto.randomInt(100000, 999999));
}

function generateId() {
  return crypto.randomBytes(18).toString('base64url');
}

/* ─── Route handler ───────────────────────────────────────────────────────── */
// No auth session required — this endpoint is called immediately after signup
// before the NextAuth client-side session has propagated. We look up the user
// by the email in the request body instead. The OTP itself provides no
// elevated access; it only marks that email as verified for that account.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; captchaToken?: string };
    const email = String(body.email ?? '').toLowerCase().trim();
    if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

    /* An ANONYMOUS caller must pass the challenge before an email is sent.
       Without this the endpoint was a free mailer: rate limits slow that down
       but do not stop it, and the address being mailed is chosen by the caller.

       A caller who already has a session is exempt, because they solved the
       challenge to obtain it — this is the "resend my own verification code"
       path, and re-challenging it would break the existing signup flow that
       calls this immediately after an authenticated sign-in. */
    if (isCaptchaConfigured()) {
      const session = await getAuthSession().catch(() => null);
      if (!session?.user) {
        const captchaFail = await enforceCaptcha(body.captchaToken, {
          remoteIp: getClientIp(req),
          label: 'onboarding-send-otp',
        });
        if (captchaFail) return captchaFail;
      }
    }

    // Throttle OTP sends by account + IP (runs before the account lookup, so it
    // does not reveal whether the email is registered).
    const otpLimited = await enforceRateLimits([
      { key: `otp:send:emailverify:account:${rateKeyEmail(email)}`, policy: RATE_POLICIES.otpSendAccount },
      { key: `otp:send:emailverify:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpSendIp },
    ]);
    if (otpLimited) return otpLimited;

    // Find the registered user for this email
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === email);
    if (!actor) {
      // Return 200 so we don't reveal whether an email is registered
      return NextResponse.json({ sent: true });
    }

    // Rate-limit: at most one active OTP session per user (the prune below
    // removes any previous one before inserting the new one).
    const otp     = generateOtp();
    const salt    = crypto.randomBytes(16).toString('hex');
    const hash    = sha256Hex(`${salt}:${otp}`);
    const now     = new Date().toISOString();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const store    = await readJsonFile<OtpStore>(otpSessionsPath, { sessions: [] });
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    const pruned   = sessions.filter((s) => {
      const r = s as Record<string, unknown>;
      return !(r['purpose'] === 'email_verification' && r['userId'] === actor.id);
    });

    const newSession: EmailVerificationOtpSession = {
      id: generateId(), purpose: 'email_verification',
      email, userId: actor.id,
      otpHash: hash, otpSalt: salt,
      createdAt: now, expiresAt: expires, attempts: 0,
    };
    pruned.unshift(newSession as unknown as Record<string, unknown>);
    await writeJsonFile(otpSessionsPath, { sessions: pruned });

    const firstName = (actor.name ?? '').split(' ')[0];

    /* One sender for every verification code in the product. It builds the
       message from the published system-email configuration when there is one,
       records the outbox row, walks the relay and its fallbacks, and throws
       when none of them delivered — which is what the catch below turns into a
       500 rather than a cheerful 200 over an email nobody received. */
    await sendOtpEmail({
      to: email,
      otp,
      firstName,
      purpose: 'email_verification',
      userId: actor.id,
    });

    return NextResponse.json({ sent: true });

  } catch (error) {
    /* The DETAIL stays on the server. The sender throws messages that name the
       recipient address and every relay it tried — useful in a log, an
       infrastructure disclosure in a response body to a caller who may not even
       own the address. The failure is still a genuine 500; only its wording is
       generic, and the outbox row the sender wrote records the real cause with
       `status: 'failed'`. */
    console.error('[onboarding/send-otp] POST error', error);
    return NextResponse.json(
      { error: 'We could not send your code right now. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
