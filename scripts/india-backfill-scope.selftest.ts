/**
 * The India re-normalisation writes two fields and derives them from the
 * classifier the application actually uses.
 *
 *   npx tsx scripts/india-backfill-scope.selftest.ts
 *
 * ═══ WHAT THIS PROTECTS ═══
 *
 * A backfill that recomputes stored data has two failure modes, and both are
 * silent:
 *
 *   1. SCOPE CREEP. The location classifier owns eight derived fields. Writing
 *      `workMode` would be wrong — `resolveWorkMode` needs the SOURCE's own
 *      value and the stored field is already the resolved result, so
 *      recomputing from it changes what work-mode filters return.
 *      `domainConfidence` backs `_skRelevance`, a live public sort key. Only
 *      `country` and `isIndia` are safe, and only those are written.
 *
 *   2. DRIFT. If the script reimplemented the classification rules, the stored
 *      value could come to disagree with what ingestion writes for the same
 *      text — which is the defect this backfill exists to remove. So it imports
 *      `classifyLocation`. That is also why the file is .ts: the sort-key
 *      backfill beside it is .mjs, cannot resolve the `@/` alias, and had to
 *      inline its derivation.
 *
 * Applied run, production: 1,035 documents, 0 failed — 797 explicit
 * remote-country-code, 238 stale. All `absent -> definite`; zero judgements
 * overwritten. Independent verify: PASS.
 *
 * Source-level. No database, no network, no writes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const PATH = 'scripts/db-backfill-india-classification.ts';
const RAW = readFileSync(PATH, 'utf8');
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function writesTwoFieldsOnly() {
  console.log('\n── 1. The write touches country and isIndia, nothing else ──');
  const set = Array.from(SRC.matchAll(/\$set\.(\w+)\s*=/g)).map((m) => m[1]);
  const unset = Array.from(SRC.matchAll(/\$unset\.(\w+)\s*=/g)).map((m) => m[1]);
  check('$set writes only country and isIndia',
    set.sort().join(',') === 'country,isIndia', set.join(','));
  check('$unset clears only country and isIndia',
    unset.sort().join(',') === 'country,isIndia', unset.join(','));

  /* THE scope regression. Each of these is classifier-owned and each would be
     wrong to rewrite here, for its own reason. */
  for (const field of ['workMode', 'domainConfidence', 'domain', 'scores',
    '_skNewest', '_skSalary', '_skRelevance', 'city', 'state', 'cities',
    'title', 'description', 'salary', 'postedAt', 'createdAt', 'indiaBucket']) {
    check(`${field} is never written`,
      !new RegExp(`\\$(set|unset)\\.${field}\\b`).test(SRC));
  }
}

function derivationIsImported() {
  console.log('\n── 2. One implementation of the rules ──');
  check('the real classifier is imported',
    /import \{ classifyLocation \} from '@\/lib\/server\/job-sources\/location'/.test(SRC));
  check('and is what decides each document', /classifyLocation\(loc\)/.test(SRC));
  /* If the rules were copied, the copy could drift from ingestion. */
  check('no country table is redefined here', !/COUNTRY_TOKENS|CITY_CANON/.test(SRC));
  check('no India predicate is redefined here', !/function isIndiaRelevant/.test(SRC));
}

function readsOnlyWhatItDecidesOn() {
  console.log('\n── 3. It reads four fields and judges on one ──');
  const proj = /projection: \{([^}]*)\}/.exec(SRC)?.[1] ?? '';
  const fields = Array.from(proj.matchAll(/(\w+):\s*1/g)).map((m) => m[1]).sort();
  check('the projection is _id, location, country, isIndia',
    fields.join(',') === '_id,country,isIndia,location', fields.join(','));
  check('the location text is taken from the document',
    /const loc = String\(doc\.location \?\? ''\)/.test(SRC));
  check('and is the only input to the decision', /classifyLocation\(loc\)/.test(SRC));
  /* Nothing else on the document may influence the outcome. */
  check('no other document field is consulted',
    !/doc\.(title|description|workMode|domain|salary|source|city|state)\b/.test(SRC));
}

function safeToRunTwice() {
  console.log('\n── 4. Idempotent, resumable, bounded ──');
  check('a document already agreeing is skipped',
    /if \(sameIndia && sameCountry\) \{/.test(SRC));
  check('batched by ascending _id so it can resume',
    /\$gt: cursorId/.test(SRC) && /sort\(\{ _id: 1 \}\)/.test(SRC));
  check('the batch is bounded', /limit\(BATCH\)/.test(SRC) && /const BATCH = \d+/.test(SRC));
  check('writes are unordered so one failure does not halt the pass',
    /ordered: false/.test(SRC));
}

function writesAreDeliberate() {
  console.log('\n── 5. Nothing is written unless asked ──');
  check('dry run is the default', /const APPLY = process\.argv\.includes\('--apply'\)/.test(SRC));
  check('bulkWrite runs only under --apply and not --verify',
    /if \(ops\.length && APPLY && !VERIFY\)/.test(SRC));
  check('a verify pass cannot write', /const VERIFY = process\.argv\.includes\('--verify'\)/.test(SRC));
  check('only the published corpus is scanned', /status: 'published'/.test(SRC));
  check('it targets the canonical collection only', /collection\('hiring_jobs'\)/.test(SRC)
    && !/collection\('app_state'\)|recommendation_results|hiring_applications/.test(SRC));
}

function rollbackExists() {
  console.log('\n── 6. Every change is recorded before it is made ──');
  check('a ledger entry carries the previous values', /from: \{ country: doc\.country/.test(SRC));
  check('and the new ones', /to: \{ country: derived\.country/.test(SRC));
  check('and which rule decided it', /group: REMOTE_CODE\.test\(loc\) \? 'A' : 'B'/.test(SRC));
  check('the ledger is written only on a real apply',
    /if \(APPLY && !VERIFY && ledger\.length\)/.test(SRC));
  /* An operational rollback record is not source. */
  check('the ledger path is gitignored',
    readFileSync('.gitignore', 'utf8').includes('data/india-backfill-ledger-*.json'));
}

function main() {
  writesTwoFieldsOnly();
  derivationIsImported();
  readsOnlyWhatItDecidesOn();
  safeToRunTwice();
  writesAreDeliberate();
  rollbackExists();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
