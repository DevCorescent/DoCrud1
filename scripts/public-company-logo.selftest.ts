/**
 * Phase 8 — admin-uploaded logos reach public job cards.
 *
 *   npx tsx scripts/public-company-logo.selftest.ts
 *
 * ═══ THE SPLIT THIS CLOSES ═══
 *
 * Two logo systems existed and never met. The full-priority resolver
 * (admin_upload -> verified -> source -> website) had exactly ONE caller: the
 * Super Admin scraper console. Every public job card used a static list
 * compiled into the client bundle. So an uploaded logo was visible to the admin
 * who uploaded it and to nobody else.
 *
 * MEASURED on the live corpus: 7 overrides already existed — AECOM, Nagarro,
 * TaskUs, Check Point, LinkedIn, Microsoft, Sarvam AI — covering 3,444
 * postings that all rendered initials.
 *
 *   before   555 / 7,104  (7.8%)
 *   after  3,999 / 7,104  (56.3%)
 *
 * No network, no new storage, no scrape: the files were already uploaded.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { adminLogoFor, attachAdminLogos } from '@/lib/server/company-logo-public';
import type { CompanyLogoOverrides } from '@/lib/company-logo-uploads';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const OVERRIDES = {
  aecom: { url: 'https://cdn.example/aecom.png', name: 'AECOM' },
  checkpointsoftwaretechnologies: { url: 'https://cdn.example/cp.png', name: 'Check Point' },
  blankurl: { url: '', name: 'Blank' },
} as unknown as CompanyLogoOverrides;

function identity() {
  console.log('\n── 1. Company identity matches the way the rest of the system does ──');
  check('an exact name matches', adminLogoFor(OVERRIDES, 'AECOM') === 'https://cdn.example/aecom.png');
  check('case is irrelevant', adminLogoFor(OVERRIDES, 'aecom') === 'https://cdn.example/aecom.png');

  /* logoKey strips punctuation and spaces, so the display name a source
     returns still finds the file an admin uploaded. */
  check('spaces and punctuation are ignored',
    adminLogoFor(OVERRIDES, 'Check Point Software Technologies') === 'https://cdn.example/cp.png');
  check('an unknown company yields nothing',
    adminLogoFor(OVERRIDES, 'Totally Unknown Co') === undefined);
  check('an empty name yields nothing', adminLogoFor(OVERRIDES, '') === undefined);
  check('a null name yields nothing', adminLogoFor(OVERRIDES, null) === undefined);

  /* A stored-but-empty url is not a logo. Returning '' would give the card a
     value it must then know to disbelieve. */
  check('an empty stored url is treated as absent',
    adminLogoFor(OVERRIDES, 'blankurl') === undefined);
}

async function attaching() {
  console.log('\n── 2. Attaching to a page of jobs ──');
  const rows = [
    { id: '1', organizationName: 'AECOM' },
    { id: '2', organizationName: 'Stripe' },
    { id: '3' },
  ];
  const out = await attachAdminLogos(rows as never, async () => OVERRIDES) as Array<Record<string, unknown>>;

  check('a company with an override gets a url', typeof out[0].companyLogoUrl === 'string');
  /* Absent, not empty-string: the card falls through to its static list, which
     is how Stripe keeps the logo it already had. */
  check('a company without one is left untouched',
    !('companyLogoUrl' in out[1]));
  check('a row with no company name does not throw',
    !('companyLogoUrl' in out[2]));
  check('row identity is preserved', out[0].id === '1' && out[1].id === '2');
  check('an empty page is returned as-is',
    (await attachAdminLogos([], async () => OVERRIDES)).length === 0);
}

function publicPathIsCheap() {
  console.log('\n── 3. The public path stays cheap ──');
  const src = read('lib/server/company-logo-public.ts');

  /* The resolver verifies candidates over the network. Putting that on a public
     feed would mean third-party HTTP on every listing request, with a cold
     cache per PM2 worker. */
  check('it never calls the network-verifying resolver',
    !src.includes('resolveCompanyLogo'));
  check('it performs no fetch', !/fetch\(/.test(src));
  /* The load happens ONCE, above the map — not inside it. A 20-row feed must
     not become 20 reads of the same configuration document. */
  check('it reads configuration once per page, not once per job',
    /await loadOverrides\(\)[\s\S]{0,400}jobs\.map/.test(src));
  check('the load is not inside the per-job callback',
    !/jobs\.map\([\s\S]{0,200}await loadOverrides/.test(src));
  check('a page with no overrides configured rebuilds nothing',
    src.includes('if (Object.keys(overrides).length === 0) return jobs as T[];'));

  const route = read('app/api/jobs/public/route.ts');
  check('the public route attaches them', route.includes('attachAdminLogos'));
  check('production uses the real loader by default',
    src.includes('= getAdminLogoOverrides,'));
}

function precedenceAndFallback() {
  console.log('\n── 4. Precedence, and the card still cannot change size ──');
  const card = read('components/jobs/JobSummaryCard.tsx');

  /* Same precedence the server-side resolver applies: a human's choice beats an
     automatic one. */
  check('an admin override outranks the built-in list',
    /overrideUrl\s*\?\s*\{ src: overrideUrl/.test(card));
  check('the built-in list remains the fallback', card.includes('getCompanyLogo(company)'));
  check('the override is passed from the job row',
    card.includes('overrideUrl={job.companyLogoUrl}'));

  /* The card's dimensions must not depend on whether an image loaded. */
  const box = card.match(/const box = '([^']+)'/)?.[1] ?? '';
  check('the logo box keeps fixed dimensions',
    box.includes('h-10 w-10') && box.includes('sm:h-12 sm:w-12'), box);
  check('a broken image still falls back to initials', card.includes('onError={() => setFailed(true)}'));
  check('the initials branch is unchanged', card.includes('const initials = company.split'));

  /* Phase 8 must not have touched the card's structure. */
  check('the title still clamps to two lines', card.includes('line-clamp-2'));
}

function noFabrication() {
  console.log('\n── 5. Nothing is invented ──');
  const src = read('lib/server/company-logo-public.ts');
  check('no logo is derived from a company name',
    !/favicon|\/logo\.png|clearbit|google\.com\/s2/.test(src));
  check('no placeholder image is substituted',
    !/placeholder|default\.png|dummy/i.test(src));
  check('it only reads; it never writes an override',
    !/writeJsonFile|uploadToR2|updateOne|set\(/.test(src));
}

async function main() {
  identity();
  await attaching();
  publicPathIsCheap();
  precedenceAndFallback();
  noFabrication();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
