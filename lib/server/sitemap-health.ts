/**
 * Sitemap validation — checks the sitemap the site ACTUALLY serves.
 *
 * Design decisions worth stating, because each one rules out a tempting
 * shortcut that would have made this dashboard lie:
 *
 * 1. IT VALIDATES SERVED BYTES, NOT A RE-GENERATION. The report comes from
 *    fetching /sitemap.xml and /robots.txt over HTTP, so it exercises the real
 *    route, the real cache and the real XML output. Importing and re-running
 *    `sitemap()` would have measured a second, private copy of the sitemap that
 *    no crawler ever sees — and would have rebuilt all ten data sources on
 *    every click, defeating `revalidate = 3600`.
 *
 * 2. IT NEVER FETCHES A CLIENT-SUPPLIED URL. The origin is derived on the
 *    server and checked against an allow-list (see `resolveSelfOrigin`). An
 *    admin cannot point this at an internal host, so it is not an SSRF gadget.
 *    Note that `getOriginForRequest` is NOT used here: it trusts the `Origin`
 *    header, which the caller controls.
 *
 * 3. IT PARSES XML WITH AN XML PARSER, and robots.txt with the robots parser
 *    this repo already uses for the job scraper. A regex that "looks for <loc>"
 *    would call malformed XML healthy.
 *
 * 4. A METRIC IT CANNOT MEASURE IS `null`, never 0. "0 duplicates" and "we
 *    could not read the sitemap" must not look identical to the admin.
 *
 * What this can prove: the sitemap exists, is valid, is internally consistent,
 * is reachable, and is referenced by robots.txt. What it CANNOT prove is
 * anything about Google — whether Google has fetched, accepted or indexed any
 * of it. Only Search Console knows that, and nothing here claims otherwise.
 */
import { DOMParser } from '@xmldom/xmldom';
import type { NextRequest } from 'next/server';
import { getPublicAppBaseUrl } from '@/lib/url';
import { parseRobots } from '@/lib/server/job-scraper/robots';
import { getSeoSettings } from '@/lib/server/seo-settings';

export type SitemapCheckStatus = 'pass' | 'warn' | 'fail' | 'unavailable';

export interface SitemapCheck {
  id: string;
  label: string;
  status: SitemapCheckStatus;
  /** Only when the check is not a pass. */
  detail?: string;
}

export interface SitemapCategory {
  category: string;
  count: number;
  /** A handful of real URLs, so "Jobs 449" can be inspected rather than trusted. */
  sample: string[];
}

export interface SitemapHealthReport {
  status: 'healthy' | 'warning' | 'error';
  checkedAt: string;

  sitemapUrl: string;
  robotsUrl: string;
  canonicalHost: string;

  /** Round-trip time for the sitemap request, in ms. null when unreachable. */
  responseMs: number | null;
  /** From the sitemap response's Date/Age headers when present. */
  lastGenerated: string | null;

  /* Counts. `null` means "not measurable", never "none found". */
  totalUrls: number | null;
  duplicateUrls: number | null;
  invalidUrls: number | null;
  localhostUrls: number | null;
  nonCanonicalHostUrls: number | null;
  robotsConflicts: number | null;
  privateUrls: number | null;
  schemeMismatches: number | null;
  wwwVariantUrls: number | null;

  breakdown: SitemapCategory[];
  checks: SitemapCheck[];
  /** Human-readable issues, most important first. */
  issues: string[];

  robotsAvailable: boolean;
  sitemapDeclaredInRobots: boolean;
  indexingEnabled: boolean;
  googleVerificationConfigured: boolean;
}

/* ── Category classification ───────────────────────────────────────────────
   Derived from the URL PATH, so app/sitemap.ts stays untouched. If a new
   section is added there, its URLs land in "Other pages" rather than being
   silently miscounted. */
const CATEGORY_RULES: Array<{ category: string; test: (path: string) => boolean }> = [
  { category: 'Jobs', test: (p) => p.startsWith('/jobs/') },
  { category: 'Businesses', test: (p) => p.startsWith('/businesses/') },
  { category: 'Blog', test: (p) => p.startsWith('/blog/') },
  { category: 'Gigs', test: (p) => p.startsWith('/gigs/') },
  { category: 'Marketplace', test: (p) => p.startsWith('/template-marketplace/') },
  { category: 'Talent', test: (p) => p.startsWith('/talent/') },
  { category: 'Published files', test: (p) => p.startsWith('/published/') },
  { category: 'Certificates', test: (p) => p.startsWith('/certificate/') },
  { category: 'Virtual IDs', test: (p) => p.startsWith('/id/') },
  { category: 'Docrudians rooms', test: (p) => p.startsWith('/docrudians/room/') },
];

/** Paths that must never appear in a public sitemap. */
const PRIVATE_PREFIXES = [
  '/api/', '/admin', '/super-admin', '/onboarding', '/settings', '/billing',
  '/workspace', '/hiring', '/e-sign', '/team', '/mail', '/scratchpad',
  '/ddrive', '/docword', '/docsheets', '/open/', '/profile/edit',
];

/**
 * Which origin to fetch, chosen by the SERVER.
 *
 * Only two are ever allowed: the configured canonical host, or a loopback host
 * (so the panel is usable in local development). Anything else — including
 * anything a caller could put in a header — falls back to the canonical host.
 */
export function resolveSelfOrigin(request: NextRequest): string {
  const canonical = getPublicAppBaseUrl();
  let candidate = '';
  try {
    /* `request.url` is the URL the server is actually serving, not a header the
       client chose to send. */
    candidate = new URL(request.url).origin;
  } catch {
    return canonical;
  }

  if (candidate === canonical) return candidate;

  try {
    const { hostname, protocol } = new URL(candidate);
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (loopback && (protocol === 'http:' || protocol === 'https:')) return candidate;
  } catch { /* fall through */ }

  return canonical;
}

async function fetchText(url: string, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'user-agent': 'Docrud-SitemapHealth/1.0' },
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body,
      ms: Date.now() - started,
      date: res.headers.get('date'),
      age: res.headers.get('age'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract <loc> values using a real XML parse. Returns null if XML is invalid. */
function parseSitemapUrls(xml: string): { urls: string[]; isIndex: boolean } | null {
  let parseFailed = false;
  const parser = new DOMParser({
    /* xmldom reports recoverable problems here instead of throwing, so a
       document with a broken tag must be recorded as invalid rather than
       parsed into an empty-but-fine sitemap. A `fatalError` additionally
       throws, which the try/catch below turns into the same answer. */
    onError: (level) => { if (level !== 'warning') parseFailed = true; },
  });

  let doc: Document;
  try {
    doc = parser.parseFromString(xml, 'text/xml') as unknown as Document;
  } catch {
    return null;
  }
  if (parseFailed || !doc || !doc.documentElement) return null;

  const root = doc.documentElement.nodeName.toLowerCase();
  if (root !== 'urlset' && root !== 'sitemapindex') return null;

  const locs = doc.getElementsByTagName('loc');
  const urls: string[] = [];
  for (let i = 0; i < locs.length; i += 1) {
    const value = (locs[i].textContent || '').trim();
    if (value) urls.push(value);
  }
  return { urls, isIndex: root === 'sitemapindex' };
}

export interface ValidateOptions {
  /** Server-resolved origin to fetch. Never accepted from a request body. */
  origin: string;
}

export async function validateSitemap({ origin }: ValidateOptions): Promise<SitemapHealthReport> {
  const canonicalHost = getPublicAppBaseUrl();
  const sitemapUrl = `${origin}/sitemap.xml`;
  const robotsUrl = `${origin}/robots.txt`;

  const settings = await getSeoSettings().catch(() => null);
  const indexingEnabled = settings ? !settings.noindex : true;
  const googleVerificationConfigured = Boolean(settings?.googleSiteVerification?.trim());

  const checks: SitemapCheck[] = [];
  const issues: string[] = [];
  const add = (id: string, label: string, status: SitemapCheckStatus, detail?: string) => {
    checks.push({ id, label, status, detail });
    if (status === 'fail' || status === 'warn') issues.push(detail || label);
  };

  const base: SitemapHealthReport = {
    status: 'error',
    checkedAt: new Date().toISOString(),
    sitemapUrl: `${canonicalHost}/sitemap.xml`,
    robotsUrl: `${canonicalHost}/robots.txt`,
    canonicalHost,
    responseMs: null,
    lastGenerated: null,
    totalUrls: null,
    duplicateUrls: null,
    invalidUrls: null,
    localhostUrls: null,
    nonCanonicalHostUrls: null,
    robotsConflicts: null,
    privateUrls: null,
    schemeMismatches: null,
    wwwVariantUrls: null,
    breakdown: [],
    checks,
    issues,
    robotsAvailable: false,
    sitemapDeclaredInRobots: false,
    indexingEnabled,
    googleVerificationConfigured,
  };

  /* ── 1. Fetch the sitemap ── */
  let sitemapRes: Awaited<ReturnType<typeof fetchText>> | null = null;
  try {
    sitemapRes = await fetchText(sitemapUrl);
  } catch (err) {
    add('reachable', 'Sitemap is reachable', 'fail',
      err instanceof Error && err.name === 'AbortError'
        ? 'The sitemap request timed out.'
        : 'The sitemap could not be fetched.');
    return { ...base, status: 'error' };
  }

  base.responseMs = sitemapRes.ms;
  base.lastGenerated = sitemapRes.date;

  if (!sitemapRes.ok) {
    add('reachable', 'Sitemap is reachable', 'fail',
      `The sitemap returned HTTP ${sitemapRes.status}.`);
    return { ...base, status: 'error' };
  }
  add('reachable', 'Sitemap is reachable', 'pass');

  /* ── 2. Valid XML ── */
  const parsed = parseSitemapUrls(sitemapRes.body);
  if (!parsed) {
    add('xml', 'Sitemap is valid XML', 'fail',
      'The sitemap is not well-formed XML, or is missing a <urlset> root.');
    return { ...base, status: 'error' };
  }
  add('xml', 'Sitemap is valid XML', 'pass');

  const urls = parsed.urls;
  base.totalUrls = urls.length;

  if (urls.length === 0) {
    add('non-empty', 'Sitemap contains URLs', 'fail', 'The sitemap contains no URLs.');
    return { ...base, status: 'error' };
  }
  add('non-empty', 'Sitemap contains URLs', 'pass');

  /* ── 3. Per-URL analysis ── */
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  let invalid = 0;
  let localhost = 0;
  let nonCanonical = 0;
  let schemeMismatch = 0;
  let wwwVariant = 0;
  let privateUrls = 0;
  const paths: string[] = [];

  const canonicalUrl = (() => { try { return new URL(canonicalHost); } catch { return null; } })();

  for (const raw of urls) {
    if (seen.has(raw)) duplicates.add(raw);
    seen.add(raw);

    let u: URL;
    try { u = new URL(raw); } catch { invalid += 1; continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { invalid += 1; continue; }

    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) localhost += 1;

    if (canonicalUrl) {
      if (host !== canonicalUrl.hostname.toLowerCase()) {
        nonCanonical += 1;
        /* A www/non-www split of the SAME domain is the specific mistake that
           silently halves a site's crawl budget, so it is counted separately. */
        const stripped = host.replace(/^www\./, '');
        if (stripped === canonicalUrl.hostname.toLowerCase().replace(/^www\./, '')) {
          wwwVariant += 1;
        }
      }
      if (u.protocol !== canonicalUrl.protocol) schemeMismatch += 1;
    }

    paths.push(u.pathname);
    if (PRIVATE_PREFIXES.some((p) => u.pathname === p || u.pathname.startsWith(p))) {
      privateUrls += 1;
    }
  }

  base.duplicateUrls = duplicates.size;
  base.invalidUrls = invalid;
  base.localhostUrls = localhost;
  base.nonCanonicalHostUrls = nonCanonical;
  base.schemeMismatches = schemeMismatch;
  base.wwwVariantUrls = wwwVariant;
  base.privateUrls = privateUrls;

  add('duplicates', 'No duplicate URLs', duplicates.size === 0 ? 'pass' : 'warn',
    duplicates.size ? `${duplicates.size} duplicate URL(s) in the sitemap.` : undefined);
  add('valid-urls', 'All URLs are valid absolute URLs', invalid === 0 ? 'pass' : 'fail',
    invalid ? `${invalid} malformed URL(s).` : undefined);
  add('localhost', 'No development hosts', localhost === 0 ? 'pass' : 'fail',
    localhost ? `${localhost} URL(s) point at a local development host.` : undefined);
  add('canonical-host', 'All URLs use the canonical host', nonCanonical === 0 ? 'pass' : 'fail',
    nonCanonical
      ? `${nonCanonical} URL(s) do not use ${canonicalHost}`
        + (wwwVariant ? ` (${wwwVariant} are www/non-www variants).` : '.')
      : undefined);
  add('scheme', 'HTTP/HTTPS is consistent', schemeMismatch === 0 ? 'pass' : 'fail',
    schemeMismatch ? `${schemeMismatch} URL(s) use a different scheme to the canonical host.` : undefined);
  add('private', 'No private or admin URLs', privateUrls === 0 ? 'pass' : 'fail',
    privateUrls ? `${privateUrls} private/admin URL(s) are exposed in the sitemap.` : undefined);

  /* ── 4. Category breakdown ── */
  const counts = new Map<string, string[]>();
  for (const p of paths) {
    const rule = CATEGORY_RULES.find((r) => r.test(p));
    const key = rule ? rule.category : (p === '/' || p.split('/').length === 2 ? 'Core pages' : 'Other pages');
    const list = counts.get(key) ?? [];
    list.push(p);
    counts.set(key, list);
  }
  base.breakdown = Array.from(counts.entries())
    .map(([category, list]) => ({ category, count: list.length, sample: list.slice(0, 25) }))
    .sort((a, b) => b.count - a.count);

  /* ── 5. robots.txt ── */
  let robotsBody = '';
  try {
    const robotsRes = await fetchText(robotsUrl, 10_000);
    if (robotsRes.ok) { robotsBody = robotsRes.body; base.robotsAvailable = true; }
  } catch { /* handled below */ }

  if (!base.robotsAvailable) {
    add('robots-available', 'robots.txt is available', 'fail', 'robots.txt could not be fetched.');
    base.robotsConflicts = null;
  } else {
    add('robots-available', 'robots.txt is available', 'pass');

    const declared = /^\s*sitemap:\s*(\S+)/im.exec(robotsBody);
    base.sitemapDeclaredInRobots = Boolean(declared);
    add('robots-sitemap', 'robots.txt declares the sitemap',
      declared ? 'pass' : 'warn',
      declared ? undefined : 'robots.txt does not declare a Sitemap: line.');

    if (declared && canonicalUrl) {
      const declaredUrl = declared[1].trim();
      let sameHost = false;
      try { sameHost = new URL(declaredUrl).hostname.toLowerCase() === canonicalUrl.hostname.toLowerCase(); }
      catch { sameHost = false; }
      add('robots-sitemap-host', 'The declared sitemap uses the canonical host',
        sameHost ? 'pass' : 'warn',
        sameHost ? undefined : 'robots.txt declares a sitemap on a different host.');
    }

    /* Reuses the repo's existing robots parser (Allow/Disallow, longest match)
       rather than a second, subtly different interpretation. */
    const robots = parseRobots(robotsBody, '*');
    const blocked = paths.filter((p) => !robots.allows(p));
    base.robotsConflicts = blocked.length;
    add('robots-conflicts', 'No sitemap URL is blocked by robots.txt',
      blocked.length === 0 ? 'pass' : 'fail',
      blocked.length
        ? `${blocked.length} sitemap URL(s) are disallowed by robots.txt `
          + `(e.g. ${blocked.slice(0, 3).join(', ')}).`
        : undefined);
  }

  /* ── 6. Configuration ── */
  add('canonical-config', 'Canonical host is configured',
    canonicalUrl ? 'pass' : 'fail',
    canonicalUrl ? undefined : 'NEXT_PUBLIC_APP_URL is not a valid URL.');

  /* A sitemap advertising pages while the site sends noindex is a real
     contradiction, and one an admin will not spot on their own. */
  add('indexing', 'Search indexing is enabled', indexingEnabled ? 'pass' : 'fail',
    indexingEnabled
      ? undefined
      : 'Search engine indexing is disabled in the SEO Manager while the sitemap '
        + 'still advertises these URLs — a configuration conflict.');

  /* ── 7. Overall status ── */
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  base.status = failed > 0 ? 'error' : warned > 0 ? 'warning' : 'healthy';

  return base;
}
