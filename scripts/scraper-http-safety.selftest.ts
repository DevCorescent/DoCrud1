/**
 * Phase 1 — HTTP politeness and retry safety in the shared fetcher.
 *
 *   npx tsx scripts/scraper-http-safety.selftest.ts
 *
 * The scraper already had per-request timeouts, bounded retries, 401/403
 * respect and an 8 MB response cap. Two things it did NOT have, both found by
 * the Phase 1 audit and both fixed in the SHARED client rather than in a second
 * one:
 *
 *   1. `Retry-After` was ignored. A 429 was retried on the same blind
 *      exponential schedule as any other error — ~0.4 s — so the retry landed
 *      inside the window the provider had just asked us to wait out, was
 *      refused again, and burned the attempt budget without ever succeeding.
 *
 *   2. Backoff had no jitter, so every board hitting the same provider retried
 *      in lockstep. That matters more as the source list grows: a provider
 *      rate-limiting one board tends to rate-limit the rest.
 *
 * No network: these exercise the pure delay calculation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseRetryAfter, retryDelayMs, MAX_RETRY_AFTER_MS,
} from '@/lib/server/job-scraper/fetcher';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

/** A minimal stand-in for the parts of Response the delay logic reads. */
const withHeader = (v: string | null) => ({ headers: { get: () => v } });

function retryAfterParsing() {
  console.log('\n── 1. Retry-After, in both documented forms ──');
  const now = Date.parse('2026-09-14T12:00:00Z');

  check('delta-seconds is honoured', parseRetryAfter('5') === 5_000);
  check('surrounding whitespace is tolerated', parseRetryAfter('  5  ') === 5_000);
  check('an HTTP-date is honoured',
    parseRetryAfter(new Date(now + 10_000).toUTCString(), now) === 10_000);

  /* A date already in the past means "you may retry now" — not a negative
     delay, which would become an immediate hammering retry or worse. */
  check('a past HTTP-date clamps to zero rather than going negative',
    parseRetryAfter(new Date(now - 60_000).toUTCString(), now) === 0);

  /* Anything unparseable must fall back to backoff, never to 0 or NaN: a NaN
     delay passed to setTimeout fires immediately. */
  check('garbage falls back to backoff', parseRetryAfter('soon') === null);
  check('an empty header falls back to backoff', parseRetryAfter('') === null);
  check('an absent header falls back to backoff', parseRetryAfter(null) === null);
  check('a negative delta is not accepted', parseRetryAfter('-5') === null);
}

function delayPolicy() {
  console.log('\n── 2. The delay actually used ──');

  check('a 5s Retry-After is waited out in full',
    retryDelayMs(0, 400, withHeader('5')) === 5_000);

  /* A provider asking for an hour must not hold the worker hostage while other
     sources wait. Past the cap it is better to fail this source and let the
     next run retry it. */
  check('an hour-long Retry-After is clamped',
    retryDelayMs(0, 400, withHeader('3600')) === MAX_RETRY_AFTER_MS);
  check('the cap is shorter than a source is given to run',
    MAX_RETRY_AFTER_MS <= 30_000);

  const base = 400 * 2 ** 2;
  const samples = Array.from({ length: 300 }, () => retryDelayMs(2, 400, withHeader(null)));

  check('backoff still grows with the attempt number',
    retryDelayMs(0, 400, null) < base);
  /* Equal jitter: half fixed, half random. Never so short that it becomes a
     hammering retry, never longer than the backoff it replaces. */
  check('jitter never drops below half the backoff', Math.min(...samples) >= base / 2);
  check('jitter never exceeds the backoff', Math.max(...samples) <= base);
  check('retries are genuinely spread, not in lockstep',
    new Set(samples).size > 50, `${new Set(samples).size} distinct values`);
  check('every delay is a finite non-negative number',
    samples.every((d) => Number.isFinite(d) && d >= 0));
}

function wiring() {
  console.log('\n── 3. Every retry site uses the shared policy ──');
  const src = read('lib/server/job-scraper/fetcher.ts');

  /* The regression that matters: one hand-rolled `sleep(400 * 2 ** attempt)`
     reintroduces both faults at that call site alone, silently. */
  check('no deterministic backoff remains',
    !/sleep\(\d+ \* 2 \*\* attempt\)/.test(src));

  const statusSites = (src.match(/retryDelayMs\(attempt, \d+, res\)/g) || []).length;
  const allSites = (src.match(/retryDelayMs\(attempt, \d+/g) || []).length;
  check('every status-driven retry passes the response, so Retry-After is read',
    statusSites === 7, `${statusSites} of ${allSites} sites pass res`);
  check('the remaining sites are transport failures, which have no response',
    allSites - statusSites === 7, `${allSites - statusSites} catch-block retries`);

  /* Guards the audit confirmed were ALREADY correct. Asserted so Phase 1's
     changes cannot quietly remove them. */
  check('401/403 are still respected rather than retried or bypassed',
    /res\.status === 401 \|\| res\.status === 403/.test(src));
  check('the response size cap is still enforced', /MAX_JSON_BYTES/.test(src));
  check('the cap is checked on the body, not only the header',
    /text\.length > MAX_JSON_BYTES/.test(src));
  check('requests still carry an identifying User-Agent', /SCRAPER_UA/.test(src));
  check('retries remain bounded', /attempt < retries/.test(src));
  check('no second HTTP client was introduced',
    !/new HttpClient|axios|node-fetch/.test(src));
}

function noNewConfig() {
  console.log('\n── 4. No duplicate configuration was added ──');
  const src = read('lib/server/job-scraper/fetcher.ts');
  const example = read('.env.example');

  /* Phase 1 explicitly forbids parallel knobs: per-source timeout, retries and
     concurrency already exist via JOB_SOURCE_CONFIG. */
  for (const banned of ['JOB_SCRAPER_TIMEOUT', 'JOB_SCRAPER_RETRIES', 'JOB_SCRAPER_CONCURRENCY', 'JOB_SCRAPER_BATCH_SIZE']) {
    check(`${banned} was not introduced`,
      !src.includes(banned) && !example.includes(banned));
  }
  check('the existing per-source config remains the tuning surface',
    example.includes('JOB_SOURCE_CONFIG'));
  check('the existing batch-size variable is untouched',
    example.includes('INGEST_BULK_BATCH_SIZE') || read('lib/server/db/hiring-jobs-collection.ts').includes('INGEST_BULK_BATCH_SIZE'));
}

function main() {
  retryAfterParsing();
  delayPolicy();
  wiring();
  noNewConfig();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
