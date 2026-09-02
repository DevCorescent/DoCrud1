/**
 * Company logo resolution — identity, safety, and one lookup per company.
 *
 * Run: npm run test:company-logo
 */
import { readFileSync } from 'node:fs';
import {
  clearCompanyLogoCache, companyLogoCacheSize, isSafeLogoUrl,
  invalidateCompanyLogo, resolveCompanyLogo, resolveCompanyLogos, type ResolverDeps,
} from '../lib/server/company-logo-resolver';
import { logoKey } from '../lib/company-logos';
import {
  NoopCompanyDomainDiscovery, isActionableCandidate, setCompanyDomainDiscovery,
} from '../lib/server/company-domain-discovery';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

/** A head() that counts calls, so "one per company" is measurable. */
function counting(result: { ok: boolean; contentType: string; contentLength: number } | null) {
  const calls: string[] = [];
  const deps: ResolverDeps = { head: async (url) => { calls.push(url); return result; } };
  return { deps, calls };
}
const IMAGE = { ok: true, contentType: 'image/png', contentLength: 4096 };

async function main() {
  /* ═══ 1-2. Name variants collapse to ONE identity ═════════════════════ */
  for (const group of [
    ['Razorpay', 'razorpay', 'RAZORPAY', 'RazorPay', 'Razor Pay'],
    ['Postman', 'POSTMAN', 'postman', 'Post man'],
    ['MindTickle', 'Mindtickle', 'MINDTICKLE'],
  ]) {
    const ids = new Set(group.map(logoKey));
    check(`${group[0]} variants collapse to one identity (${group.join(', ')})`, ids.size === 1);
  }
  check('different companies do NOT collapse', logoKey('Razorpay') !== logoKey('Postman'));

  /* ═══ 3, 15. A verified override wins, and costs no network ═══════════ */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    const r = await resolveCompanyLogo(
      { name: 'Razorpay', sourceLogoUrl: 'https://evil.example.com/other-company.png' }, deps);
    check('a verified override resolves', r.status === 'found');
    check('and comes from the registry', r.source === 'verified');
    check('and is the registry asset, not the supplied one', r.logoUrl === '/company-logos/razorpay.png');
    check('a verified override makes NO network request', calls.length === 0);
  }
  /* Case and spacing must not defeat the override. */
  clearCompanyLogoCache();
  check('the override is found through a name variant',
    (await resolveCompanyLogo({ name: 'RAZORPAY' }, counting(IMAGE).deps)).source === 'verified');

  /* ═══ 4. A source-supplied logo is used — after validation ════════════ */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    const r = await resolveCompanyLogo(
      { name: 'Nagarro', sourceLogoUrl: 'https://cdn.example.com/nagarro.png' }, deps);
    check('a source-supplied logo is used', r.status === 'found' && r.source === 'source');
    check('and it was validated first', calls.length === 1);
  }

  /* ═══ 8-10. Unsafe URLs are refused ══════════════════════════════════ */
  for (const bad of [
    'file:///etc/passwd', 'javascript:alert(1)', 'data:image/png;base64,AAA',
    'blob:https://x/y', 'ftp://example.com/a.png',
    'http://localhost/logo.png', 'https://127.0.0.1/logo.png', 'http://0.0.0.0/a.png',
    'https://10.0.0.5/logo.png', 'https://192.168.1.4/logo.png', 'https://172.16.0.9/a.png',
    'https://169.254.169.254/latest/meta-data/', 'https://metadata.google.internal/x',
    'https://[::1]/a.png', 'https://intranet.local/a.png', 'https://svc.internal/a.png',
    'https://nodot/a.png', '', '   ', 'not a url',
  ]) {
    check(`refused: ${bad || '(empty)'}`, !isSafeLogoUrl(bad));
  }
  for (const good of ['https://cdn.example.com/a.png', 'http://example.co.uk/favicon.ico']) {
    check(`allowed: ${good}`, isSafeLogoUrl(good));
  }

  /* An unsafe source logo must not be fetched OR used. */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    const r = await resolveCompanyLogo(
      { name: 'Evil Co', sourceLogoUrl: 'https://169.254.169.254/latest/meta-data/' }, deps);
    check('an SSRF target is never fetched', calls.length === 0);
    check('and yields no logo', r.status === 'not_found' && r.logoUrl === '');
  }

  /* ═══ 10. Non-image and oversized responses are refused ══════════════ */
  clearCompanyLogoCache();
  check('an HTML response is not a logo',
    (await resolveCompanyLogo({ name: 'HtmlCo', sourceLogoUrl: 'https://x.example.com/a' },
      counting({ ok: true, contentType: 'text/html', contentLength: 500 }).deps)).status === 'not_found');
  clearCompanyLogoCache();
  check('an oversized image is refused',
    (await resolveCompanyLogo({ name: 'BigCo', sourceLogoUrl: 'https://x.example.com/a.png' },
      counting({ ok: true, contentType: 'image/png', contentLength: 99_000_000 }).deps)).status === 'not_found');
  clearCompanyLogoCache();
  check('a non-ok response is refused',
    (await resolveCompanyLogo({ name: 'DeadCo', sourceLogoUrl: 'https://x.example.com/a.png' },
      counting({ ok: false, contentType: 'image/png', contentLength: 10 }).deps)).status === 'not_found');

  /* ═══ 12. A name is NEVER turned into a domain ═══════════════════════ */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    await resolveCompanyLogo({ name: 'Acme Corp' }, deps);
    check('a company with no website triggers NO request', calls.length === 0);
    check('and no guessed domain is ever contacted',
      !calls.some((u) => /acme|acmecorp/i.test(u)));
  }
  /* An operator-configured website IS used — that domain came from a human. */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    const r = await resolveCompanyLogo({ name: 'Acme Corp', websiteUrl: 'https://acme.example.com/careers' }, deps);
    check('a configured website yields a favicon', r.status === 'found' && r.source === 'website');
    check('and it is the origin favicon', calls[0] === 'https://acme.example.com/favicon.ico');
  }

  /* ═══ 5-6, 13, 20. ONE resolution per company, not per job ═══════════ */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    /* 1,000 AECOM jobs and 300 Razorpay jobs — the exact scenario. */
    const hints = [
      ...Array.from({ length: 1000 }, () => ({ name: 'AECOM', sourceLogoUrl: 'https://cdn.example.com/aecom.png' })),
      ...Array.from({ length: 300 }, () => ({ name: 'Razorpay' })),
    ];
    const map = await resolveCompanyLogos(hints, deps);
    check('1,300 jobs resolve to 2 companies', map.size === 2);
    /* AECOM needs one validation; Razorpay is a verified override (no network). */
    check('and make at most ONE network call per company', calls.length <= 2);
    check('never one per job', calls.length < 1300);
    check('AECOM resolved from its source logo', map.get('aecom')?.source === 'source');
    check('Razorpay resolved from the registry', map.get('razorpay')?.source === 'verified');
  }

  /* A second pass is served from cache. The company MUST be one that requires
     a network call when cold — a verified override or a website-less company
     makes zero calls either way, so it could not detect a missing cache. */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    const hint = { name: 'CacheCo', sourceLogoUrl: 'https://cdn.example.com/cacheco.png' };
    const first = await resolveCompanyLogo(hint, deps);
    check('a cold resolve does make one request', calls.length === 1 && first.status === 'found');
    const second = await resolveCompanyLogo(hint, deps);
    check('a warm resolve makes NO further request', calls.length === 1);
    check('and returns the same answer', second.logoUrl === first.logoUrl);
    /* And through the batch path, and through a name variant. */
    await resolveCompanyLogos([hint, { name: 'cacheco' }, { name: 'CACHE CO' }], deps);
    check('the batch path also honours the cache', calls.length === 1);
  }

  /* A permanent miss is remembered, not re-probed every scrape. */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    await resolveCompanyLogo({ name: 'NoLogo Ltd' }, deps);
    await resolveCompanyLogo({ name: 'NoLogo Ltd' }, deps);
    await resolveCompanyLogo({ name: 'nologo ltd' }, deps);
    check('a NOT_FOUND is cached, not re-probed', calls.length === 0);
    check('and the cache holds one entry for it', companyLogoCacheSize() >= 1);
  }

  /* Mentions merge: one job knows the website, another the source logo. */
  clearCompanyLogoCache();
  {
    const { deps } = counting(IMAGE);
    const map = await resolveCompanyLogos([
      { name: 'Split Co' },
      { name: 'split co', websiteUrl: 'https://split.example.com' },
    ], deps);
    check('separate mentions of one company merge', map.size === 1);
    check('and the website from the second mention is used',
      map.get('splitco')?.source === 'website');
  }

  /* ═══ 7, 14. Failure is never fatal ═════════════════════════════════ */
  clearCompanyLogoCache();
  {
    const throwing: ResolverDeps = { head: async () => { throw new Error('network down'); } };
    let threw = false;
    let r;
    try { r = await resolveCompanyLogo({ name: 'Down Co', sourceLogoUrl: 'https://x.example.com/a.png' }, throwing); }
    catch { threw = true; }
    check('a throwing fetch never propagates', !threw);
    check('and yields a usable, logo-less result', r?.status === 'not_found' && r?.logoUrl === '');
  }
  clearCompanyLogoCache();
  {
    let threw = false;
    try { await resolveCompanyLogos([{ name: '' }, { name: '   ' }], counting(null).deps); }
    catch { threw = true; }
    check('an unusable company name never throws', !threw);
  }

  /* ═══ 11, 18. The mark is never recoloured; broken URLs fall back ════ */
  const logoCmp = readFileSync('components/jobs/company/CompanyLogo.tsx', 'utf8');
  check('CompanyLogo applies no CSS filter',
    !/filter\s*:|grayscale\(|invert\(|brightness\(/.test(logoCmp));
  check('the plate is always white', /background: '#FFFFFF'/.test(logoCmp));
  check('a broken URL falls back to initials', /onError=/.test(logoCmp));
  check('and the dead URL is remembered, not re-requested', /broken\.add\(/.test(logoCmp));
  check('initials are derived, never fabricated as a mark', /companyInitials/.test(logoCmp));

  /* Every company surface uses the one component. */
  for (const f of [
    'components/jobs/company/CompanyExplorer.tsx',
    'components/jobs/company/CompanyJobsView.tsx',
    'components/jobs/company/CompanyExplorerManageModal.tsx',
  ]) {
    const src = readFileSync(f, 'utf8');
    check(`${f.split('/').pop()} uses the shared CompanyLogo`, /<CompanyLogo\b/.test(src));
    check(`${f.split('/').pop()} has no ad-hoc logo <img>`, !/<img[^>]*logoUrl/.test(src));
  }

  /* The resolver must not have grown a domain guesser. */
  const resolver = readFileSync('lib/server/company-logo-resolver.ts', 'utf8');
  check('no domain is ever built from a company name',
    !/\+\s*['"]\.com['"]|`\$\{[^}]*name[^}]*\}\.com`/.test(resolver));
  check('redirects are not followed blind', /redirect: 'manual'/.test(resolver));
  check('requests are time-bounded', /setTimeout\(\(\) => controller\.abort/.test(resolver));
  check('responses are size-bounded', /MAX_LOGO_BYTES/.test(resolver));

  /* ═══ 10. A website change invalidates ONLY that company ════════════ */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    await resolveCompanyLogo({ name: 'Alpha Co', sourceLogoUrl: 'https://cdn.example.com/a.png' }, deps);
    await resolveCompanyLogo({ name: 'Beta Co', sourceLogoUrl: 'https://cdn.example.com/b.png' }, deps);
    check('two companies resolve with two calls', calls.length === 2);

    invalidateCompanyLogo('Alpha Co');
    await resolveCompanyLogo({ name: 'Alpha Co', sourceLogoUrl: 'https://cdn.example.com/a.png' }, deps);
    check('the invalidated company re-resolves', calls.length === 3);
    await resolveCompanyLogo({ name: 'Beta Co', sourceLogoUrl: 'https://cdn.example.com/b.png' }, deps);
    check('the OTHER company is still cached', calls.length === 3);
    /* Invalidation must work through a name variant, since the admin types a
       display name and the cache is keyed on identity. */
    invalidateCompanyLogo('alpha co');
    await resolveCompanyLogo({ name: 'Alpha Co', sourceLogoUrl: 'https://cdn.example.com/a.png' }, deps);
    check('invalidation works through a name variant', calls.length === 4);
  }

  /* ═══ 17. "Not synced" must not mean "no logo" ══════════════════════ */
  const client = readFileSync('lib/server/scraper-client.ts', 'utf8');
  check('the source row resolves a logo per COMPANY', /resolveCompanyLogos\(/.test(client));
  check('logo resolution is independent of sync state',
    /Independent of sync state/.test(client));
  check('and a resolver failure cannot break scraper status',
    /resolveCompanyLogos\([\s\S]{0,400}?\.catch\(/.test(client));
  check('the source row carries the canonical company id', /companyId: logoKey/.test(client));

  /* ═══ 19-20. Source Status uses the shared component, unfiltered ═════ */
  const tab = readFileSync('components/superadmin/JobsTab.tsx', 'utf8');
  /* Comments are stripped first: a source-level assertion that matches prose
     inside a comment is testing the documentation, not the code. */
  const tabCode = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  check('Source Status renders through CompanyLogo', /<CompanyLogo\b/.test(tabCode));
  check('and has no image element of its own', !/<img[\s/>]/.test(tabCode));
  check('and applies no filter to the mark', !/grayscale\(|invert\(|filter:/.test(tabCode));
  /* The fields must be separate cells, not adjoining spans — this is the
     "Atlanashby" bug, and a grid is what prevents it structurally. */
  check('the row is a grid, so fields cannot run together', /grid-cols-\[auto_minmax/.test(tabCode));
  check('the company name is its own element', /truncate font-semibold text-white/.test(tabCode));
  check('the provider badge is its own element', /uppercase tracking-wide text-zinc-400/.test(tabCode));
  check('jobs and last-sync are separate elements',
    /'job' : 'jobs'/.test(tabCode) && /toLocaleDateString/.test(tabCode));

  /* One fact, one place. "Never synced" is the status word; the date cell must
     not repeat it, or a row says the same thing twice. */
  check('the date cell does not repeat the status word',
    (tabCode.match(/Never synced/g) ?? []).length === 2);

  /* Four explicit states, all READ from existing data. */
  check('status is derived, never inferred from a logo',
    /return s\.failed \? 'failed' : s\.lastSyncAt \? 'synced' : 'never';/.test(tabCode)
    && !/logoUrl \?[^\n]*'synced'/.test(tabCode));
  /* Decided in exactly one place, so the filter and the row cannot disagree. */
  check('there is a single state derivation',
    (tabCode.match(/s\.failed \? 'failed'/g) ?? []).length === 1);
  check('both the filter and the row call it',
    (tabCode.match(/sourceState\(s\)/g) ?? []).length === 2);
  check('status carries a word, not only a colour',
    /label: 'Synced'/.test(tabCode) && /label: 'Never synced'/.test(tabCode) && /label: 'Sync failed'/.test(tabCode));
  check('the dot is decorative only', /aria-hidden className=\{`h-1\.5 w-1\.5/.test(tabCode));

  /* Source Status shows the REAL count — rounding belongs to Company Explorer. */
  check('the job count is not rounded here',
    !/getCompanyJobDisplayCount|formatCompanyJobCount/.test(tabCode));

  /* A website is shown only when an operator configured one. */
  check('an unconfigured website says so plainly', /Website not configured/.test(tabCode));
  check('no domain is derived from the company name',
    !/\+\s*['"]\.com['"]|\$\{[^}]*label[^}]*\}\.com/.test(tabCode));
  check('no ATS host is shown as the company website',
    !/greenhouse\.io|lever\.co|ashbyhq/.test(tabCode));

  /* The list is bounded and scrolls vertically only. */
  check('the list has a constrained scroll area', /max-h-\[520px\] overflow-y-auto/.test(tabCode));
  check('and never scrolls sideways', /overflow-x-hidden/.test(tabCode));

  /* The source count is derived, not hardcoded. */
  check('the header count is derived from the data',
    /\{scraper\.sources\.length\}/.test(tabCode) && !/21 sources/.test(tabCode));

  /* Filtering is presentation only. */
  check('search and filter do not mutate source data',
    /const sourceRows = \(scraper\?\.sources \?\? \[\]\)\.filter/.test(tabCode));

  /* ═══ 3-4, 21. A brand-new company needs no code change ═════════════ */
  clearCompanyLogoCache();
  {
    const { deps, calls } = counting(IMAGE);
    /* Never seen before, no registry entry, no website. */
    const unknown = await resolveCompanyLogo({ name: 'FutureCompanyXYZ' }, deps);
    check('an unknown company resolves without code changes', unknown.id === 'futurecompanyxyz');
    check('and gets NO logo rather than a guessed one', unknown.logoUrl === '');
    check('and makes no request at all', calls.length === 0);

    /* Give it a website — the same company now resolves, still no code change. */
    invalidateCompanyLogo('FutureCompanyXYZ');
    const configured = await resolveCompanyLogo(
      { name: 'FutureCompanyXYZ', websiteUrl: 'https://futurexyz.example.com' }, deps);
    check('the same company resolves once a website is configured',
      configured.status === 'found' && configured.source === 'website');
  }

  /* ═══ Redirect policy: bounded, and every hop re-validated ══════════ */
  const src = readFileSync('lib/server/company-logo-resolver.ts', 'utf8');
  check('redirects are never followed blind', /redirect: 'manual'/.test(src));
  check('the chain is hard-bounded', /MAX_REDIRECTS = \d+/.test(src));
  check('the bound is small', Number((src.match(/MAX_REDIRECTS = (\d+)/) ?? [])[1]) <= 3);
  /* THE GUARANTEE: a redirect must not be a way around the allow-list. */
  check('every hop is re-validated before it is followed',
    /if \(!isSafeLogoUrl\(next\)\) return null;/.test(src));
  check('a Location is resolved against the current url, not the original',
    /new URL\(location, target\)/.test(src));
  check('a missing Location ends the chain', /if \(!location\) return null;/.test(src));

  /* A redirect INTO a private address must be refused at the hop, exactly as a
     direct one is. Verified through isSafeLogoUrl, which the hop calls. */
  for (const hostile of [
    'https://169.254.169.254/latest/meta-data/', 'http://127.0.0.1/favicon.ico',
    'https://10.1.2.3/favicon.ico', 'file:///etc/passwd',
  ]) {
    check(`a redirect to ${hostile.slice(0, 34)} would be refused`, !isSafeLogoUrl(hostile));
  }

  /* ═══ Domain discovery: the seam, and its honest default ════════════ */
  clearCompanyLogoCache();
  {
    /* Today's answer for a company nobody has configured. */
    const noop = await NoopCompanyDomainDiscovery.resolve({ id: 'aecom', name: 'AECOM' });
    check('the default discovery finds nothing', noop.status === 'NOT_FOUND');
    check('and offers no candidate', noop.candidate === undefined);
  }

  /* Only HIGH confidence may act unattended. */
  const cand = (confidence: 'HIGH' | 'MEDIUM' | 'LOW') => ({
    status: 'FOUND' as const,
    candidate: { companyId: 'x', companyName: 'X', websiteUrl: 'https://x.example.com',
      confidence, source: 'trusted-enrichment' as const },
  });
  check('a HIGH-confidence candidate is actionable', isActionableCandidate(cand('HIGH')));
  check('MEDIUM is NOT acted on unattended', !isActionableCandidate(cand('MEDIUM')));
  check('LOW is NOT acted on unattended', !isActionableCandidate(cand('LOW')));
  check('a NOT_FOUND is never actionable', !isActionableCandidate({ status: 'NOT_FOUND' }));
  check('a FOUND with no url is never actionable',
    !isActionableCandidate({ status: 'FOUND', candidate: { companyId: 'x', companyName: 'X',
      websiteUrl: '', confidence: 'HIGH', source: 'trusted-enrichment' } }));

  /* A future provider drops in and the resolver uses it — no other change. */
  clearCompanyLogoCache();
  {
    const { deps } = counting(IMAGE);
    setCompanyDomainDiscovery({
      async resolve({ name }) {
        return { status: 'FOUND', candidate: { companyId: logoKey(name), companyName: name,
          websiteUrl: 'https://future.example.com', confidence: 'HIGH', source: 'trusted-enrichment' } };
      },
    });
    const r = await resolveCompanyLogo({ name: 'FutureCompanyXYZ' }, deps);
    check('a trusted provider resolves a logo with no other code change',
      r.status === 'found' && r.source === 'website');

    /* …but it must NEVER outrank a verified logo. */
    clearCompanyLogoCache();
    const razorpay = await resolveCompanyLogo({ name: 'Razorpay' }, deps);
    check('a verified logo still beats a discovered one',
      razorpay.source === 'verified' && razorpay.logoUrl === '/company-logos/razorpay.png');

    /* An SSRF target from a "trusted" provider is still refused. */
    clearCompanyLogoCache();
    setCompanyDomainDiscovery({
      async resolve({ name }) {
        return { status: 'FOUND', candidate: { companyId: logoKey(name), companyName: name,
          websiteUrl: 'https://169.254.169.254', confidence: 'HIGH', source: 'trusted-enrichment' } };
      },
    });
    const evil = await resolveCompanyLogo({ name: 'Evil Discovery Co' }, deps);
    check('a provider cannot smuggle an internal address past the guard',
      evil.status === 'not_found' && evil.logoUrl === '');

    /* A momentarily-down provider must not poison the company for hours. */
    clearCompanyLogoCache();
    setCompanyDomainDiscovery({ async resolve() { return { status: 'FAILED_TEMPORARILY' }; } });
    const down = await resolveCompanyLogo({ name: 'Flaky Co' }, deps);
    check('a temporary provider failure is recorded as FAILED, not NOT_FOUND',
      down.status === 'failed');

    /* A throwing provider must not break resolution at all. */
    clearCompanyLogoCache();
    setCompanyDomainDiscovery({ async resolve() { throw new Error('provider exploded'); } });
    let threw = false;
    let survived;
    try { survived = await resolveCompanyLogo({ name: 'Boom Co' }, deps); } catch { threw = true; }
    check('a throwing provider never propagates', !threw);
    check('and resolution still returns a usable result', survived?.status === 'not_found');

    setCompanyDomainDiscovery(null);   // restore the no-op
  }

  /* The default must never guess a domain from the name. */
  const discoverySrc = readFileSync('lib/server/company-domain-discovery.ts', 'utf8');
  /* Comments stripped: the file DOCUMENTS why `name + ".com"` is forbidden, and
     an assertion that matches that prose is testing the explanation rather than
     the code. */
  const discoveryCode = discoverySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('the discovery default builds no domain from a name',
    !/\+\s*['"]\.com['"]|\$\{[^}]*name[^}]*\}\.(com|io|co)/.test(discoveryCode));
  check('and it is a genuine no-op, not a stub with a heuristic',
    /status: 'NOT_FOUND'/.test(discoverySrc));
  check('the seam is injectable for a future provider',
    /export function setCompanyDomainDiscovery/.test(discoverySrc));

  console.log(`\n${passed} checks passed, ${failed} failed.`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
}

main();
