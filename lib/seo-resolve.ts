/**
 * The SEO settings shape and its fallback resolution — pure, no server imports.
 *
 * This lives outside lib/server/ for one reason: the admin's Google and social
 * previews must update AS THE ADMIN TYPES, which means resolving fallbacks in
 * the browser. Before this, the previews rendered the server's `resolved` blob
 * and therefore only changed after a save, so an admin editing "Homepage title"
 * saw the preview sit still and had no way to tell whether the field was doing
 * anything.
 *
 * Duplicating the fallback chain in the client was the obvious alternative and
 * the wrong one: two copies drift, and the copy that drifts is the one nobody
 * tests. So the rules live here once, and lib/server/seo-settings.ts calls into
 * this module. Behaviour is unchanged — `resolveSeo(s)` is exactly
 * `resolveSeoWith(s, getPublicAppBaseUrl())`.
 */

export interface SeoSettings {
  /* ── Global ── */
  siteName: string;
  siteTitle: string;
  siteTitleFull: string;
  siteDescription: string;
  keywords: string[];
  /** When true the site emits `noindex, nofollow`. Off by default. */
  noindex: boolean;

  /* ── Homepage ── */
  homeTitle: string;
  homeDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;

  /* ── Branding ── */
  logoUrl: string;
  faviconUrl: string;

  /* ── Search Console ── */
  googleSiteVerification: string;
}

/** Google truncates around these. Advisory — never enforced as a save gate. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

export interface ResolvedSeo {
  baseUrl: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  logoUrl: string;
  faviconUrl: string;
}

/**
 * The values the public site actually emits, with every fallback resolved.
 *
 * One place decides "homepage title falls back to the site title", so the
 * admin preview and the rendered <head> cannot disagree.
 */
export function resolveSeoWith(settings: SeoSettings, baseUrl: string): ResolvedSeo {
  const absolute = (value: string) =>
    !value ? '' : /^https?:\/\//i.test(value) ? value : `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;

  const title = settings.homeTitle || settings.siteTitleFull || settings.siteTitle;
  const description = settings.homeDescription || settings.siteDescription;

  return {
    baseUrl,
    title,
    description,
    ogTitle: settings.ogTitle || title,
    ogDescription: settings.ogDescription || description,
    ogImage: absolute(settings.ogImage || settings.logoUrl),
    twitterTitle: settings.twitterTitle || settings.ogTitle || title,
    twitterDescription: settings.twitterDescription || settings.ogDescription || description,
    twitterImage: absolute(settings.twitterImage || settings.ogImage || settings.logoUrl),
    logoUrl: absolute(settings.logoUrl),
    faviconUrl: settings.faviconUrl,
  };
}
