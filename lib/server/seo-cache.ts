/**
 * The single cache tag for public SEO settings.
 *
 * It lives alone in this file so both the reader (lib/server/seo-settings.ts)
 * and the writer (the Super Admin save route) import the same constant. A tag
 * is a plain string, and a typo in one of two scattered literals produces a
 * cache that is never invalidated and metadata that silently goes stale —
 * exactly the failure this feature exists to prevent.
 */
export const SEO_CACHE_TAG = 'seo-settings';

/** Public routes whose rendered output embeds SEO settings. */
export const SEO_REVALIDATE_PATHS = ['/'] as const;
