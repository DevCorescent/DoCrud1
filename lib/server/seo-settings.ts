/**
 * SEO settings — the metadata a Super Admin can edit, persisted like every
 * other settings object in this app.
 *
 * Storage is `readJsonFile`/`writeJsonFile` (lib/server/storage.ts), which
 * resolves to MongoDB `app_state` when a database is configured and to a local
 * JSON file otherwise — the same three-tier path `homepage-config.ts`,
 * `theme-settings` and `landing-settings` already use. No new persistence
 * layer, and the browser is never the source of truth.
 *
 * WHAT IS NOT EDITABLE HERE: the canonical HOST. It stays deployment
 * configuration (`getPublicAppBaseUrl`), because the sitemap's 502 URLs, every
 * canonical tag and robots.txt all derive from it — a typo in an admin form
 * would silently repoint the entire site at a host nobody serves, with no
 * deploy gate in between. The manager displays it read-only.
 */
import { readJsonFile, writeJsonFile, seoSettingsPath } from '@/lib/server/storage';
import { getPublicAppBaseUrl } from '@/lib/url';
import { resolveSeoWith, type SeoSettings } from '@/lib/seo-resolve';

/* The shape and the fallback rules live in lib/seo-resolve.ts so the admin's
   live preview can resolve them in the browser without a second copy of the
   logic. Re-exported here so every existing import site is unchanged. */
export type { SeoSettings, ResolvedSeo } from '@/lib/seo-resolve';
export { TITLE_MAX, DESCRIPTION_MAX } from '@/lib/seo-resolve';

/**
 * Defaults are the values app/layout.tsx hardcoded before this existed, so an
 * installation that never opens the SEO Manager renders exactly what it did.
 */
export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  siteName: 'Docrud',
  siteTitle: 'Docrud',
  siteTitleFull: 'Docrud - A right connection can change everything',
  siteDescription:
    'Docrud connects professionals, businesses, talent and opportunities in one place. '
    + 'Discover jobs, hire talent, share documents securely and grow your professional network.',
  keywords: [
    'docrud', 'professional network', 'jobs', 'hiring', 'talent',
    'document management', 'resume', 'ATS', 'freelance gigs',
  ],
  noindex: false,

  homeTitle: '',
  homeDescription: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '/docrud-logo.png',
  twitterTitle: '',
  twitterDescription: '',
  twitterImage: '',

  logoUrl: '/docrud-logo.png',
  faviconUrl: '/docrud-favicon.png',

  googleSiteVerification: '',
};

/* ── Validation ────────────────────────────────────────────────────────────
   Every field is validated on the SERVER. The admin UI shows the same limits,
   but a client that ignores them cannot store anything the site would then
   emit into a <meta> tag. */

/** Hard ceilings, enforced. Long enough for any legitimate value. */
const HARD_LIMITS: Record<string, number> = {
  siteName: 120, siteTitle: 200, siteTitleFull: 300, siteDescription: 500,
  homeTitle: 200, homeDescription: 500,
  ogTitle: 200, ogDescription: 500,
  twitterTitle: 200, twitterDescription: 500,
  googleSiteVerification: 200,
};

/**
 * An image/logo reference the site may emit.
 *
 * Only a site-relative path or an absolute http(s) URL is accepted. This is
 * what stops `javascript:` and `data:` — a stored `javascript:` URL would be
 * written straight into an `og:image` or an icon `href`.
 */
export function isSafeAssetUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true; // empty means "use the default"
  if (v.startsWith('//')) return false; // protocol-relative: ambiguous scheme
  if (v.startsWith('/')) return !v.startsWith('/\\');
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Strip control characters and collapse whitespace; never alter meaning. */
function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export interface SeoValidationResult {
  settings: SeoSettings;
  errors: string[];
}

/**
 * Coerce an untrusted payload into settings.
 *
 * Takes a FIXED typed subset — a caller cannot introduce a field the site
 * would later emit — and reports what it rejected rather than silently
 * dropping it, so the admin learns their URL was refused.
 */
export function validateSeoSettings(input: unknown, current: SeoSettings): SeoValidationResult {
  const errors: string[] = [];
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;

  const text = (key: keyof SeoSettings, fallback: string): string => {
    if (!(key in body)) return fallback;
    return clean(body[key], HARD_LIMITS[key as string] ?? 300);
  };

  const asset = (key: keyof SeoSettings, fallback: string): string => {
    if (!(key in body)) return fallback;
    const value = clean(body[key], 500);
    if (!isSafeAssetUrl(value)) {
      errors.push(`${key}: must be a site-relative path or an http(s) URL.`);
      return fallback;
    }
    return value;
  };

  const keywords = Array.isArray(body.keywords)
    ? Array.from(new Set(
        (body.keywords as unknown[])
          .filter((k): k is string => typeof k === 'string')
          .map((k) => clean(k, 60))
          .filter(Boolean),
      )).slice(0, 40)
    : current.keywords;

  const settings: SeoSettings = {
    siteName: text('siteName', current.siteName) || DEFAULT_SEO_SETTINGS.siteName,
    siteTitle: text('siteTitle', current.siteTitle) || DEFAULT_SEO_SETTINGS.siteTitle,
    siteTitleFull: text('siteTitleFull', current.siteTitleFull) || DEFAULT_SEO_SETTINGS.siteTitleFull,
    siteDescription: text('siteDescription', current.siteDescription) || DEFAULT_SEO_SETTINGS.siteDescription,
    keywords,
    noindex: typeof body.noindex === 'boolean' ? body.noindex : current.noindex,

    homeTitle: text('homeTitle', current.homeTitle),
    homeDescription: text('homeDescription', current.homeDescription),
    ogTitle: text('ogTitle', current.ogTitle),
    ogDescription: text('ogDescription', current.ogDescription),
    ogImage: asset('ogImage', current.ogImage),
    twitterTitle: text('twitterTitle', current.twitterTitle),
    twitterDescription: text('twitterDescription', current.twitterDescription),
    twitterImage: asset('twitterImage', current.twitterImage),

    logoUrl: asset('logoUrl', current.logoUrl),
    faviconUrl: asset('faviconUrl', current.faviconUrl),

    googleSiteVerification: text('googleSiteVerification', current.googleSiteVerification),
  };

  return { settings, errors };
}

/** Fill any missing key from the defaults, so a partial stored blob is safe. */
export function mergeSeoSettings(stored: Partial<SeoSettings> | null): SeoSettings {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SEO_SETTINGS };
  return {
    ...DEFAULT_SEO_SETTINGS,
    ...stored,
    keywords: Array.isArray(stored.keywords) && stored.keywords.length
      ? stored.keywords
      : DEFAULT_SEO_SETTINGS.keywords,
  };
}

/* A short in-process cache. generateMetadata() runs on every page render, and
   this is a sub-kilobyte value that changes when an admin presses Save — the
   same trade homepage-config.ts already makes. Cleared on write, so an admin
   sees their change on the next request rather than up to a minute later. */
let cache: { value: SeoSettings; at: number } | null = null;
const CACHE_MS = 60_000;

export function invalidateSeoSettings(): void {
  cache = null;
}

export async function getSeoSettings(): Promise<SeoSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const stored = await readJsonFile<Partial<SeoSettings> | null>(seoSettingsPath, null)
    .catch(() => null);
  const value = mergeSeoSettings(stored);
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSeoSettings(settings: SeoSettings): Promise<void> {
  await writeJsonFile(seoSettingsPath, settings);
  invalidateSeoSettings();
}

/**
 * The values the public site actually emits, with every fallback resolved.
 *
 * One place decides "homepage title falls back to the site title", so the
 * admin preview and the rendered <head> cannot disagree.
 */
export function resolveSeo(settings: SeoSettings) {
  return resolveSeoWith(settings, getPublicAppBaseUrl());
}
