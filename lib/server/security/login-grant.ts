/**
 * One-shot "login grant" for post-signup auto-login.
 *
 * The credentials login is CAPTCHA-gated server-side (see buildAuthOptions →
 * authorize). But right after a successful signup — which ALREADY passed CAPTCHA
 * and rate limiting — the app immediately calls signIn('credentials') to
 * establish the session, and there is no fresh Turnstile token for that internal
 * call (tokens are single-use and the signup consumed it).
 *
 * A login grant bridges that one hop: the signup route mints a short-lived,
 * HMAC-signed, email-bound token that authorize() accepts IN PLACE OF a CAPTCHA
 * token. It is NOT a password bypass — the correct password is still required —
 * it only proves "this login immediately follows a CAPTCHA-verified signup for
 * this email". It expires in ~2 minutes and is signed with the server auth
 * secret, so the browser cannot forge or extend it.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const TTL_MS = 2 * 60 * 1000; // 2 minutes
const VERSION = 'v1';

function secret(): string | undefined {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

// The email is base64url-encoded inside the token so its dots (and any other
// character) never collide with the '.' field delimiter.
function encodeEmail(email: string): string {
  return Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url');
}

/** Mint a grant for `email`. Returns '' when no server secret is configured. */
export function issueLoginGrant(email: string): string {
  const key = secret();
  if (!key) return '';
  const exp = Date.now() + TTL_MS;
  const payload = `${VERSION}.${encodeEmail(email)}.${exp}`;
  return `${payload}.${sign(payload, key)}`;
}

/** Verify a grant is well-formed, unexpired, and bound to `email`. */
export function verifyLoginGrant(token: unknown, email: string): boolean {
  const key = secret();
  if (!key || typeof token !== 'string' || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [version, boundEmail, expRaw, mac] = parts;
  if (version !== VERSION) return false;
  if (boundEmail !== encodeEmail(email)) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = sign(`${version}.${boundEmail}.${expRaw}`, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
