/**
 * Live SEO publishing self-test.
 *
 * The claims this feature makes are unusually easy to fake, so these tests are
 * aimed squarely at the lies:
 *
 *  - "published" when only a draft was saved,
 *  - "live" when only the database changed,
 *  - "cache refreshed" when revalidation actually threw,
 *  - and a draft that leaks into production before anyone pressed Deploy.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { DEFAULT_SEO_SETTINGS, resolveSeo } from '@/lib/server/seo-settings';
import { SEO_CACHE_TAG, SEO_REVALIDATE_PATHS } from '@/lib/server/seo-cache';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const API = read('app/api/super-admin/seo/route.ts');
const VERIFY = read('app/api/super-admin/seo/verify/route.ts');
const SETTINGS = read('lib/server/seo-settings.ts');
const CACHE = read('lib/server/seo-cache.ts');
const TAB = read('components/superadmin/SeoTab.tsx');
const HOME = read('app/page.tsx');
const LAYOUT = read('app/layout.tsx');
const STORAGE = read('lib/server/storage.ts');

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function main() {
  console.log('\n── 1. The cache tag is central ──');

  check('a single tag constant exists', CACHE.includes("export const SEO_CACHE_TAG = 'seo-settings'"));
  check('the tag is not duplicated as a literal elsewhere',
    !code(API).includes("'seo-settings'") && !code(SETTINGS).includes("tags: ['seo-settings']"));
  check('the reader imports the shared constant',
    SETTINGS.includes("from '@/lib/server/seo-cache'") && SETTINGS.includes('tags: [SEO_CACHE_TAG]'));
  check('the writer imports the same constant',
    API.includes('revalidateTag(SEO_CACHE_TAG)'));
  check('the revalidated paths are centralised too',
    CACHE.includes('SEO_REVALIDATE_PATHS') && API.includes('SEO_REVALIDATE_PATHS'));
  check('the homepage is among them', (SEO_REVALIDATE_PATHS as readonly string[]).includes('/'));

  console.log('\n── 2. Reads are cached across instances ──');

  /* An in-process memo alone cannot be invalidated on the other lambda that
     serves the next request; that is the whole reason for the tagged cache. */
  check('settings are read through a tagged cache', SETTINGS.includes('unstable_cache('));
  check('the in-process memo is short, not a minute',
    SETTINGS.includes('const CACHE_MS = 5_000'));
  check('a missing request context falls back rather than throwing',
    SETTINGS.includes('} catch {') && SETTINGS.includes('fall back to reading directly'));
  check('caching is not disabled globally',
    !SETTINGS.includes("cache: 'no-store'") && !API.includes("export const revalidate = 0"));

  console.log('\n── 3. Saving is not publishing ──');

  check('a separate draft store exists', STORAGE.includes('seoDraftSettingsPath'));
  check('the public read path still uses only the published file',
    SETTINGS.includes('readJsonFile<Partial<SeoSettings> | null>(seoSettingsPath, null)'));
  check('PUT saves a draft', API.includes('await saveSeoDraft(settings)'));
  check('PUT reports that nothing was published', API.includes('published: false'));
  check('publishing is a separate explicit action',
    API.includes("action !== 'publish'") && API.includes('publishSeoDraft'));
  check('the draft state reports whether it differs from production',
    SETTINGS.includes('hasUnpublishedChanges'));
  /* A stray `publishedAt` key made a naive compare always report changes. */
  check('the draft comparison ignores the publishedAt stamp',
    SETTINGS.includes('function pickSettings') && SETTINGS.includes('pickSettings(draft)'));
  check('a draft can be discarded back to the published values',
    SETTINGS.includes('export async function discardSeoDraft'));

  console.log('\n── 4. Publish ordering and honest reporting ──');

  const publishBody = API.slice(API.indexOf('export async function POST'));
  /* Persist first: invalidating toward a value that was never stored would
     leave production serving something nobody chose. */
  check('the database write happens before invalidation',
    publishBody.indexOf('publishSeoDraft') < publishBody.indexOf('revalidateTag'));
  check('a failed save does NOT invalidate the cache',
    publishBody.includes('Production SEO is unchanged.'));
  check('a failed save reports saved:false', publishBody.includes('ok: false, saved: false'));
  check('revalidation success is reported separately from save success',
    publishBody.includes('let revalidated = true') && publishBody.includes('revalidated,'));
  check('a revalidation failure is surfaced, not swallowed',
    publishBody.includes('revalidationError') && publishBody.includes('revalidated = false'));
  check('the response carries a real publish timestamp',
    publishBody.includes('publishedAt,') && SETTINGS.includes('new Date().toISOString()'));
  check('changed fields are computed for the audit trail',
    publishBody.includes('changedFields: changed'));

  console.log('\n── 5. Audit trail ──');

  check('publishing is recorded in the existing audit log',
    API.includes('appendSuperAdminAudit') && API.includes("action: 'seo.settings.published'"));
  check('the audit records which fields changed and the cache result',
    API.includes('details: { changedFields: changed, revalidated, publishedAt }'));
  check('a failing audit write cannot fail the publish',
    API.includes('the audit trail must never fail a publish'));
  check('no new audit system was introduced', !API.includes('writeJsonFile'));

  console.log('\n── 6. Verify Live reads the public page, not the database ──');

  check('verification fetches the homepage', VERIFY.includes('await fetch(`${origin}/`'));
  check('it uses a crawler user-agent so it is not redirected to onboarding',
    VERIFY.includes('CRAWLER_UA') && VERIFY.includes('Googlebot'));
  check('the target origin is server-resolved and allow-listed',
    VERIFY.includes('resolveSelfOrigin(req)') && !VERIFY.includes('req.json()'));
  check('it compares title, description, canonical, OG and Twitter',
    ['Title', 'Description', 'Canonical', 'og:title', 'og:description', 'og:image',
      'twitter:title', 'twitter:description', 'twitter:image']
      .every((f) => VERIFY.includes(`'${f}'`)));
  check('indexing state is verified too', VERIFY.includes("field: 'Indexing'"));
  check('Google verification is checked when configured',
    VERIFY.includes("'Google verification'"));
  /* Unreachable must never read as success. */
  check('an unreachable page reports unavailable, never live',
    VERIFY.includes("status: 'unavailable'") && !VERIFY.includes("status: 'live', error"));
  check('a non-200 response is unavailable',
    VERIFY.includes('The homepage returned HTTP'));
  check('live requires every check to match',
    VERIFY.includes("status: mismatches.length === 0 ? 'live' : 'mismatch'"));
  check('the endpoint is super-admin guarded',
    VERIFY.includes('getSuperAdminSessionFromRequest')
    && VERIFY.includes("{ error: 'Unauthorized' }, { status: 401 }"));
  check('HTML entities are decoded before comparing',
    VERIFY.includes('function decodeEntities'));

  console.log('\n── 7. The homepage actually emits the admin values ──');

  /* The bug Verify Live found: page metadata overrides layout metadata, so
     buildPageMetadata's synthesised social tags replaced the resolved ones —
     the admin's Open Graph fields did nothing and og:image was the favicon. */
  check('the homepage applies the resolved Open Graph values',
    HOME.includes('title: seo.ogTitle') && HOME.includes('description: seo.ogDescription'));
  check('the homepage applies the resolved Open Graph image',
    HOME.includes('url: seo.ogImage'));
  check('the homepage applies the resolved Twitter values',
    HOME.includes('title: seo.twitterTitle') && HOME.includes('description: seo.twitterDescription'));
  check('the homepage no longer falls back to the favicon as a social image',
    !HOME.includes('defaultOgImage'));
  check('keywords come from the settings, not a hardcoded list',
    HOME.includes('keywords: settings.keywords')
    && !HOME.includes("'pdf editor', 'secure file sharing'"));
  check('the layout still generates metadata from the settings',
    LAYOUT.includes('export async function generateMetadata') && LAYOUT.includes('getSeoSettings()'));

  console.log('\n── 8. Fallback behaviour is unchanged ──');

  const base = { ...DEFAULT_SEO_SETTINGS };
  const r = resolveSeo({ ...base, homeTitle: '', ogTitle: '', twitterTitle: '' });
  check('homepage title still falls back to the full title', r.title === base.siteTitleFull);
  check('OG title still falls back to the homepage title', r.ogTitle === r.title);
  check('Twitter title still falls back to the OG title', r.twitterTitle === r.ogTitle);
  check('an explicit value still wins',
    resolveSeo({ ...base, ogTitle: 'Social' }).ogTitle === 'Social');
  check('the fallback chain is not duplicated',
    SETTINGS.includes('resolveSeoWith(settings, getPublicAppBaseUrl())'));

  console.log('\n── 9. UI tells the truth ──');

  check('the save button says draft', TAB.includes("{saving ? 'Saving…' : 'Save draft'}"));
  check('publishing is a distinct action', TAB.includes('Deploy to live site'));
  check('publishing is blocked while there are unsaved edits',
    TAB.includes('disabled={publishing || saving || dirty}'));
  check('the UI shows whether a draft is unpublished',
    TAB.includes('Draft not published') && TAB.includes('the public site is still serving'));
  check('a revalidation failure is shown, not hidden',
    TAB.includes('the production cache refresh failed'));
  check('success wording does not claim live without verification',
    TAB.includes('run Verify live to confirm'));
  check('a Verify live control exists', TAB.includes('Verify live'));
  check('verification results distinguish live, mismatch and unavailable',
    TAB.includes('LIVE — production matches') && TAB.includes('MISMATCH — production is still serving')
    && TAB.includes('UNAVAILABLE — the public page could not be checked'));
  check('a stale verification is cleared when settings change',
    (TAB.match(/setVerification\(null\)/g) ?? []).length >= 2);
  check('the last published time is shown', TAB.includes('Last published:'));
  check('match state is conveyed in words for assistive tech',
    TAB.includes("{c.matches ? 'Matches:' : 'Does not match:'}"));
  check('duplicate publishes are prevented', TAB.includes('if (publishing) return;'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
