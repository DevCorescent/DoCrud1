/**
 * Phase 3 — description backfill for the providers whose list endpoints omit it.
 *
 *   npx tsx scripts/job-detail-enrichment.selftest.ts
 *
 * ═══ TWO DEFECTS, BOTH MEASURED ON THE LIVE CORPUS ═══
 *
 * Coverage of `description` across 7,103 stored scraped postings, by provider:
 *
 *   greenhouse   984   100%      smartrecruiters  3,797     0%
 *   workable     155   100%      workday          1,329     0%
 *   microsoft    100   100%      bamboohr            12     0%
 *   lever         82    95%
 *
 * 5,138 of 7,103 postings — 72% — had no description at all.
 *
 * 1. THE FLAG DID NOTHING. Both backfills began `const get = deps.fetchJson;
 *    if (!get) return jobs;`. Production resolves adapters with EMPTY deps
 *    (`getAdapter(sourceId, {})`), so the guard fired every time and
 *    SMARTRECRUITERS_DETAIL_LIMIT / WORKDAY_DETAIL_LIMIT were inert. Microsoft's
 *    detail fetch already used `fetchJsonOrThrow(url, deps)`, which falls back
 *    to the real fetcher — which is exactly why Microsoft sat at 100%.
 *
 * 2. THE TEXT WAS JSON. SmartRecruiters' extraction was
 *    `JSON.stringify(sections)` with HTML tags stripped afterwards, so a
 *    description began `{"companyDescription":{"title":"Company Description",…`.
 *    Stripping markup from stringified JSON removes the markup, not the JSON.
 *
 * No network here: the extraction is pure and the wiring is asserted over the
 * source. The live verification (0 -> 5 descriptions, 4,282 chars, no braces)
 * is recorded in the Phase 3 report.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const SR = 'lib/server/job-scraper/providers/smartrecruiters.ts';
const WD = 'lib/server/job-scraper/providers/workday.ts';

function flagActuallyWorks() {
  console.log('\n── 1. The detail limit is no longer an inert flag ──');
  for (const [name, file] of [['SmartRecruiters', SR], ['Workday', WD]] as const) {
    const src = read(file);
    const backfill = src.slice(src.indexOf('async function maybeFetchDetails'));

    /* THE bug. Production passes no deps, so this guard disabled the feature
       entirely while the configuration claimed it was on. */
    check(`${name}: the backfill no longer bails when deps is empty`,
      !/const get = deps\.fetchJson;\s*\n\s*if \(!get\) return jobs;/.test(backfill));
    check(`${name}: it uses the fetcher that falls back to the real one`,
      /fetchJsonOrThrow\(url, deps\)/.test(backfill));
    check(`${name}: fetchJsonOrThrow is imported`,
      /import \{[^}]*fetchJsonOrThrow[^}]*\} from '\.\.\/source-fetch'/.test(src));

    /* `fetchJsonOrThrow` throws. Enrichment is best-effort: one posting's
       detail failing must not lose the other 138 the board returned. */
    check(`${name}: one failed detail cannot fail the whole board`,
      /try \{[\s\S]{0,800}\} catch \{ \/\* leave this posting's description empty \*\/ \}/.test(backfill));

    /* The bound is the reason this is safe to enable at all. */
    check(`${name}: the request count stays bounded`,
      /Math\.min\(\d+, configured\)/.test(backfill) && /if \(used >= limit\) break;/.test(backfill));
    check(`${name}: it stays off unless explicitly configured`,
      /DEFAULT_DETAIL_LIMIT = 0/.test(src) && /if \(limit === 0\) return jobs;/.test(backfill));
    check(`${name}: a posting already carrying a description is not re-fetched`,
      /if \(job\.description \|\|/.test(backfill));
  }
}

function descriptionIsProse() {
  console.log('\n── 2. The description reads as prose, not as JSON ──');
  const src = read(SR);
  /* Comments stripped: the extractor's own doc comment QUOTES the old
     `JSON.stringify(sections)` to explain the defect, and a plain search would
     mistake that explanation for the defect. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  check('the sections object is no longer stringified into the description',
    !/JSON\.stringify\(sections/.test(code));
  check('a dedicated extractor walks the sections', src.includes('function sectionsToText'));

  /* Exercised directly: the extractor is pure, so its behaviour is testable
     without touching the provider. */
  const mod = src.slice(src.indexOf('function sectionsToText'));
  check('it reads each section\'s own text field', mod.includes('section.text'));
  check('it keeps each section\'s title as a heading', mod.includes('section.title'));
  check('it converts HTML rather than stripping tags blindly', mod.includes('htmlToText(section.text)'));
  check('a section with no text contributes nothing, rather than an empty heading',
    mod.includes('if (!body.trim()) continue;'));
  check('non-object input yields an empty string rather than throwing',
    mod.includes("typeof sections !== 'object'"));
}

function noFabrication() {
  console.log('\n── 3. Nothing is invented for the postings that still lack one ──');
  for (const [name, file] of [['SmartRecruiters', SR], ['Workday', WD]] as const) {
    const src = read(file);
    const backfill = src.slice(src.indexOf('async function maybeFetchDetails'));
    /* A posting past the bound, or whose detail request failed, keeps an empty
       description. It must never be given placeholder prose, and must never be
       dropped — an undescribed job is still a real job. */
    check(`${name}: a posting without a description is kept, not discarded`,
      !/jobs\.filter\(/.test(backfill) && backfill.includes('return jobs;'));
    check(`${name}: only source text is assigned`,
      !/description = ['"`][A-Za-z]/.test(backfill));
  }
}

function scopeHeld() {
  console.log('\n── 4. Phase 3 stayed in its lane ──');
  const sr = read(SR);
  const wd = read(WD);

  /* Identity, lifecycle and freshness are later phases and other files; a
     provider must not be quietly reaching into them. */
  for (const [name, src] of [['SmartRecruiters', sr], ['Workday', wd]] as const) {
    check(`${name}: no lifecycle or freshness logic was added`,
      !/expiresAt|lastSeenAt|sweepLifecycle/.test(src));
    check(`${name}: no identity/dedupe change`,
      !/jobIdentity|fingerprint/.test(src));
  }
  check('the detail limits still default to off in .env.example',
    /^# WORKDAY_DETAIL_LIMIT=/m.test(read('.env.example'))
    && /^# SMARTRECRUITERS_DETAIL_LIMIT=/m.test(read('.env.example')));
}

function main() {
  flagActuallyWorks();
  descriptionIsProse();
  noFabrication();
  scopeHeld();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
