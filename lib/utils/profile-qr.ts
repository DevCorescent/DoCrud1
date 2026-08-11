/**
 * Canonical public-profile URL building for QR codes.
 *
 * Deliberately thin: absolute-URL construction already lives in `lib/url.ts`
 * (`getPublicAppBaseUrl` / `buildAbsoluteAppUrl`) and is reused here rather than
 * reimplemented, so profile links can never drift from the rest of the app.
 */
import { buildAbsoluteAppUrl } from '@/lib/url';

/** Public profile route. Kept in one place so the path is never re-typed. */
export const PROFILE_PATH_PREFIX = '/u';

/**
 * Env vars that pin the canonical origin in a deployed environment.
 * Mirrors getPublicAppBaseUrl() in lib/url.ts — if none are set we are running
 * locally, and the caller's runtime origin should win instead of the
 * production fallback baked into that helper.
 */
function hasConfiguredOrigin(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim(),
  );
}

/**
 * Profile ids are generated server-side and look like `individual-1782905864198`
 * or `individual-google-1782905864198`. Anything with a slash, dot segment or
 * whitespace is not one, and must never reach a URL or a database lookup.
 */
export function isValidProfileId(userId: unknown): userId is string {
  return typeof userId === 'string'
    && userId.length > 0
    && userId.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(userId);
}

/**
 * Absolute URL a profile QR code should point at: `{origin}/u/{userId}`.
 *
 * `origin` is the request's own origin (e.g. `http://localhost:3000`). It is
 * used ONLY when no canonical origin is configured, so a locally generated QR
 * points at localhost while a deployed one always points at the real domain —
 * a dev origin can never leak into a production QR.
 */
export function getProfileUrl(userId: string, origin?: string): string {
  const encoded = encodeURIComponent(userId);
  const path = `${PROFILE_PATH_PREFIX}/${encoded}`;
  const runtimeOrigin = hasConfiguredOrigin() ? undefined : origin?.trim() || undefined;
  return buildAbsoluteAppUrl(path, runtimeOrigin);
}

/** Relative profile path — for in-app <Link href> where an origin is wrong. */
export function getProfilePath(userId: string): string {
  return `${PROFILE_PATH_PREFIX}/${encodeURIComponent(userId)}`;
}
