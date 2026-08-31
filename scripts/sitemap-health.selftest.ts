/**
 * Sitemap Health self-test.
 *
 * The validator's whole purpose is to tell an admin the truth about the
 * sitemap, so the failures worth catching are the ones where it would report
 * "Healthy" over a real problem: malformed XML parsed leniently into an empty
 * list, a www/non-www split counted as fine, a robots rule that silently blocks
 * every URL being advertised.
 *
 * `fetch` is stubbed so each case can present an exact sitemap and robots.txt.
 * That means these tests exercise the real parsing, classification, robots
 * matching and status logic — everything except the network itself.
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { validateSitemap, resolveSelfOrigin } from '@/lib/server/sitemap-health';
import { invalidateSeoSettings } from '@/lib/server/seo-settings';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const API = read('app/api/super-admin/seo/sitemap/route.ts');
const UI = read('components/superadmin/SitemapHealth.tsx');
const TAB = read('components/superadmin/SeoTab.tsx');
const SERVICE = read('lib/server/sitemap-health.ts');
const SITEMAP = read('app/sitemap.ts');
const ROBOTS_SRC = read('app/robots.ts');

const HOST = 'https://www.docrud.com';
const SEO_FILE = path.join(process.cwd(), 'data', 'seo-settings.json');
let seoBackup: string | null = null;

/* ── Fixtures ─────────────────────────────────────────────────────────── */

function xml(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
}

const GOOD_ROBOTS = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

Sitemap: ${HOST}/sitemap.xml
Host: ${HOST}`;

const realFetch = globalThis.fetch;

/** Serve a fixed sitemap and robots.txt to the validator. */
function stubFetch(opts: {
  sitemap?: string; sitemapStatus?: number; sitemapThrows?: boolean;
  contentType?: string;
  robots?: string | null; robotsStatus?: number;
}) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/sitemap.xml')) {
      if (opts.sitemapThrows) throw new Error('connection refused');
      return new Response(opts.sitemap ?? '', {
        status: opts.sitemapStatus ?? 200,
        headers: {
          date: new Date().toUTCString(),
          /* The real route serves application/xml; without this the stub would
             fail the content-type check for reasons that have nothing to do
             with the sitemap under test. */
          'content-type': opts.contentType ?? 'application/xml',
        },
      });
    }
    if (url.endsWith('/robots.txt')) {
      if (opts.robots === null) return new Response('', { status: 404 });
      return new Response(opts.robots ?? GOOD_ROBOTS, { status: opts.robotsStatus ?? 200 });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

const run = () => validateSitemap({ origin: HOST });

function fakeReq(url: string) {
  return { url } as unknown as import('next/server').NextRequest;
}

async function main() {
  /* Force local-file storage and a known SEO settings state. */
  delete process.env.MONGODB_URI;
  process.env.NEXT_PUBLIC_APP_URL = HOST;
  if (existsSync(SEO_FILE)) seoBackup = read('data/seo-settings.json');

  console.log('\n── 1. A healthy sitemap ──');

  stubFetch({ sitemap: xml([`${HOST}/`, `${HOST}/jobs/a`, `${HOST}/blog/b`]) });
  let r = await run();
  check('a valid sitemap is healthy', r.status === 'healthy', r.status + ' | ' + r.issues.join('; '));
  check('the URL count is real', r.totalUrls === 3, String(r.totalUrls));
  check('no duplicates are reported', r.duplicateUrls === 0);
  check('no invalid URLs are reported', r.invalidUrls === 0);
  check('no robots conflicts are reported', r.robotsConflicts === 0);
  check('robots.txt is detected as available', r.robotsAvailable);
  check('the sitemap declaration is detected', r.sitemapDeclaredInRobots);
  check('a response time is measured', typeof r.responseMs === 'number');
  check('no issues are listed', r.issues.length === 0, r.issues.join('; '));

  console.log('\n── 2. Broken sitemaps ──');

  stubFetch({ sitemap: '<?xml version="1.0"?><urlset><url><loc>x</loc></urlset>' });
  r = await run();
  check('malformed XML is an error', r.status === 'error');
  check('malformed XML is not silently counted as zero URLs',
    r.totalUrls === null, String(r.totalUrls));
  check('the XML check fails',
    r.checks.find((c) => c.id === 'xml')?.status === 'fail');

  stubFetch({ sitemap: '<html><body>not a sitemap</body></html>' });
  r = await run();
  check('a non-sitemap document is an error', r.status === 'error');

  stubFetch({ sitemap: xml([]) });
  r = await run();
  check('an empty sitemap is an error', r.status === 'error');
  check('an empty sitemap reports zero URLs, not null', r.totalUrls === 0);

  stubFetch({ sitemap: '', sitemapStatus: 500 });
  r = await run();
  check('an HTTP 500 sitemap is an error', r.status === 'error');
  check('the reachability check fails',
    r.checks.find((c) => c.id === 'reachable')?.status === 'fail');
  check('counts are unavailable, not zero', r.totalUrls === null && r.duplicateUrls === null);

  stubFetch({ sitemapThrows: true });
  r = await run();
  /* "Could not reach production" is not the same as "production is broken". */
  check('an unreachable sitemap is UNAVAILABLE, not error', r.status === 'unavailable', r.status);
  check('an unreachable sitemap reports no fabricated metrics',
    r.totalUrls === null && r.robotsConflicts === null);
  check('an unreachable sitemap reports no HTTP status', r.httpStatus === null);

  console.log('\n── 3. URL defects ──');

  stubFetch({ sitemap: xml([`${HOST}/a`, `${HOST}/a`, `${HOST}/b`]) });
  r = await run();
  check('a duplicate URL is detected', r.duplicateUrls === 1, String(r.duplicateUrls));
  check('duplicates are a warning, not an error', r.status === 'warning', r.status);

  stubFetch({ sitemap: xml([`${HOST}/a`, 'not-a-url', 'ftp://x/y']) });
  r = await run();
  check('malformed URLs are counted', r.invalidUrls === 2, String(r.invalidUrls));
  check('malformed URLs are an error', r.status === 'error');

  stubFetch({ sitemap: xml([`${HOST}/a`, 'http://localhost:3000/b']) });
  r = await run();
  check('a localhost URL is detected', r.localhostUrls === 1);
  check('a localhost URL is an error', r.status === 'error');

  stubFetch({ sitemap: xml([`${HOST}/a`, 'https://docrud.com/b']) });
  r = await run();
  check('a non-canonical host is detected', r.nonCanonicalHostUrls === 1);
  /* The specific mistake that halves crawl budget. */
  check('a www/non-www variant is identified as such', r.wwwVariantUrls === 1);
  check('a host mismatch is an error', r.status === 'error');

  stubFetch({ sitemap: xml([`${HOST}/a`, 'http://www.docrud.com/b']) });
  r = await run();
  check('an http/https mismatch is detected', r.schemeMismatches === 1, String(r.schemeMismatches));
  check('a scheme mismatch is an error', r.status === 'error');

  stubFetch({ sitemap: xml([`${HOST}/a`, `${HOST}/admin`, `${HOST}/api/users`]) });
  r = await run();
  check('private and admin URLs are detected', r.privateUrls === 2, String(r.privateUrls));
  check('private URLs are an error', r.status === 'error');

  console.log('\n── 4. robots.txt ──');

  stubFetch({ sitemap: xml([`${HOST}/a`]), robots: null });
  r = await run();
  check('a missing robots.txt is an error', r.status === 'error');
  check('robots conflicts are unavailable when robots.txt cannot be read',
    r.robotsConflicts === null);
  check('robots availability is reported false', !r.robotsAvailable);

  stubFetch({
    sitemap: xml([`${HOST}/a`]),
    robots: 'User-agent: *\nAllow: /',
  });
  r = await run();
  check('a missing sitemap declaration is a warning', r.status === 'warning');
  check('the declaration is reported missing', !r.sitemapDeclaredInRobots);

  /* The high-value check: robots forbidding a URL the sitemap advertises is
     exactly Search Console's "Submitted URL blocked by robots.txt". */
  stubFetch({
    sitemap: xml([`${HOST}/`, `${HOST}/docword`, `${HOST}/forms/builder`]),
    robots: `User-agent: *\nAllow: /\nDisallow: /docword\nDisallow: /forms/builder\n\nSitemap: ${HOST}/sitemap.xml`,
  });
  r = await run();
  check('URLs blocked by robots.txt are detected', r.robotsConflicts === 2, String(r.robotsConflicts));
  check('a robots conflict is an error', r.status === 'error');
  check('the conflict names the offending paths',
    r.issues.some((i) => i.includes('/docword')));

  stubFetch({
    sitemap: xml([`${HOST}/`]),
    robots: `User-agent: *\nAllow: /\n\nSitemap: https://elsewhere.example.com/sitemap.xml`,
  });
  r = await run();
  check('a sitemap declared on another host is a warning', r.status === 'warning');

  console.log('\n── 4b. Sitemap index, limits and transport facts ──');

  const child = (n: number, prefix: string) =>
    xml(Array.from({ length: n }, (_, i) => `${HOST}${prefix}${i}`));

  /* A <sitemapindex> lists sitemaps, not pages. Counting its children as URLs
     would report "3 URLs" for a site with thousands. */
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const h = { 'content-type': 'application/xml' };
    if (url.endsWith('/sitemap.xml')) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>${HOST}/sitemap-jobs.xml</loc></sitemap>
<sitemap><loc>${HOST}/sitemap-blog.xml</loc></sitemap>
</sitemapindex>`, { status: 200, headers: h });
    }
    if (url.endsWith('/sitemap-jobs.xml')) return new Response(child(5, '/jobs/'), { status: 200, headers: h });
    if (url.endsWith('/sitemap-blog.xml')) return new Response(child(3, '/blog/'), { status: 200, headers: h });
    if (url.endsWith('/robots.txt')) return new Response(GOOD_ROBOTS, { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  r = await run();
  check('a sitemap index aggregates its children', r.totalUrls === 8, String(r.totalUrls));
  check('the child sitemaps are listed', r.childSitemaps.length === 2);
  check('each child reports its own URL count',
    r.childSitemaps.every((c) => c.ok && typeof c.urls === 'number'));
  check('the sitemap count includes the index itself', r.sitemapCount === 3, String(r.sitemapCount));
  check('an index of valid children is healthy', r.status === 'healthy', r.issues.join('; '));
  check('children are classified like any other URL',
    (r.breakdown.find((b) => b.category === 'Jobs')?.count ?? 0) === 5);

  /* A child that cannot be read must not be silently dropped. */
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const h = { 'content-type': 'application/xml' };
    if (url.endsWith('/sitemap.xml')) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>${HOST}/sitemap-broken.xml</loc></sitemap>
</sitemapindex>`, { status: 200, headers: h });
    }
    if (url.endsWith('/sitemap-broken.xml')) return new Response('', { status: 500 });
    if (url.endsWith('/robots.txt')) return new Response(GOOD_ROBOTS, { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  r = await run();
  check('an unreadable child sitemap is an error', r.status === 'error');
  check('the failing child is reported', r.childSitemaps.some((c) => !c.ok));

  console.log('\n── 4c. Transport facts and honesty about limits ──');

  stubFetch({ sitemap: xml([`${HOST}/a`]) });
  r = await run();
  check('the HTTP status is surfaced', r.httpStatus === 200, String(r.httpStatus));
  check('the content type is surfaced', String(r.contentType).includes('xml'));
  check('xmlValid is reported', r.xmlValid === true);
  check('robots timing is measured', typeof r.robotsResponseMs === 'number');
  check('the robots HTTP status is surfaced', r.robotsHttpStatus === 200);
  check('the declared sitemap reference is returned',
    r.robotsSitemapReference === `${HOST}/sitemap.xml`);
  check('a normal sitemap is not marked limited', r.validationLimited === false);

  /* HTTP 200 alone is not proof: a rewritten route serves HTML happily. */
  stubFetch({ sitemap: xml([`${HOST}/a`]), contentType: 'text/html; charset=utf-8' });
  r = await run();
  check('a 200 served as HTML is not accepted as a sitemap', r.status === 'error');
  check('the content-type problem is named',
    r.issues.some((i) => i.includes('not XML')));

  stubFetch({ sitemap: xml([`${HOST}/a`, 'http://www.docrud.com/b']) });
  r = await run();
  check('plain-http URLs are counted separately', r.httpUrls === 1, String(r.httpUrls));
  check('a plain-http URL is an error', r.status === 'error');

  /* A document that is well-formed XML with the right root but the wrong
     namespace is not a sitemap. */
  stubFetch({ sitemap: '<?xml version="1.0"?><urlset xmlns="http://example.com/other"><url><loc>x</loc></url></urlset>' });
  r = await run();
  check('a wrong namespace is rejected', r.status === 'error' && r.xmlValid === false);

  console.log('\n── 5. Category breakdown ──');

  stubFetch({
    sitemap: xml([
      `${HOST}/`, `${HOST}/pricing`,
      `${HOST}/jobs/1`, `${HOST}/jobs/2`, `${HOST}/jobs/3`,
      `${HOST}/businesses/x`, `${HOST}/blog/y`,
      `${HOST}/template-marketplace/z`,
    ]),
  });
  r = await run();
  const cat = (name: string) => r.breakdown.find((b) => b.category === name)?.count ?? 0;
  check('jobs are counted', cat('Jobs') === 3, String(cat('Jobs')));
  check('businesses are counted', cat('Businesses') === 1);
  check('blog posts are counted', cat('Blog') === 1);
  check('marketplace items are counted', cat('Marketplace') === 1);
  check('core pages are counted', cat('Core pages') === 2, String(cat('Core pages')));
  check('the breakdown totals the URL count',
    r.breakdown.reduce((n, b) => n + b.count, 0) === r.totalUrls);
  check('categories are ordered by size',
    r.breakdown[0].count >= r.breakdown[r.breakdown.length - 1].count);
  check('each category carries real sample URLs',
    (r.breakdown.find((b) => b.category === 'Jobs')?.sample ?? []).every((p) => p.startsWith('/jobs/')));

  console.log('\n── 6. Indexing conflict ──');

  writeFileSync(SEO_FILE, JSON.stringify({ noindex: true }));
  invalidateSeoSettings();
  stubFetch({ sitemap: xml([`${HOST}/a`]) });
  r = await run();
  check('noindex is reflected in the report', !r.indexingEnabled);
  check('noindex with a live sitemap is an error', r.status === 'error');
  check('the conflict is described in words',
    r.issues.some((i) => i.includes('configuration conflict')));

  writeFileSync(SEO_FILE, JSON.stringify({ noindex: false, googleSiteVerification: 'abc' }));
  invalidateSeoSettings();
  r = await run();
  check('indexing enabled clears the conflict', r.indexingEnabled && r.status === 'healthy');
  check('the verification state is reported', r.googleVerificationConfigured);

  if (seoBackup !== null) writeFileSync(SEO_FILE, seoBackup);
  else if (existsSync(SEO_FILE)) unlinkSync(SEO_FILE);
  invalidateSeoSettings();

  console.log('\n── 7. SSRF guard ──');

  check('the canonical host is allowed',
    resolveSelfOrigin(fakeReq(`${HOST}/api/x`)) === HOST);
  check('localhost is allowed for development',
    resolveSelfOrigin(fakeReq('http://localhost:3000/api/x')) === 'http://localhost:3000');
  /* Everything else must fall back rather than be fetched. */
  for (const bad of [
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/admin',
    'https://evil.example.com/x',
    'http://metadata.google.internal/',
  ]) {
    check(`refuses to target ${bad.slice(0, 38)}`,
      resolveSelfOrigin(fakeReq(bad)) === HOST);
  }
  check('an unparseable request URL falls back to the canonical host',
    resolveSelfOrigin(fakeReq('not a url')) === HOST);
  check('no URL is read from the request body',
    !API.includes('req.json()') && !API.includes('searchParams'));
  check('the service takes a server-resolved origin only',
    SERVICE.includes('export function resolveSelfOrigin'));
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('the client-trusting origin helper is never imported or called',
    !stripComments(SERVICE).includes('getOriginForRequest')
    && !stripComments(API).includes('getOriginForRequest'));

  console.log('\n── 7b. Production vs local is never blurred ──');

  stubFetch({ sitemap: xml([`${HOST}/a`]) });
  r = await run();
  check('a check against the canonical host is a production check',
    r.isProductionCheck === true && r.checkedOrigin === HOST);

  /* The trap: validating localhost and displaying the production URL beside a
     green verdict. */
  const local = await validateSitemap({ origin: 'http://localhost:3000' });
  check('a check against localhost is NOT a production check', local.isProductionCheck === false);
  check('the report states which origin was actually fetched',
    local.checkedOrigin === 'http://localhost:3000');
  check('the displayed sitemap URL remains the production one',
    local.sitemapUrl === `${HOST}/sitemap.xml`);
  check('a non-production check is called out in the results',
    local.issues.some((i) => i.includes('not ' + HOST)), local.issues.join('; '));
  check('a non-production check cannot be reported as healthy',
    local.status !== 'healthy', local.status);
  check('the UI warns when the check was not against production',
    UI.includes('report.isProductionCheck') && UI.includes('not production'));

  console.log('\n── 8. API access control ──');

  check('both verbs are guarded',
    (API.match(/const fail = await guard\(req\);/g) ?? []).length === 2);
  check('the shared super-admin session guard is used',
    API.includes('getSuperAdminSessionFromRequest'));
  check('unauthenticated callers get 401', API.includes("{ error: 'Unauthorized' }, { status: 401 }"));
  check('no role is trusted from the request', !/body\.(role|isAdmin|userId)/.test(API));
  check('internal errors are logged, not returned',
    API.includes('console.error') && API.includes("'Sitemap validation failed.'"));
  check('no secret is referenced by the API',
    !/MONGODB_URI|NEXTAUTH_SECRET|SMTP_PASSWORD|GROQ_API_KEY|RAZORPAY|CRON_SECRET/.test(API));
  check('no secret is referenced by the service',
    !/MONGODB_URI|NEXTAUTH_SECRET|SMTP_PASSWORD|GROQ_API_KEY|RAZORPAY|CRON_SECRET/.test(SERVICE));

  console.log('\n── 9. Performance and caching ──');

  /* Validation on GET would mean every SEO Manager open fetches the sitemap. */
  check('GET performs no validation',
    !API.slice(API.indexOf('export async function GET'), API.indexOf('export async function POST'))
      .includes('validateSitemap'));
  check('validation happens only on POST',
    API.slice(API.indexOf('export async function POST')).includes('validateSitemap'));
  check('the UI validates only on click, never on mount',
    UI.includes('useEffect(() => { void load(); }, [load]);') && !UI.includes('void validate()], ['));
  check('the UI has no polling loop',
    !UI.includes('setInterval') && !UI.includes('setTimeout(() => void validate'));
  check('duplicate validations are prevented', UI.includes('if (validating) return;'));
  /* The sitemap's own caching must survive this feature. */
  check('sitemap revalidation is untouched',
    SITEMAP.includes('export const revalidate = 3600')
    && !/export const dynamic\s*=\s*'force-dynamic'/.test(SITEMAP));
  check('sitemap generation was not modified',
    SITEMAP.includes('export default async function sitemap'));
  check('robots generation was not modified', ROBOTS_SRC.includes('export default function robots'));
  check('the validator does not re-run sitemap generation',
    !SERVICE.includes("from '@/app/sitemap'"));
  check('it reuses the existing robots parser',
    SERVICE.includes("from '@/lib/server/job-scraper/robots'"));
  check('it reuses the existing canonical URL helper', SERVICE.includes('getPublicAppBaseUrl'));

  console.log('\n── 10. UI honesty and layout ──');

  check('an unmeasurable metric renders as Not available',
    UI.includes("'Not available'") && UI.includes('function metric'));
  check('metric() does not turn null into zero',
    UI.includes('value === null || value === undefined ? \'Not available\''));
  check('status is conveyed in words, not colour alone',
    UI.includes("word: 'Healthy'") && UI.includes("word: 'Warning'") && UI.includes("word: 'Error'"));
  check('check results carry screen-reader status text',
    UI.includes('className="sr-only"') && UI.includes("'Passed:'"));
  check('the panel never claims Google has indexed anything',
    UI.includes('It cannot tell whether Google has fetched or indexed')
    && !/indexed by Google/i.test(UI.replace(/has fetched or indexed[^<]*/g, '')));
  check('the indexing conflict is surfaced',
    UI.includes('configuration conflict detected'));
  check('validate, open sitemap, open robots and copy are all present',
    UI.includes('Validate sitemap') && UI.includes('Open sitemap')
    && UI.includes('Open robots.txt') && UI.includes('Copy sitemap URL'));
  check('copy feedback is shown', UI.includes('✓ Sitemap URL copied'));
  check('the buttons use server-provided URLs, not hardcoded ones',
    !UI.includes('href="https://www.docrud.com/sitemap.xml"')
    && UI.includes('href={sitemapUrl}'));
  check('loading and error states exist',
    UI.includes('Loading sitemap status…') && UI.includes('role="alert"'));
  check('progress is announced', UI.includes('aria-live="polite"'));
  check('the breakdown is expandable', UI.includes('aria-expanded={open}') && UI.includes('View URLs'));

  /* Layout assertions: the failure they guard is a wide table or a long URL
     forcing the whole page to scroll sideways. */
  check('long URLs wrap instead of widening the layout',
    (UI.match(/break-all/g) ?? []).length >= 4);
  check('the history table scrolls inside its own box',
    UI.includes('overflow-x-auto'));
  check('grid children can shrink below their content width',
    (UI.match(/min-w-0/g) ?? []).length >= 4);
  check('stats and cards reflow across breakpoints',
    /grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-\d/.test(UI)
    && UI.includes('grid gap-3 lg:grid-cols-2'));
  check('action buttons wrap rather than overflow',
    UI.includes('flex flex-wrap items-center gap-2') || UI.includes('flex flex-wrap gap-2'));

  console.log('\n── 10b. The new facts reach the UI ──');

  check('the HTTP status is displayed', UI.includes('HTTP status'));
  check('XML validity is displayed', UI.includes('report.xmlValid ?'));
  check('non-HTTPS URLs are displayed', UI.includes("label=\"Non-HTTPS URLs\""));
  check('robots timing and status are displayed',
    UI.includes('robots.txt response') && UI.includes('report.robotsResponseMs'));
  check('the declared sitemap reference is displayed',
    UI.includes('report.robotsSitemapReference'));
  check('child sitemaps are listed only when there are any',
    UI.includes('report.childSitemaps.length > 0') && UI.includes('Sitemap index'));
  check('an unreadable child is shown as unreadable', UI.includes("'Unreadable'"));
  /* The honesty requirement for partial checks. */
  check('a limited validation is stated, not implied complete',
    UI.includes('report?.validationLimited') && UI.includes('do not cover the whole sitemap'));
  check('the unavailable state has its own wording',
    UI.includes("word: 'Unavailable'") && UI.includes('not the same as the sitemap being broken'));
  check('validation runs once when the section opens',
    UI.includes('setAutoChecked(true)') && UI.includes('void validate();'));
  check('it still does not poll', !UI.includes('setInterval'));
  check('duplicate validations are still prevented', UI.includes('if (validating) return;'));

  console.log('\n── 11. Integration with the existing SEO Manager ──');

  check('the section is mounted in the SEO Manager',
    TAB.includes('<SitemapHealth />') && TAB.includes("title=\"Sitemap health\""));
  check('it is collapsed by default so the tab stays compact',
    TAB.includes('<Section title="Sitemap health" defaultOpen={false}>'));
  check('the existing SEO Manager sections survive',
    TAB.includes('title="Global SEO"') && TAB.includes('title="Homepage SEO"')
    && TAB.includes('title="Social sharing"') && TAB.includes('title="Branding"'));
  check('the Search Console verification field is still editable',
    TAB.includes('id="seo-gsc"'));
  /* Persistence still goes through the shared settings module — now via the
     draft/publish pair rather than a direct save. */
  const SEO_API = read('app/api/super-admin/seo/route.ts');
  check('the SEO settings API still persists through the shared module',
    SEO_API.includes('getSeoSettings')
    && SEO_API.includes('saveSeoDraft') && SEO_API.includes('publishSeoDraft'));
  check('history reuses the existing audit log, not a new store',
    API.includes('appendSuperAdminAudit') && API.includes('getSuperAdminAuditLog')
    && !API.includes('writeJsonFile'));
  check('a failed audit write cannot fail the validation',
    API.includes('.catch(() => { /* history is a convenience'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main()
  .then(() => { globalThis.fetch = realFetch; })
  .catch((err) => {
    globalThis.fetch = realFetch;
    if (seoBackup !== null) writeFileSync(SEO_FILE, seoBackup);
    else if (existsSync(SEO_FILE)) unlinkSync(SEO_FILE);
    console.error(err);
    process.exit(1);
  });
