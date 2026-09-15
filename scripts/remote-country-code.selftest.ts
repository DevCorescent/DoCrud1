/**
 * A two-letter country code counts only where it cannot mean anything else.
 *
 *   npx tsx scripts/remote-country-code.selftest.ts
 *
 * ═══ WHAT THIS RECOVERS ═══
 *
 * Several boards write a remote posting's country as a bare ISO code. In the
 * production corpus:
 *
 *     "Remote, in"   340 postings — every one of them Nagarro
 *     "Remote, us"    61     "Remote, de"  31     "Remote, lk"  28
 *     "Remote, ph"    17     "Remote, za"   7     "Remote, cn"   7
 *
 * `lk`, `ph`, `za` and `cn` have no reading but Sri Lanka, the Philippines,
 * South Africa and China — which is what establishes the trailing token as a
 * country code rather than a word. All 340 Indian ones previously classified as
 * "could not tell".
 *
 * ═══ THE DANGER THIS GUARDS ═══
 *
 * `in` is an English preposition far more often than it is India. A rule loose
 * enough to read "Engineer in Berlin" as an Indian job would corrupt
 * classification across the whole corpus in the quietest possible way — no
 * error, just wrong countries. So the match is anchored to the WHOLE string:
 * `remote`, one separator, exactly two letters, end.
 *
 * Pure. No database, no network.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyLocation } from '@/lib/server/job-sources/location';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}
const c = (loc: string) => classifyLocation(loc);

function recognisedShapes() {
  console.log('\n── 1. The explicit remote-country form ──');
  for (const loc of ['Remote, in', 'Remote - in', 'Remote: in', 'Remote — in', 'Remote, IN']) {
    const p = c(loc);
    check(`${JSON.stringify(loc)} → IN / india`, p.country === 'IN' && p.isIndia === true,
      `${p.country}/${p.isIndia}`);
  }
  for (const [loc, code] of [['Remote, us', 'US'], ['Remote, lk', 'LK'], ['Remote, ph', 'PH'],
    ['Remote, za', 'ZA'], ['Remote, de', 'DE']] as const) {
    const p = c(loc);
    check(`${JSON.stringify(loc)} → ${code}, not india`,
      p.country === code && p.isIndia === false, `${p.country}/${p.isIndia}`);
  }
}

function unstatedStaysUnknown() {
  console.log('\n── 2. No country stated means no country claimed ──');
  /* "we could not tell" and "definitely not India" are different facts, and the
     classifier has always kept them apart. A region that is not a country
     must not become one. */
  for (const loc of ['Remote', 'Remote - worldwide', 'Remote - APAC', 'Hybrid', 'Remote, EMEA']) {
    const p = c(loc);
    check(`${JSON.stringify(loc)} stays undetermined`,
      p.country === undefined && p.isIndia === undefined, `${p.country}/${p.isIndia}`);
  }
}

function prepositionIsNotACountry() {
  console.log('\n── 3. THE dangerous case: bare "in" is a preposition ──');
  /* If any of these ever classify as India, the rule has been loosened past
     the one position where two letters are unambiguous. */
  for (const loc of ['Engineer in Berlin', 'in', 'Based in London', 'Work in Toronto',
    'Hybrid in Munich', 'Remote work in Spain']) {
    const p = c(loc);
    check(`${JSON.stringify(loc)} is NOT india`, p.isIndia !== true, `isIndia=${p.isIndia}`);
  }
  /* Only the whole string counts — a code embedded in a longer location is not
     in the unambiguous position. */
  for (const loc of ['Remote, US; Remote, IN', 'Remote, in extra', 'Remote, in / Remote, us']) {
    check(`${JSON.stringify(loc)} is not matched by the narrow rule`, c(loc).isIndia !== true);
  }
}

function invalidCodesRejected() {
  console.log('\n── 4. Only real regions are accepted ──');
  /* Intl decides, so no ISO table is duplicated. An invalid code echoes itself
     back; ZZ is reserved for "Unknown Region" and must not become a country. */
  for (const loc of ['Remote, zz', 'Remote, xx', 'Remote, qq', 'Remote, aa']) {
    const p = c(loc);
    check(`${JSON.stringify(loc)} yields no country`, p.country === undefined, String(p.country));
  }
}

function existingBehaviourUnchanged() {
  console.log('\n── 5. Everything that already worked still works ──');
  for (const [loc, country, india] of [
    ['India', 'IN', true], ['Bengaluru', 'IN', true], ['Bangalore', 'IN', true],
    ['Bombay', 'IN', true], ['Gurgaon', 'IN', true], ['Remote - India', 'IN', true],
    ['United States', 'US', false], ['UK', 'GB', false], ['Singapore', 'SG', false],
    ['UAE', 'AE', false],
  ] as const) {
    const p = c(loc);
    check(`${JSON.stringify(loc)} unchanged`, p.country === country && p.isIndia === india,
      `${p.country}/${p.isIndia}`);
  }
}

function ruleIsNarrowInSource() {
  console.log('\n── 6. The rule is anchored, not a token search ──');
  const src = readFileSync('lib/server/job-sources/location.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('the pattern is anchored at both ends', /\^\\s\*remote[\s\S]{0,60}\$\/i/.test(src));
  check('it accepts exactly two letters', /\[a-z\]\{2\}/.test(src));
  check('the region is validated by Intl, not a hand-written table',
    src.includes('Intl.DisplayNames') && src.includes("type: 'region'"));
  check('the reserved ZZ is excluded', /code === 'ZZ'/.test(src));
  check('an echoed (invalid) code is rejected', /name === code \? null : code/.test(src));
  check('the existing token table is still the only other route',
    src.includes('COUNTRY_TOKENS'));
}

function classificationDoesNotRank() {
  console.log('\n── 7. Classification is not a ranking signal ──');
  /* India affects WHICH FACTS a job carries, never what it scores. If this ever
     changes it must be a deliberate product decision, not a side effect of a
     location parser. */
  const rec = readFileSync('lib/server/job-recommend.ts', 'utf8');
  check('the scorer has no India branch', !/isIndia|isIndiaRelevant|indiaBucket/.test(rec));
  check('and uses indiaCity only for alias matching',
    rec.includes('indiaCity(jobLoc)') && !/india[\s\S]{0,40}\+=/i.test(rec));
  for (const f of ['lib/server/job-sources/ats-match.ts', 'lib/server/job-sources/eligibility.ts']) {
    check(`${f.split('/').pop()} has no India rule`,
      !/isIndia|indiaBucket|isIndiaRelevant/.test(readFileSync(f, 'utf8')));
  }
}

function main() {
  recognisedShapes();
  unstatedStaysUnknown();
  prepositionIsNotACountry();
  invalidCodesRejected();
  existingBehaviourUnchanged();
  ruleIsNarrowInSource();
  classificationDoesNotRank();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
