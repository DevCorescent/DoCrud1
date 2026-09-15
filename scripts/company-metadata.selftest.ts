/**
 * Phase 8.2 — operator-supplied company metadata.
 *
 *   npx tsx scripts/company-metadata.selftest.ts
 *
 * ═══ NO NEW COMPANY MODEL ═══
 *
 * The audit found `lib/company-explorer.ts` already IS the hiring-company
 * representation. Its own header says so: identity is `logoKey(name)` — "the
 * SAME normalization the logo registry and hiring-companies grouping already
 * use" — and it "introduces NO new company model". `websiteUrl` was already an
 * operator-supplied field there, documented as never derived.
 *
 * So 8.2 added two fields to an existing entry rather than a `hiring_companies`
 * collection. A second company model would have split identity across two
 * stores, and identity is the one thing this feature had already solved.
 *
 * ═══ WHAT IS DELIBERATELY ABSENT ═══
 *
 * employeeCount, employee range, size band. Phase 4 measured that NO configured
 * ATS provider exposes them. An empty field invites someone to fill it by
 * inference, and inferring headcount from job volume is the specific mistake
 * that was ruled out: 1,214 open postings is 1,214 open postings.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeCompanyExplorerConfig } from '@/lib/company-explorer';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const norm = (items: unknown[]) => normalizeCompanyExplorerConfig({ items });

function storedWhenGiven() {
  console.log('\n── 1. What an operator types is kept ──');
  const [e] = norm([{
    name: 'Razorpay', industry: 'FinTech', headquarters: 'Bengaluru, India',
    websiteUrl: 'https://razorpay.com',
  }]).items;

  check('industry is stored', e.industry === 'FinTech');
  check('headquarters is stored', e.headquarters === 'Bengaluru, India');
  check('website still works', e.websiteUrl === 'https://razorpay.com');
  /* The same identity the scraper, the logo registry and the job grouping use,
     so metadata attaches to the employer the corpus already knows. */
  check('identity is logoKey, shared with the rest of the system', e.id === 'razorpay');
}

function blankIsAbsent() {
  console.log('\n── 2. Blank clears; it does not store an empty value ──');
  const [e] = norm([{ name: 'Blank Co', industry: '   ', headquarters: '' }]).items;
  check('whitespace-only industry is dropped', e.industry === undefined);
  check('empty headquarters is dropped', e.headquarters === undefined);
  /* An operator must be able to REMOVE a value they no longer stand behind,
     and a reader must not have to test for '' as well as undefined. */
  check('the company itself survives', e.id === 'blankco');
}

function bounded() {
  console.log('\n── 3. Values are bounded ──');
  const [e] = norm([{ name: 'Long', industry: 'x'.repeat(500), headquarters: 'y'.repeat(500) }]).items;
  /* The homepage reads this document on every request; one pasted article must
     not become part of it. */
  check('industry is capped at 80', e.industry!.length === 80, String(e.industry!.length));
  check('headquarters is capped at 120', e.headquarters!.length === 120, String(e.headquarters!.length));
}

function provenance() {
  console.log('\n── 4. Provenance proves something or is absent ──');
  const [good] = norm([{ name: 'A', industry: 'SaaS', metadataUpdatedAt: '2026-09-14T10:00:00Z', metadataUpdatedBy: 'ops@docrud.com' }]).items;
  check('a valid stamp is kept', good.metadataUpdatedAt === '2026-09-14T10:00:00Z');
  check('the editor is kept', good.metadataUpdatedBy === 'ops@docrud.com');

  /* A stamp that does not parse reads as provenance while proving nothing —
     worse than having none. */
  const [bad] = norm([{ name: 'B', industry: 'SaaS', metadataUpdatedAt: 'not-a-date' }]).items;
  check('an unparseable stamp is dropped', bad.metadataUpdatedAt === undefined);

  /* The client must not be able to claim who verified something. */
  const route = read('app/api/super-admin/company-explorer/route.ts');
  check('provenance is set from the session, not the request body',
    route.includes('metadataUpdatedBy: session.email')
    && !/metadataUpdatedBy:\s*String\(e\./.test(route));
  check('the timestamp is server-generated',
    /metadataUpdatedAt: new Date\(\)\.toISOString\(\)/.test(route));
}

function provenanceOnlyOnChange() {
  console.log('\n── 4b. Provenance moves only when a value changes ──');
  const route = read('app/api/super-admin/company-explorer/route.ts');

  /* A reorder or a visibility toggle must not re-date every company's
     metadata as though a human had just reviewed it. */
  check('the previous metadata is read before items are built',
    route.indexOf('priorMeta') < route.indexOf('items.push'));
  check('a stamp is written only when industry or headquarters differs',
    /const changed = \(before\?\.industry \?\? ''\) !== industry/.test(route));
  check('an unchanged company carries its previous stamp forward',
    /before\?\.at \? \{ metadataUpdatedAt: before\.at \}/.test(route));
  check('clearing both values drops the stamp with them',
    route.includes('described, rather than claiming an edit to an empty field'));
}

function uiForm() {
  console.log('\n── 4c. The admin form exposes the fields ──');
  const ui = read('components/jobs/company/CompanyExplorerManageModal.tsx');

  check('there is an industry input', ui.includes("setMeta(c.id, 'industry'"));
  check('there is a headquarters input', ui.includes("setMeta(c.id, 'headquarters'"));
  /* The browser cap mirrors the server's, so a value cannot silently lose
     characters on save. */
  check('industry is capped at 80 in the browser too', ui.includes('maxLength={80}'));
  check('headquarters is capped at 120 in the browser too', ui.includes('maxLength={120}'));
  check('values commit on blur, not per keystroke', ui.includes('onBlur={commitMeta}'));

  /* The client must not be able to submit provenance. */
  check('the form never sets metadataUpdatedAt',
    !/metadataUpdatedAt:\s/.test(ui));
  check('the form never sets metadataUpdatedBy',
    !/metadataUpdatedBy:\s/.test(ui));
  check('provenance is displayed read-only', ui.includes('c.metadataUpdatedAt &&'));

  /* Phase 4's rule, enforced at the form. */
  for (const banned of ['employeeCount', 'sizeBand', 'headcount']) {
    check(`the form has no ${banned} field`, !ui.includes(banned));
  }

  /* The logo uploader already existed; 8.3 must not have replaced it. */
  check('the existing logo uploader is reused, not rebuilt',
    ui.includes('<CompanyLogoUploader'));
}

function allowList() {
  console.log('\n── 5. The write stays an explicit allow-list ──');
  const route = read('app/api/super-admin/company-explorer/route.ts');

  check('industry is named explicitly', route.includes("String(e.industry ?? '')"));
  check('headquarters is named explicitly', route.includes("String(e.headquarters ?? '')"));
  /* Spreading the body would let a caller set fields nobody vetted — including
     the provenance this route deliberately owns. */
  check('the request entry is never spread into the stored item',
    !/items\.push\(\{\s*\.\.\.e/.test(route));
  check('authorization is checked before anything is written',
    route.indexOf('getSuperAdminSessionFromRequest') < route.indexOf('items.push'));
}

function nothingInferred() {
  console.log('\n── 6. Nothing is inferred, and headcount stays out ──');
  const lib = read('lib/company-explorer.ts');
  const route = read('app/api/super-admin/company-explorer/route.ts');
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* Phase 4's conclusion, enforced: these must not exist as fields until a
     real source does. */
  for (const banned of ['employeeCount', 'employeeRange', 'sizeBand', 'headcount']) {
    check(`${banned} is not a field`, !code(lib).includes(banned) && !code(route).includes(banned));
  }

  /* The two inferences explicitly ruled out. */
  check('headquarters is not derived from job locations',
    !/headquarters\s*=\s*[^;]*\b(location|city|country)\b/i.test(code(lib) + code(route)));
  check('industry is not derived from job text',
    !/industry\s*=\s*[^;]*\b(description|title|keywords)\b/i.test(code(lib) + code(route)));
  check('no company size is computed from job counts',
    !/(size|employees)\s*=\s*[^;]*\b(jobCount|jobs\.length|count)\b/i.test(code(lib) + code(route)));
  check('website is still never guessed from the name',
    !/\.com['"`]|name\s*\+\s*['"`]\./.test(code(lib)));
}

function main() {
  storedWhenGiven();
  blankIsAbsent();
  bounded();
  provenance();
  provenanceOnlyOnChange();
  uiForm();
  allowList();
  nothingInferred();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
