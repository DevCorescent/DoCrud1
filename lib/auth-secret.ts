/**
 * The one place the NextAuth signing secret is resolved.
 *
 * ═══ WHY THIS IS ITS OWN MODULE ═══
 *
 * Three places need the same answer, and they must agree or sessions silently
 * stop working: `buildAuthOptions` (which signs the cookie), `getServerSession`
 * (which reads it through those same options), and the middleware's
 * `getToken` (which reads it on the edge, and therefore cannot import
 * lib/server/auth.ts and its mail/database dependencies).
 *
 * ═══ THE FAILURE THIS PREVENTS ═══
 *
 * With no secret configured, NextAuth's ROUTE HANDLER still works in
 * development — it derives a fallback of its own — so /api/auth/session happily
 * returns a signed-in user. But `authOptions.secret` was `undefined`, so
 * `getServerSession()` could not decrypt the cookie the route handler had just
 * issued, and `getToken({ req })` on the edge read `process.env.NEXTAUTH_SECRET`
 * directly and got nothing. The result was a session that existed for the
 * browser and did not exist for the server: signing in worked, and then the
 * homepage bounced the person straight back to /onboarding, because its
 * `getAuthSession()` returned null. Nothing in the sign-in path looked wrong,
 * which is what made it expensive to find.
 *
 * ═══ THE FALLBACK IS DEVELOPMENT-ONLY, DELIBERATELY ═══
 *
 * A predictable signing key means forgeable sessions, so the fallback is
 * refused outside development. In production a missing secret returns
 * undefined and NextAuth fails loudly at startup — which is the correct
 * outcome: a deployment with no secret should not come up at all, rather than
 * come up and quietly log everybody out.
 */

/** Stable across processes so the signer and every reader agree. Dev only. */
const DEVELOPMENT_FALLBACK_SECRET = 'docrud-development-only-insecure-auth-secret';

export function getAuthSecret(): string | undefined {
  const configured = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    /* No fallback here, ever. Returning a known constant would make every
       session on the deployment forgeable by anyone who has read this file. */
    return undefined;
  }

  return DEVELOPMENT_FALLBACK_SECRET;
}

/** True when the deployment is relying on the insecure development fallback. */
export function isUsingDevelopmentAuthSecret(): boolean {
  return !(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET)
    && process.env.NODE_ENV !== 'production';
}
