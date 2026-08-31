/**
 * POST /api/super-admin/seo/verify — is production actually serving the saved
 * metadata?
 *
 * The distinction this exists to enforce: a value being in the database proves
 * nothing about what a crawler receives. Caches, a stale instance, or a
 * revalidation that silently failed can all leave production serving the old
 * title while the admin panel happily shows the new one.
 *
 * So this fetches the real public homepage HTML and compares the tags it finds
 * against the published settings. It reuses `resolveSelfOrigin` from the
 * sitemap validator, which allow-lists the target to the canonical host or
 * loopback — no URL is taken from the request, so this is not an SSRF gadget.
 *
 * A crawler user-agent is used because the homepage redirects ordinary
 * unauthenticated visitors to /onboarding; without it this would verify the
 * wrong page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getSeoSettings, resolveSeo } from '@/lib/server/seo-settings';
import { resolveSelfOrigin } from '@/lib/server/sitemap-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Matches the shared predicate used by middleware and the homepage gate. */
const CRAWLER_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

interface FieldCheck {
  field: string;
  expected: string;
  actual: string;
  matches: boolean;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function pickTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1].trim()) : '';
}

/** Reads a meta tag by name= or property=, whichever the renderer emitted. */
function pickMeta(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${key}["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return decodeEntities(m[1].trim());
  }
  return '';
}

function pickCanonical(html: string): string {
  const m = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i.exec(html);
  return m ? decodeEntities(m[1].trim()) : '';
}

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const origin = resolveSelfOrigin(req);
  const settings = await getSeoSettings();
  const seo = resolveSeo(settings);

  let html = '';
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${origin}/`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'user-agent': CRAWLER_UA },
      });
      if (!res.ok) {
        return NextResponse.json({
          status: 'unavailable',
          checkedAt: new Date().toISOString(),
          error: `The homepage returned HTTP ${res.status}.`,
          checks: [],
        });
      }
      html = await res.text();
    } finally { clearTimeout(timer); }
  } catch (err) {
    /* Cannot reach the page: report UNAVAILABLE. Never "live". */
    return NextResponse.json({
      status: 'unavailable',
      checkedAt: new Date().toISOString(),
      error: err instanceof Error && err.name === 'AbortError'
        ? 'The homepage request timed out.'
        : 'The homepage could not be fetched.',
      checks: [],
    });
  }

  const compare = (field: string, expected: string, actual: string): FieldCheck => ({
    field,
    expected,
    actual,
    /* Trimmed, case-sensitive: a real difference in wording matters, but
       trailing whitespace from the renderer does not. */
    matches: expected.trim() === actual.trim(),
  });

  const checks: FieldCheck[] = [
    compare('Title', seo.title, pickTitle(html)),
    compare('Description', seo.description, pickMeta(html, 'description')),
    compare('Canonical', seo.baseUrl, pickCanonical(html).replace(/\/$/, '')),
    compare('og:title', seo.ogTitle, pickMeta(html, 'og:title')),
    compare('og:description', seo.ogDescription, pickMeta(html, 'og:description')),
    compare('og:image', seo.ogImage, pickMeta(html, 'og:image')),
    compare('twitter:title', seo.twitterTitle, pickMeta(html, 'twitter:title')),
    compare('twitter:description', seo.twitterDescription, pickMeta(html, 'twitter:description')),
    compare('twitter:image', seo.twitterImage, pickMeta(html, 'twitter:image')),
  ];

  /* Robots and verification are only asserted when they are configured to
     produce a specific value. */
  const robots = pickMeta(html, 'robots');
  checks.push({
    field: 'Indexing',
    expected: settings.noindex ? 'noindex' : 'index',
    actual: robots || '(default)',
    matches: settings.noindex
      ? /noindex/i.test(robots)
      : !/noindex/i.test(robots),
  });
  if (settings.googleSiteVerification.trim()) {
    checks.push(compare('Google verification',
      settings.googleSiteVerification.trim(),
      pickMeta(html, 'google-site-verification')));
  }

  const mismatches = checks.filter((c) => !c.matches);

  return NextResponse.json({
    status: mismatches.length === 0 ? 'live' : 'mismatch',
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    verifiedUrl: `${origin}/`,
    checks,
    mismatchCount: mismatches.length,
  });
}
