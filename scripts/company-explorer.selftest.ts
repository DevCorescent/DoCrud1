/**
 * Company Explorer — the pure rules.
 *
 * Run: npm run test:company-explorer
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_COMPANY_EXPLORER, applyCompanyExplorerOrder, availableCompanies,
  buildCompanyExplorerTiles, companyJobsHref, formatCompanyJobCount,
  getCompanyJobDisplayCount, isCompanyConfigured, normalizeCompanyExplorerConfig,
  reorderCompanyExplorerCompanies,
  type CompanyExplorerConfig, type LiveCompany,
} from '../lib/company-explorer';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

const cfg = (over: Partial<CompanyExplorerConfig> = {}): CompanyExplorerConfig =>
  normalizeCompanyExplorerConfig({ ...DEFAULT_COMPANY_EXPLORER, ...over });

const LIVE: LiveCompany[] = [
  { name: 'Razorpay', logoUrl: '/company-logos/razorpay.png', jobCount: 28 },
  { name: 'Atlan', logoUrl: '/company-logos/atlan.png', jobCount: 23 },
  { name: 'Groww', logoUrl: '/company-logos/groww.png', jobCount: 19 },
  { name: 'Nagarro', logoUrl: '', jobCount: 451 },
  { name: 'MindTickle', logoUrl: '/company-logos/mindtickle.png', jobCount: 7 },
];

/* ═══ Job count: rounded DOWN, never up ═════════════════════════════════ */

for (const [actual, want] of [[0,0],[1,0],[4,0],[5,5],[7,5],[9,5],[10,10],[14,10],
  [15,15],[19,15],[20,20],[27,25],[43,40],[451,450]] as Array<[number, number]>) {
  check(`${actual} jobs displays as ${want}`, getCompanyJobDisplayCount(actual) === want);
}
/* The direction is the whole point: a badge must never over-promise. */
for (const n of [1, 4, 7, 13, 26, 44, 99, 451]) {
  check(`${n} never rounds UP`, getCompanyJobDisplayCount(n) <= n);
  check(`${n} rounds to a multiple of five`, getCompanyJobDisplayCount(n) % 5 === 0);
}
check('a negative count is 0', getCompanyJobDisplayCount(-8) === 0);
check('a non-numeric count is 0', getCompanyJobDisplayCount('lots') === 0);
check('undefined is 0', getCompanyJobDisplayCount(undefined) === 0);

/* The badge text. Under five the exact number reads, because "0+ jobs" on a
   company that is hiring looks like a bug rather than a rounding rule. */
check('28 reads as 25+ jobs', formatCompanyJobCount(28) === '25+ jobs');
check('5 reads as 5+ jobs', formatCompanyJobCount(5) === '5+ jobs');
check('451 reads as 450+ jobs', formatCompanyJobCount(451) === '450+ jobs');
check('3 reads exactly, not 0+', formatCompanyJobCount(3) === '3 jobs');
check('1 reads in the singular', formatCompanyJobCount(1) === '1 job');
check('0 says there are none', formatCompanyJobCount(0) === 'No open jobs');
check('no badge ever reads "0+"', !['0','1','2','3','4','5','28','451']
  .some((n) => formatCompanyJobCount(Number(n)).startsWith('0+')));

/* ═══ Normalization: hostile stored JSON cannot break the homepage ═══════ */

const messy = normalizeCompanyExplorerConfig({
  items: [
    { id: 'razorpay', name: 'Razorpay', order: 5, visible: true },
    { name: 'Atlan', order: 1 },                       // id derived from name
    { id: 'razorpay', name: 'Razorpay Duplicate', order: 0 }, // duplicate
    { id: '', name: '', order: 2 },                    // unusable
    null, 'nonsense', 42,
  ] as never,
  maxItems: 9999,
});
check('duplicate ids collapse to one', messy.items.filter((i) => i.id === 'razorpay').length === 1);
check('the FIRST occurrence wins', messy.items.find((i) => i.id === 'razorpay')?.name === 'Razorpay');
check('an entry with no id or name is dropped', !messy.items.some((i) => !i.id));
check('garbage entries are dropped', messy.items.length === 2);
check('a missing id is derived from the name', messy.items.some((i) => i.id === 'atlan'));
check('a missing visible defaults to TRUE', messy.items.every((i) => i.visible === true));
check('order is re-numbered densely from 0',
  messy.items.map((i) => i.order).join(',') === '0,1');
check('maxItems is clamped', messy.maxItems <= 60);
check('an empty config is valid', normalizeCompanyExplorerConfig({}).items.length === 0);
check('null normalizes to the default', normalizeCompanyExplorerConfig(null).autoFromJobs === true);

/* ═══ Ordering ══════════════════════════════════════════════════════════ */

const four = normalizeCompanyExplorerConfig({ items: [
  { id: 'a', name: 'A', order: 0, visible: true },
  { id: 'b', name: 'B', order: 1, visible: true },
  { id: 'c', name: 'C', order: 2, visible: true },
  { id: 'd', name: 'D', order: 3, visible: true },
] }).items;

check('moving the last item to the front',
  reorderCompanyExplorerCompanies(four, 'd', 0).map((c) => c.id).join('') === 'dabc');
check('moving the first item to the end',
  reorderCompanyExplorerCompanies(four, 'a', 3).map((c) => c.id).join('') === 'bcda');
check('moving into the middle',
  reorderCompanyExplorerCompanies(four, 'a', 2).map((c) => c.id).join('') === 'bcad');
check('reorder re-numbers densely',
  reorderCompanyExplorerCompanies(four, 'd', 0).map((c) => c.order).join(',') === '0,1,2,3');
check('reorder never mutates the input', four.map((c) => c.id).join('') === 'abcd');
/* A stale drag from a client that has since been reconfigured must not throw. */
check('an unknown id leaves the list intact',
  reorderCompanyExplorerCompanies(four, 'zzz', 0).map((c) => c.id).join('') === 'abcd');
check('an out-of-range index is clamped',
  reorderCompanyExplorerCompanies(four, 'a', 999).map((c) => c.id).join('') === 'bcda');
check('a negative index is clamped',
  reorderCompanyExplorerCompanies(four, 'd', -5).map((c) => c.id).join('') === 'dabc');

check('an explicit sequence is applied',
  applyCompanyExplorerOrder(four, ['c', 'a']).map((c) => c.id).join('') === 'cabd');
check('unmentioned entries survive, in their previous order',
  applyCompanyExplorerOrder(four, ['d']).map((c) => c.id).join('') === 'dabc');
/* 'zzz' does not exist, so 'b' leads and a, c, d follow in their prior order. */
check('an unknown id in the sequence is ignored',
  applyCompanyExplorerOrder(four, ['zzz', 'b']).map((c) => c.id).join('') === 'bacd');
check('a partial order never drops an entry',
  applyCompanyExplorerOrder(four, ['c']).length === four.length);

/* ═══ Composition ═══════════════════════════════════════════════════════ */

/* Auto only: companies WITH a logo lead, then busiest, then name.

   The fixture is built so the two rules disagree — Nagarro has by far the most
   jobs (451) and no logo, so it led under the old count-first rule and must now
   come LAST. A test that passed under either rule would prove nothing. */
const auto = buildCompanyExplorerTiles(cfg({ autoFromJobs: true }), LIVE);
check('auto fills from live employers', auto.length === LIVE.length);
check('a company with a logo leads', auto[0].name === 'Razorpay' && Boolean(auto[0].logoUrl));
check('every logo company precedes every logo-less one',
  auto.findIndex((t) => !t.logoUrl) === auto.filter((t) => t.logoUrl).length);
check('the logo-less company is last despite having the most jobs',
  auto[auto.length - 1].name === 'Nagarro' && auto[auto.length - 1].jobCount === 451);
check('within the logo group the order is still by job count',
  auto.filter((t) => t.logoUrl).map((t) => t.jobCount).join(',') === '28,23,19,7');
check('nothing is pinned in auto mode', auto.every((t) => t.pinned === false));

/* Curated leads, in the ADMIN's order — not by job count. */
const curated = cfg({ items: [
  { id: 'atlan', name: 'Atlan', order: 0, visible: true },
  { id: 'groww', name: 'Groww', order: 1, visible: true },
] as never });
const mixed = buildCompanyExplorerTiles(curated, LIVE);
check('curated companies lead', mixed[0].id === 'atlan' && mixed[1].id === 'groww');
check('the admin order beats job count', mixed[0].jobCount < mixed[2].jobCount);
check('curated entries are marked pinned', mixed[0].pinned && mixed[1].pinned);
check('the tail is filled from live jobs', mixed.length === LIVE.length);
/* The admin pinned Atlan and Groww; the automatic tail behind them still puts
   logos first, so Nagarro stays last there too. */
check('the automatic tail is still logo-first',
  mixed[2].name === 'Razorpay' && mixed[mixed.length - 1].name === 'Nagarro');
/* And the rule NEVER reorders what an admin pinned: Groww is pinned second with
   a logo, Atlan first — admin order, not logo or count order. */
check('logo-first never reorders the admin\'s pinned companies',
  mixed[0].id === 'atlan' && mixed[1].id === 'groww');
check('a curated company is not repeated in the tail',
  mixed.filter((t) => t.id === 'atlan').length === 1);
check('curated companies keep their real job count', mixed[0].jobCount === 23);

/* The admin's sequence must beat EVERY other plausible ordering. This fixture
   is deliberately chosen so the saved order is neither alphabetical
   (atlan, groww) nor by job count (atlan 23 > groww 19) — otherwise a
   regression to either would still pass. */
const deliberate = cfg({ items: [
  { id: 'groww', name: 'Groww', order: 0, visible: true },
  { id: 'atlan', name: 'Atlan', order: 1, visible: true },
] as never });
const dOrder = buildCompanyExplorerTiles(deliberate, LIVE);
check('the saved order wins over alphabetical', dOrder[0].id === 'groww');
check('and over job count', dOrder[0].jobCount < dOrder[1].jobCount);
check('and the second is the other curated one', dOrder[1].id === 'atlan');

/* Hiding must hold on BOTH paths — the automatic tail must not resurrect it. */
const hiddenCfg = cfg({ items: [
  { id: 'nagarro', name: 'Nagarro', order: 0, visible: false },
] as never });
const withHidden = buildCompanyExplorerTiles(hiddenCfg, LIVE);
check('a hidden company does not appear', !withHidden.some((t) => t.id === 'nagarro'));
check('and is not resurrected by autoFromJobs',
  !buildCompanyExplorerTiles({ ...hiddenCfg, autoFromJobs: true }, LIVE).some((t) => t.id === 'nagarro'));
check('the others still appear', withHidden.length === LIVE.length - 1);

/* A pinned company with no live jobs still shows — the admin chose it. */
const pinnedDead = cfg({ items: [
  { id: 'infosys', name: 'Infosys', order: 0, visible: true },
] as never });
const dead = buildCompanyExplorerTiles(pinnedDead, LIVE);
check('a pinned company with no live jobs still appears', dead[0].id === 'infosys');
check('and reports zero rather than a guess', dead[0].jobCount === 0);
check('and its badge says so', formatCompanyJobCount(dead[0].jobCount) === 'No open jobs');

/* Auto off means curated only. */
const manualOnly = buildCompanyExplorerTiles(
  { ...curated, autoFromJobs: false }, LIVE);
check('autoFromJobs off shows only curated', manualOnly.length === 2);

/* maxItems is a hard ceiling. */
const capped = buildCompanyExplorerTiles({ ...cfg({ autoFromJobs: true }), maxItems: 2 }, LIVE);
check('maxItems caps the strip', capped.length === 2);

/* Scraper naming variance must not split one employer into several. */
const variants: LiveCompany[] = [
  { name: 'MindTickle', logoUrl: '', jobCount: 4 },
  { name: 'Mindtickle', logoUrl: '', jobCount: 3 },
  { name: 'MINDTICKLE', logoUrl: '', jobCount: 2 },
];
const merged = buildCompanyExplorerTiles(cfg({ autoFromJobs: true }), variants);
check('three spellings collapse to ONE company', merged.length === 1);
check('and their job counts are summed', merged[0].jobCount === 9);

/* ═══ Duplicate prevention and availability ═════════════════════════════ */

check('an already-configured company is detected', isCompanyConfigured(curated, 'Atlan'));
check('and detection survives a different spelling', isCompanyConfigured(curated, 'atlan'));
check('an unconfigured company is not', !isCompanyConfigured(curated, 'Razorpay'));
check('an empty name is never "configured"', !isCompanyConfigured(curated, ''));

const avail = availableCompanies(hiddenCfg, LIVE);
check('the Manage list includes hidden companies', avail.some((t) => t.id === 'nagarro'));
check('and every live employer', avail.length >= LIVE.length);

/* ═══ Routing ═══════════════════════════════════════════════════════════ */

check('the company route uses the id', companyJobsHref('atlan') === '/jobs/company/atlan');
check('and encodes it', companyJobsHref('a b/c').includes('%2F'));

/* ═══ Wiring: the pieces must actually be connected ══════════════════════ */

const read = (f: string) => readFileSync(f, 'utf8');

/* The legacy Explore section is PRESERVED, not deleted. */
const home = read('components/PublicHomepage.tsx');
check('the legacy Explore code is still in the file', /function ExploreSection\(/.test(home));
check('and it is commented out, not rendered',
  /LEGACY EXPLORE SECTION — PRESERVED/.test(home));
check('Company Explorer took its slot', /<CompanyExplorer \/>/.test(home));
/* ContentDiscoveryStrip was explicitly to be left alone. */
check('ContentDiscoveryStrip is untouched',
  /\n\s+<ContentDiscoveryStrip onPublish=/.test(home));

/* The homepage endpoint must stay cheap: identity + count only. */
const publicRoute = read('app/api/company-explorer/route.ts');
check('the strip endpoint runs no ATS', !/evaluateJobMatch|recommendMatch|evaluateAts/.test(publicRoute));
check('and never reads the job corpus', !/getPublishedHiringJobs|getHiringJobs/.test(publicRoute));
check('it uses the projected company list', /getHiringCompanies/.test(publicRoute));
check('and batches its two independent reads', /Promise\.all/.test(publicRoute));

/* Ranking happens only after a company is chosen, and reuses the engine. */
const jobsRoute = read('app/api/company-explorer/[companyId]/jobs/route.ts');
check('the company route reuses the existing scorer', /recommendMatch/.test(jobsRoute));
check('and the existing profile builder', /buildRecProfile/.test(jobsRoute));
check('it does not reimplement scoring', !/skillScore|roleScore|0\.45|weights/i.test(jobsRoute));
check('jobs are ordered descending by match',
  /\(b\.match\?\.score \?\? 0\) - \(a\.match\?\.score \?\? 0\)/.test(jobsRoute));
check('with a deterministic tie-break', /localeCompare/.test(jobsRoute));
check('an unscored viewer gets no fabricated score', /hasProfileSignals/.test(jobsRoute));
check('insights are omitted when nothing was scored', /withScores\.length > 0/.test(jobsRoute));
/* A company can hold a thousand postings; the response must not carry them. */
check('the company route paginates', /paginate\(ranked/.test(jobsRoute));
check('it ranks BEFORE paging, so order is over the whole company',
  jobsRoute.indexOf('ranked.sort(') < jobsRoute.indexOf('paginate(ranked'));
check('it serializes only the page', /page\.items\.map/.test(jobsRoute));
check('the reported jobCount is the real total, not the page',
  /jobCount: page\.total/.test(jobsRoute));
check('insights cover the whole company, not the page',
  /ranked\.filter\(\(r\) => typeof r\.match/.test(jobsRoute));

/* Authorization is server-side and allow-listed. */
const adminRoute = read('app/api/super-admin/company-explorer/route.ts');
check('the admin route checks the session on GET and PATCH',
  (adminRoute.match(/getSuperAdminSessionFromRequest/g) ?? []).length >= 2);
check('it refuses an invalid session', /session\.valid/.test(adminRoute));
check('it never trusts a client admin flag', !/body\.(isAdmin|admin|superAdmin)/.test(adminRoute));
check('the write is an allow-list, not spread-then-delete',
  !/\.\.\.raw|\.\.\.e\b/.test(adminRoute) && /const id = logoKey/.test(adminRoute));
check('position comes from the array, not the body', /order: index/.test(adminRoute));

/* Logos must never be recoloured by the theme. */
/* The white plate now lives in ONE place — the shared CompanyLogo component —
   so each surface is checked for delegating to it rather than for repeating
   the colour itself. One definition is the stronger guarantee. */
const logoComponent = read('components/jobs/company/CompanyLogo.tsx');
check('CompanyLogo puts the mark on a permanently white plate',
  /background: '#FFFFFF'/.test(logoComponent));
check('CompanyLogo applies no theme filter to the mark',
  !/filter\s*:|grayscale\(|invert\(|brightness\(/.test(logoComponent));
for (const f of ['components/jobs/company/CompanyExplorer.tsx',
                 'components/jobs/company/CompanyJobsView.tsx',
                 'components/jobs/company/CompanyExplorerManageModal.tsx']) {
  const src = read(f);
  check(`${f.split('/').pop()} renders logos through CompanyLogo`, /<CompanyLogo\b/.test(src));
  check(`${f.split('/').pop()} applies no filter of its own`,
    !/filter:\s*(grayscale|invert|brightness)|grayscale\(|invert\(/.test(src));
}

/* The rail scrolls horizontally only, and cannot widen the page.

   These rules moved OUT of an inline <style> in the component and into
   company-explorer.css: React compares a style element's text when hydrating,
   and the server and client emitted that block with different whitespace, so
   every page carrying the strip logged a hydration mismatch. The rules are
   unchanged — only their address is — so this reads the stylesheet. */
const strip = read('components/jobs/company/CompanyExplorer.tsx');
const railCss = read('components/jobs/company/company-explorer.css');
check('the component imports its own stylesheet', /company-explorer\.css/.test(strip));
check('and keeps no inline <style> to mismatch on hydration', !/<style>/.test(strip));
for (const rule of ['overflow-x:auto', 'overflow-y:hidden', 'touch-action:pan-x', 'overscroll-behavior-x:contain']) {
  check(`the rail sets ${rule}`, railCss.includes(rule));
}
check('the rail is width-capped so the body cannot scroll sideways', /max-width:100%/.test(railCss));
/* The first tile must start on the same line as the heading. */
check('the rail carries the same horizontal inset as the header row',
  /ce-rail[^"]*\bpx-2\b[^"]*\bsm:px-3\b/.test(strip));
check('and min-width:0 so a flex child cannot force it wider', /min-w-0/.test(strip));
/* ── The rail is cursor-driven; the arrow buttons are gone ──────────────── */

/* Comments are stripped so an assertion can never be satisfied by prose that
   merely MENTIONS the thing it is checking for. */
const stripCode = strip
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

check('there is no Next/Previous arrow button',
  !/aria-label="(Next|Previous) companies"/.test(stripCode));
check('and no chevron icon is imported for one',
  !/ChevronLeft|ChevronRight/.test(stripCode));
check('so no arrow-position state survives',
  !/atStart|atEnd|nudge/.test(stripCode));

check('the cursor scrolls the rail via a wheel listener',
  /addEventListener\('wheel'/.test(stripCode));
check('the listener is non-passive so it can preventDefault',
  /\{ passive: false \}/.test(stripCode) && /preventDefault\(\)/.test(stripCode));
check('it is bound to the rail, so it fires only under the cursor',
  /el\.addEventListener\('wheel'/.test(stripCode) && /railRef\.current/.test(stripCode));
check('and it is removed on unmount',
  /removeEventListener\('wheel'/.test(stripCode));

/* "No latency" is a claim about the code: a direct assignment, never an
   animation. A single `behavior: 'smooth'` would falsify it. */
check('the rail is moved by direct assignment, not an animation',
  /el\.scrollLeft = /.test(stripCode));
check('nothing on the rail scrolls smoothly',
  !/behavior:\s*'smooth'/.test(stripCode) && /scroll-behavior:auto/.test(railCss));

/* End to end, and never trapping the page at either end. */
check('travel is clamped to the real scrollable range',
  /Math\.min\(max, el\.scrollLeft \+ delta\)/.test(stripCode)
  && /scrollWidth - el\.clientWidth/.test(stripCode));
check('at either end the gesture is left to the page',
  /if \(!room\) return;/.test(stripCode));
check('a horizontal gesture is left to the browser',
  /Math\.abs\(e\.deltaX\) > Math\.abs\(e\.deltaY\)/.test(stripCode));
check('line and page wheel units are converted to pixels',
  /deltaMode === 1/.test(stripCode) && /deltaMode === 2/.test(stripCode));

/* The job count is the highlighted element on a tile. */
check('the job count is highlighted, not muted',
  /formatCompanyJobCount\(c\.jobCount\)/.test(stripCode)
  && /font-extrabold tabular-nums/.test(stripCode));
check('and the highlight reuses the strip accent, not a new colour',
  (stripCode.match(/167,139,250/g) ?? []).length >= 2);

/* Manage is drawn client-side but never authorizes anything. */
check('the strip only DRAWS Manage from canManage', /canManage &&/.test(strip));
check('and canManage is not cached with the public payload',
  /outside the cached block/i.test(read('app/api/company-explorer/route.ts')));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
