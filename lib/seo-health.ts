/**
 * SEO health — a deterministic checklist over the settings this app actually
 * stores.
 *
 * Scope, deliberately narrow: this scores CONFIGURATION COMPLETENESS, nothing
 * else. It does not know anything about Google's ranking, does not call an
 * external service, and must never be presented as one — the only honest claim
 * it can make is "you have filled in the metadata that matters". Everything it
 * reads is already on screen in the same tab.
 *
 * It grades the RESOLVED values, not the raw fields. An empty "Homepage title"
 * that falls back to a perfectly good global title is configured, and marking
 * it missing would tell the admin to fix something that is not broken.
 */
import { TITLE_MAX, DESCRIPTION_MAX, type SeoSettings, type ResolvedSeo } from '@/lib/seo-resolve';

export type SeoCheckStatus = 'pass' | 'warn' | 'fail';

export interface SeoCheck {
  id: string;
  /** Present tense, states the finding — readable on its own in a list. */
  label: string;
  status: SeoCheckStatus;
  /** Points earned; `weight` is the maximum. A warn earns partial credit. */
  points: number;
  weight: number;
  /** Shown only when the check is not a pass: what to do about it. */
  advice?: string;
}

export interface SeoHealth {
  /** 0–100, rounded. Deterministic for a given settings object. */
  score: number;
  checks: SeoCheck[];
  passed: number;
  total: number;
  /** Coarse band, for the colour of the score readout. */
  band: 'good' | 'fair' | 'poor';
}

/* Weights sum to 100. Indexing carries the most because a noindex site earns
   nothing from any other field being perfect. */
const WEIGHTS = {
  indexing: 15,
  title: 12,
  description: 12,
  canonical: 10,
  ogImage: 9,
  titleLength: 8,
  descriptionLength: 8,
  ogTitle: 8,
  ogDescription: 8,
  favicon: 5,
  verification: 5,
} as const;

function bandFor(score: number): SeoHealth['band'] {
  if (score >= 85) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

/**
 * @param settings the current (possibly unsaved) settings
 * @param resolved the same settings with fallbacks applied
 */
export function computeSeoHealth(settings: SeoSettings, resolved: ResolvedSeo): SeoHealth {
  const checks: SeoCheck[] = [];

  const add = (
    id: string, label: string, weight: number, status: SeoCheckStatus, advice?: string,
  ) => {
    /* A warn is a real problem worth half the weight, not a free pass and not
       a zero — an over-long title still works, it just gets truncated. */
    const points = status === 'pass' ? weight : status === 'warn' ? Math.round(weight / 2) : 0;
    checks.push({ id, label, status, points, weight, advice });
  };

  /* ── Indexing ── */
  add('indexing', settings.noindex ? 'Search engines told NOT to index' : 'Site is indexable',
    WEIGHTS.indexing, settings.noindex ? 'fail' : 'pass',
    settings.noindex ? 'Turn off noindex under Indexing to let the site appear in search results.' : undefined);

  /* ── Title ── */
  const title = resolved.title.trim();
  add('title', title ? 'SEO title configured' : 'SEO title missing',
    WEIGHTS.title, title ? 'pass' : 'fail',
    title ? undefined : 'Set an SEO title under Global SEO.');
  add('title-length',
    !title ? 'Title length not checked'
      : title.length <= TITLE_MAX ? `Title fits in ${TITLE_MAX} characters`
      : `Title is ${title.length} characters`,
    WEIGHTS.titleLength,
    !title ? 'fail' : title.length <= TITLE_MAX ? 'pass' : 'warn',
    title && title.length > TITLE_MAX
      ? `Google usually truncates past ${TITLE_MAX} characters.` : undefined);

  /* ── Description ── */
  const description = resolved.description.trim();
  add('description', description ? 'Meta description configured' : 'Meta description missing',
    WEIGHTS.description, description ? 'pass' : 'fail',
    description ? undefined : 'Set a meta description under Global SEO.');
  add('description-length',
    !description ? 'Description length not checked'
      : description.length <= DESCRIPTION_MAX ? `Description fits in ${DESCRIPTION_MAX} characters`
      : `Description is ${description.length} characters`,
    WEIGHTS.descriptionLength,
    !description ? 'fail' : description.length <= DESCRIPTION_MAX ? 'pass' : 'warn',
    description && description.length > DESCRIPTION_MAX
      ? `Google usually truncates past ${DESCRIPTION_MAX} characters.` : undefined);

  /* ── Canonical ── */
  const canonical = resolved.baseUrl.trim();
  add('canonical', canonical ? 'Canonical URL configured' : 'Canonical URL missing',
    WEIGHTS.canonical, canonical ? 'pass' : 'fail',
    canonical ? undefined : 'Set NEXT_PUBLIC_APP_URL in the deployment environment.');

  /* ── Social ── */
  add('og-title', resolved.ogTitle.trim() ? 'Open Graph title configured' : 'Open Graph title missing',
    WEIGHTS.ogTitle, resolved.ogTitle.trim() ? 'pass' : 'fail',
    resolved.ogTitle.trim() ? undefined : 'Set a social title, or an SEO title for it to fall back to.');
  add('og-description',
    resolved.ogDescription.trim() ? 'Open Graph description configured' : 'Open Graph description missing',
    WEIGHTS.ogDescription, resolved.ogDescription.trim() ? 'pass' : 'fail',
    resolved.ogDescription.trim() ? undefined : 'Set a social description under Social sharing.');
  add('og-image', resolved.ogImage.trim() ? 'Social share image configured' : 'Social share image missing',
    WEIGHTS.ogImage, resolved.ogImage.trim() ? 'pass' : 'fail',
    resolved.ogImage.trim() ? undefined : 'Links shared to social platforms will have no preview image.');

  /* ── Branding ── */
  add('favicon', settings.faviconUrl.trim() ? 'Favicon configured' : 'Favicon missing',
    WEIGHTS.favicon, settings.faviconUrl.trim() ? 'pass' : 'fail',
    settings.faviconUrl.trim() ? undefined : 'Set a favicon under Branding.');

  /* ── Search Console ── */
  const verified = settings.googleSiteVerification.trim();
  add('verification', verified ? 'Google verification configured' : 'Google verification not configured',
    WEIGHTS.verification, verified ? 'pass' : 'warn',
    verified ? undefined
      : 'Optional. Add the Search Console content value to verify ownership from this app.');

  const weight = checks.reduce((sum, c) => sum + c.weight, 0);
  const points = checks.reduce((sum, c) => sum + c.points, 0);
  const score = weight === 0 ? 0 : Math.round((points / weight) * 100);

  return {
    score,
    checks,
    passed: checks.filter((c) => c.status === 'pass').length,
    total: checks.length,
    band: bandFor(score),
  };
}
