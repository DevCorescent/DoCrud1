/**
 * SEO Manager UI self-test.
 *
 * scripts/seo-settings.selftest.ts already covers the backend: validation,
 * authorization, and the settings actually reaching <head>. This file covers
 * what the UI rework added, and the failure modes specific to it:
 *
 *  - a preview that silently stops matching what the server would send,
 *  - a "health score" that flatters the admin by grading raw fields instead of
 *    the values production really emits,
 *  - an empty field that hides a live fallback value.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  resolveSeoWith, TITLE_MAX, DESCRIPTION_MAX, type SeoSettings,
} from '@/lib/seo-resolve';
import { computeSeoHealth } from '@/lib/seo-health';
import { DEFAULT_SEO_SETTINGS, resolveSeo, validateSeoSettings } from '@/lib/server/seo-settings';
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
const TAB = read('components/superadmin/SeoTab.tsx');
const UPLOAD = read('app/api/super-admin/seo/upload/route.ts');
const API = read('app/api/super-admin/seo/route.ts');
const SETTINGS = read('lib/server/seo-settings.ts');

const BASE = 'https://www.docrud.com';
const base: SeoSettings = { ...DEFAULT_SEO_SETTINGS };
const health = (s: SeoSettings) => computeSeoHealth(s, resolveSeoWith(s, BASE));

function main() {
  console.log('\n── 1. Client and server resolve identically ──');

  /* The whole point of extracting lib/seo-resolve.ts. If these ever diverge,
     the admin's preview becomes a lie. */
  const serverResolved = resolveSeo(base);
  const clientResolved = resolveSeoWith(base, getPublicAppBaseUrl());
  check('the shared resolver reproduces the server result exactly',
    JSON.stringify(serverResolved) === JSON.stringify(clientResolved));
  check('seo-settings delegates rather than keeping its own copy',
    SETTINGS.includes('resolveSeoWith(settings, getPublicAppBaseUrl())')
    && !/const title = settings\.homeTitle/.test(SETTINGS));
  check('the tab resolves with the shared function',
    TAB.includes("from '@/lib/seo-resolve'") && TAB.includes('resolveSeoWith(settings, baseUrl)'));
  check('the preview is driven by local state, not the saved server blob',
    !TAB.includes('setResolved(') && TAB.includes('useMemo'));

  console.log('\n── 2. Effective homepage values ──');

  const empty: SeoSettings = { ...base, homeTitle: '', homeDescription: '' };
  const r = resolveSeoWith(empty, BASE);
  check('an empty homepage title still resolves to the global full title',
    r.title === base.siteTitleFull, r.title);
  check('an empty homepage description still resolves to the global description',
    r.description === base.siteDescription);
  const override = resolveSeoWith({ ...base, homeTitle: 'Hire faster on Docrud' }, BASE);
  check('an explicit homepage title overrides the global one',
    override.title === 'Hire faster on Docrud');
  check('the OG title follows the overridden homepage title',
    override.ogTitle === 'Hire faster on Docrud');
  check('the Twitter title follows the OG chain',
    resolveSeoWith({ ...base, ogTitle: 'Social' }, BASE).twitterTitle === 'Social');
  /* The admin must never see a blank box for a field that is live in production. */
  check('the UI surfaces the effective value behind an empty field',
    TAB.includes('showEffective') && TAB.includes('Currently using'));
  check('the effective hint names the source of the fallback',
    TAB.includes("source: 'the global full title'")
    && TAB.includes("source: 'the global meta description'"));
  check('an override can be cleared back to the fallback',
    TAB.includes('Clear override') && TAB.includes("onClearOverride={() => set('homeTitle', '')}"));

  console.log('\n── 3. Health is computed from resolved values ──');

  const full = health(base);
  check('the default settings score is deterministic',
    health(base).score === full.score && health(base).score === health({ ...base }).score);
  check('the score is within 0..100', full.score >= 0 && full.score <= 100, String(full.score));
  check('weights total exactly 100',
    full.checks.reduce((n, c) => n + c.weight, 0) === 100,
    String(full.checks.reduce((n, c) => n + c.weight, 0)));
  check('a check count is reported', full.total === full.checks.length && full.total > 0);

  /* The failure this guards: grading `settings.homeTitle` rather than the
     resolved title would report "title missing" for a site whose title is fine. */
  check('an empty homepage title does NOT count as a missing title',
    health({ ...base, homeTitle: '' }).checks.find((c) => c.id === 'title')?.status === 'pass');
  check('a genuinely empty title fails',
    health({ ...base, homeTitle: '', siteTitleFull: '', siteTitle: '' })
      .checks.find((c) => c.id === 'title')?.status === 'fail');
  check('a missing description fails',
    health({ ...base, siteDescription: '', homeDescription: '' })
      .checks.find((c) => c.id === 'description')?.status === 'fail');

  const long = health({ ...base, homeTitle: 'x'.repeat(TITLE_MAX + 20) });
  const lengthCheck = long.checks.find((c) => c.id === 'title-length');
  check('an over-long title warns rather than fails', lengthCheck?.status === 'warn');
  check('a warning earns partial credit, not zero',
    (lengthCheck?.points ?? 0) > 0 && (lengthCheck?.points ?? 0) < (lengthCheck?.weight ?? 0));
  check('an over-long description warns',
    health({ ...base, siteDescription: 'x'.repeat(DESCRIPTION_MAX + 20) })
      .checks.find((c) => c.id === 'description-length')?.status === 'warn');

  console.log('\n── 4. Indexing and verification states ──');

  const noindexed = health({ ...base, noindex: true });
  check('noindex is a failing check', noindexed.checks.find((c) => c.id === 'indexing')?.status === 'fail');
  check('noindex lowers the score', noindexed.score < full.score,
    `${noindexed.score} vs ${full.score}`);
  check('noindex carries actionable advice',
    Boolean(noindexed.checks.find((c) => c.id === 'indexing')?.advice));
  check('indexing passes by default',
    full.checks.find((c) => c.id === 'indexing')?.status === 'pass');
  check('the UI shows an explicit indexing status, not just a checkbox',
    TAB.includes('Noindex enabled') && TAB.includes('Indexing enabled'));
  check('the UI warns in words when noindex is on',
    TAB.includes('instructed not to index the public site'));

  check('missing Google verification warns rather than fails',
    full.checks.find((c) => c.id === 'verification')?.status === 'warn');
  check('a configured verification value passes',
    health({ ...base, googleSiteVerification: 'abc123' })
      .checks.find((c) => c.id === 'verification')?.status === 'pass');
  check('the UI shows a verification status indicator',
    TAB.includes('Verification configured') && TAB.includes('Not configured'));
  /* We store a value; we do not contact Google. Saying otherwise would be a lie. */
  check('the UI does not claim the site is verified WITH Google',
    TAB.includes('it does not check with Google'));

  console.log('\n── 5. Previews and images ──');

  check('the Google preview renders the resolved title and description',
    TAB.includes('{resolved.title}') && TAB.includes('{resolved.description}'));
  check('the OG preview renders resolved OG values',
    TAB.includes('{resolved.ogTitle}') && TAB.includes('{resolved.ogDescription}'));
  check('the OG preview renders the resolved image',
    TAB.includes('<SocialImage url={resolved.ogImage} />'));
  check('the Twitter image field previews the resolved Twitter image',
    TAB.includes('previewUrl={resolved.twitterImage}'));
  check('branding fields render real image previews',
    TAB.includes('previewUrl={resolved.logoUrl}') && TAB.includes('previewUrl={settings.faviconUrl}'));
  /* A broken image must look broken, not like an empty slot. */
  check('a failed image load is reported, not hidden',
    TAB.includes('onError={() => setBroken(true)}') && TAB.includes('Image could not be loaded'));
  check('the broken state resets when the URL changes',
    TAB.includes('useEffect(() => { setBroken(false); }, [url]);'));
  check('character counters appear on the preview itself',
    TAB.includes('<Counter value={resolved.title}') && TAB.includes('<Counter value={resolved.description}'));

  console.log('\n── 6. Save experience ──');

  check('unsaved changes are computed against the last saved state',
    TAB.includes('savedSnapshot') && TAB.includes("JSON.stringify(settings) !== savedSnapshot"));
  check('all save states are represented',
    TAB.includes('Saving…') && TAB.includes('Unsaved changes')
    && TAB.includes('Saved') && TAB.includes('Save failed'));
  check('save state is announced to assistive tech', TAB.includes('aria-live="polite"'));
  check('a last-saved timestamp is shown', TAB.includes('lastSavedAt') && TAB.includes('Last saved'));
  check('the snapshot is refreshed from the server response after saving',
    TAB.includes('setSavedSnapshot(JSON.stringify(data.settings))'));
  check('save is disabled only while a request is in flight',
    TAB.includes('disabled={saving}') && !TAB.includes('disabled={!dirty'));
  check('duplicate submits are prevented', TAB.includes('if (!settings || saving) return'));
  check('leaving with unsaved edits is guarded',
    TAB.includes("window.addEventListener('beforeunload'") && TAB.includes('unsaved SEO changes'));
  check('the unsaved bar offers both save and discard',
    TAB.includes('Discard changes') && TAB.includes('Save now'));
  check('discarding restores the last saved state, not the defaults',
    TAB.includes('setSettings(JSON.parse(savedSnapshot) as SeoSettings)'));

  console.log('\n── 7. Layout, responsiveness and accessibility ──');

  check('previews sit side by side only where there is room',
    TAB.includes('grid gap-4 xl:grid-cols-2'));
  check('field grids collapse to one column on small screens',
    TAB.includes('grid gap-3 lg:grid-cols-2'));
  check('overview tiles reflow across breakpoints',
    TAB.includes('grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5'));
  check('long sections are collapsible', TAB.includes('<details open={defaultOpen}'));
  check('the rarely-used section starts collapsed', TAB.includes('defaultOpen={false}'));
  /* min-w-0 is what actually stops a grid child forcing horizontal scroll. */
  check('grid children can shrink below their content width',
    (TAB.match(/min-w-0/g) ?? []).length >= 6);
  check('long values truncate instead of overflowing',
    TAB.includes('truncate') && TAB.includes('line-clamp-2'));
  check('every input is associated with a label',
    TAB.includes('htmlFor={id}') && TAB.includes('aria-label="Canonical URL"'));
  check('focus is visible on inputs and buttons',
    (TAB.match(/focus-visible:ring/g) ?? []).length >= 5);
  check('check status is conveyed in words, not colour alone',
    TAB.includes('className="sr-only"') && TAB.includes("'Passed:'"));
  check('errors are announced', TAB.includes('role="alert"'));
  check('the canonical field stays read-only', TAB.includes('readOnly') && TAB.includes('aria-readonly'));

  console.log('\n── 8. Upload reuses existing infrastructure ──');

  check('upload is guarded by the shared admin session',
    UPLOAD.includes('getSuperAdminSessionFromRequest') && UPLOAD.includes("{ status: 401 }"));
  check('it reuses the shared R2 helpers rather than a new store',
    UPLOAD.includes("from '@/lib/server/r2'") && UPLOAD.includes('isR2Configured()'));
  check('it falls back to the same public/uploads convention',
    UPLOAD.includes("'public', 'uploads', 'seo'"));
  check('file type is allow-listed', UPLOAD.includes('ALLOWED_TYPES.has(file.type)'));
  /* SVG can carry script and is served from our own origin. */
  check('SVG is not accepted', !UPLOAD.includes("'image/svg+xml'"));
  check('file size is capped', UPLOAD.includes('file.size > MAX_BYTES'));
  check('the filename is not taken from the upload',
    UPLOAD.includes('crypto.randomBytes') && !UPLOAD.includes('file.name'));
  check('the internal error is logged but not returned to the client',
    UPLOAD.includes("{ error: 'Upload failed' }") && !UPLOAD.includes('String(err)'));

  console.log('\n── 9. Nothing about the backend contract moved ──');

  const apiVerbs = (API.match(/export async function (GET|PUT|POST|DELETE|PATCH)\(/g) ?? []).length;
  check('every API verb is still guarded',
    (API.match(/const fail = await guard\(req\);/g) ?? []).length === apiVerbs,
    `${apiVerbs} verbs`);
  check('the API still returns the same keys',
    API.includes('canonicalBaseUrl') && API.includes('resolved:') && API.includes('limits:'));
  check('the canonical host still comes from deployment config',
    API.includes('getPublicAppBaseUrl()') && !TAB.includes('setBaseUrl(data.settings'));
  /* Validation still rejects the dangerous schemes — it did not move to the client. */
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example.com/a.png']) {
    check(`still rejected on save: ${bad.slice(0, 28)}`,
      validateSeoSettings({ ogImage: bad }, base).errors.length === 1);
  }
  check('a rejected URL does not change the stored value',
    validateSeoSettings({ ogImage: 'javascript:alert(1)' }, base).settings.ogImage === base.ogImage);
  check('the tab does not validate URLs in place of the server',
    !TAB.includes('isSafeAssetUrl'));
  check('no secret is rendered by the tab',
    !/apiKey|secret|password|token/i.test(TAB.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('the tab does not use localStorage as the source of truth',
    !TAB.includes('localStorage'));
  /* The sitemap link now lives in the Sitemap Health panel that this tab
     mounts. What must stay true is that the UI LINKS to the sitemap and never
     rebuilds sitemap data itself. */
  const SITEMAP_PANEL = read('components/superadmin/SitemapHealth.tsx');
  check('the tab mounts the sitemap panel rather than duplicating it',
    TAB.includes('<SitemapHealth />'));
  check('the sitemap is linked, not regenerated in the UI',
    SITEMAP_PANEL.includes('sitemapUrl') && !SITEMAP_PANEL.includes('sitemap-settings'));
  check('the panel does not generate sitemap entries client-side',
    !SITEMAP_PANEL.includes('getPublishedHiringJobList')
    && !SITEMAP_PANEL.includes('listBusinessPages'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
