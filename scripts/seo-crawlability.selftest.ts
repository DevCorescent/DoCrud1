/**
 * SEO crawlability self-test.
 *
 * Guards the defect that made the site unindexable: the homepage is gated for
 * signed-out visitors in TWO places, and a crawler carries no cookie, so both
 * gates redirected every search engine to /onboarding — a page robots.txt
 * disallows. Google was redirected to a page it was forbidden to read, and the
 * listing said "No information is available for this page".
 *
 * These are source and pure-function assertions. The live behaviour (200 for
 * Googlebot, 307 for a browser) was verified against a running server; that
 * verification cannot live in CI without a server, so the invariants that
 * would let the bug come back are pinned here instead.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { isSearchCrawlerUserAgent } from '@/lib/search-crawler';
import { getPublicAppBaseUrl } from '@/lib/url';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const MIDDLEWARE = read('middleware.ts');
const HOME = read('app/page.tsx');
const SITEMAP = read('app/sitemap.ts');
const ROBOTS = read('app/robots.ts');

function main() {
  console.log('\n── 1. Crawler detection ──');

  const crawlers = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0)',
    'facebookexternalhit/1.1',
    'Twitterbot/1.0',
    'Mozilla/5.0 (compatible; DuckDuckBot/1.1)',
    'GPTBot/1.0',
    'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
  ];
  for (const ua of crawlers) {
    check(`recognised: ${ua.slice(0, 42)}`, isSearchCrawlerUserAgent(ua));
  }

  const humans = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0',
  ];
  for (const ua of humans) {
    check(`NOT treated as a crawler: ${ua.slice(0, 36)}`, !isSearchCrawlerUserAgent(ua));
  }
  check('a missing user-agent is not a crawler', !isSearchCrawlerUserAgent(null));
  check('an empty user-agent is not a crawler', !isSearchCrawlerUserAgent(''));
  check('detection is case-insensitive', isSearchCrawlerUserAgent('GOOGLEBOT/2.1'));

  console.log('\n── 2. BOTH homepage gates exempt crawlers ──');

  /* The bug the first time round was fixing only one of the two gates: the
     crawler cleared the middleware and was redirected by the page instead. */
  check('the middleware gate consults the shared predicate',
    MIDDLEWARE.includes('isSearchCrawlerUserAgent'));
  check('the middleware exempts crawlers from the homepage redirect',
    /!hasSession && !isGuest && !isSearchCrawlerUserAgent/.test(MIDDLEWARE));
  check('the page-level gate consults the same predicate',
    HOME.includes('isSearchCrawlerUserAgent'));
  check('the page exempts crawlers from its redirect',
    /!session && !isGuest && !isCrawler/.test(HOME));
  check('there is ONE definition of what a crawler is, not two',
    !MIDDLEWARE.includes('SEARCH_CRAWLER_RE') && !HOME.includes('SEARCH_CRAWLER_RE'));

  console.log('\n── 3. Nothing private was opened up ──');

  /* The exemption is scoped to `/` only. */
  check('the exemption applies to the homepage path alone',
    /pathname === '\/'[\s\S]{0,600}isSearchCrawlerUserAgent/.test(MIDDLEWARE));
  check('the email-verification gate is untouched by the exemption',
    MIDDLEWARE.includes('UNVERIFIED_ALLOWED_PREFIXES')
    && !/UNVERIFIED_ALLOWED_PREFIXES[\s\S]{0,400}isSearchCrawlerUserAgent/.test(MIDDLEWARE));
  check('the predicate is documented as a hint, not a security boundary',
    read('lib/search-crawler.ts').includes('NOT A SECURITY BOUNDARY'));

  console.log('\n── 4. Canonical host ──');

  const base = getPublicAppBaseUrl();
  check('the base URL is absolute https', /^https:\/\//.test(base), base);
  check('the base URL has no trailing slash', !base.endsWith('/'), base);
  check('the base URL is not localhost', !/localhost|127\.0\.0\.1/.test(base), base);
  /* docrud.com 307-redirects to www.docrud.com in production, so the www form
     is canonical; the non-www form made every sitemap URL a redirect. */
  check('the canonical host is the www form', base === 'https://www.docrud.com', base);

  console.log('\n── 5. Sitemap does not fight robots.txt ──');

  /* Listing a URL that robots forbids is the "Submitted URL blocked by
     robots.txt" error in Search Console. */
  for (const blocked of ['/docword', '/forms/builder', '/pdf-editor/workspace']) {
    check(`sitemap omits robots-disallowed ${blocked}`,
      !new RegExp(`path:\\s*'${blocked.replace(/\//g, '\\/')}'`).test(SITEMAP));
    check(`robots still disallows ${blocked}`, ROBOTS.includes(`'${blocked}'`));
  }
  check('the landing pages that are allowed are still listed',
    /path: '\/forms'/.test(SITEMAP) && /path: '\/pdf-editor'/.test(SITEMAP));

  console.log('\n── 6. Sitemap caching ──');

  /* `force-dynamic` pins revalidate to 0, so it silently defeated the hourly
     regeneration the adjacent comment promised — every request rebuilt the
     sitemap from ten data sources, measured at 12.8s. */
  check('force-dynamic no longer defeats revalidate',
    !/export const dynamic\s*=\s*'force-dynamic'/.test(SITEMAP));
  check('the sitemap still revalidates hourly', /export const revalidate = 3600/.test(SITEMAP));

  console.log('\n── 7. Robots declares the sitemap on the canonical host ──');

  check('robots points at the sitemap', ROBOTS.includes('${baseUrl}/sitemap.xml'));
  check('robots derives its host from the shared helper', ROBOTS.includes('getPublicAppBaseUrl'));
  for (const priv of ['/api/', '/admin', '/settings', '/billing', '/workspace', '/onboarding']) {
    check(`robots disallows ${priv}`, ROBOTS.includes(`'${priv}'`));
  }

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
