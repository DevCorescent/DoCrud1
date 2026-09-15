/**
 * Freshness dry-run — READ-ONLY.
 *
 *   npm run freshness:dry-run
 *
 * Answers "what would PUBLIC_FRESHNESS_ENABLED=true do to the corpus right
 * now?" without doing it. Two guarantees, both enforced by the code below and
 * asserted by scripts/job-freshness.selftest.ts:
 *
 *   1. It performs NO writes. No lastSeenAt is touched, no expiresAt is
 *      materialised, no visibility changes, no lifecycle state moves.
 *   2. It classifies with THE SAME pure predicate the public query uses, and
 *      then cross-checks that classification against the Mongo expression the
 *      query would actually run. If the two ever disagree, activation must
 *      not proceed — the report says so rather than picking one.
 *
 * Read only the four fields the rule needs, projected: 7K small rows, not the
 * 19 MB whole-document read that made the earlier full-corpus paths so slow.
 *
 * ═══ HOW TO READ THE RESULT ═══
 *
 * A large "stale" number today is NOT a reason to activate — it is the
 * reason NOT to. Stale means "not observed within 168h", and with two boards
 * enabled and no timer, most postings have simply not been looked at. The
 * activation decision needs evidence of renewal from real scrape cycles
 * (`seenStamped > 0` across the enabled sources, run after run), and this
 * command run AFTER those cycles, not before.
 */
import { loadAppEnvOrThrow } from './load-env';
import type { HiringJobPosting } from '@/types/document';

const H = 3600_000;

function bucketOf(ageMs: number): string {
  const h = ageMs / H;
  if (h < 24) return '0-24h';
  if (h < 48) return '24-48h';
  if (h < 72) return '48-72h';
  if (h < 96) return '72-96h';
  if (h < 120) return '96-120h';
  if (h < 144) return '120-144h';
  if (h < 168) return '144-168h';
  if (h < 336) return '168-336h';
  if (h < 720) return '336-720h';
  return '720h+';
}

async function main() {
  loadAppEnvOrThrow({ required: ['MONGODB_URI'] });
  const { getMongoDb } = await import('@/lib/server/database');
  const {
    freshnessState, freshnessAgeMs, staleCond, PUBLIC_FRESHNESS_MS,
  } = await import('@/lib/server/job-sources/freshness');
  const { DOC_REF } = await import('@/lib/server/db/public-jobs-query');

  const db = await getMongoDb();
  if (!db) throw new Error('no database handle');
  const col = db.collection('hiring_jobs');

  /* One instant for the whole report, so every number below agrees. */
  const now = Date.now();
  console.log(`freshness dry-run @ ${new Date(now).toISOString()}  window=${PUBLIC_FRESHNESS_MS / H}h`);
  console.log('READ-ONLY: no writes, no expiresAt, no lastSeenAt, no visibility change.\n');

  const rows = await col.find({}, {
    projection: { _id: 0, id: 1, source: 1, sourceId: 1, lastSeenAt: 1, status: 1 },
  }).toArray() as unknown as Array<Partial<HiringJobPosting>>;

  const counts = { total: rows.length, exempt: 0, fresh: 0, stale: 0, unknown: 0 };
  let scraped = 0, withSeen = 0, missingSeen = 0, malformedSeen = 0, stalePublished = 0;
  const buckets = new Map<string, number>();
  const staleByProvider = new Map<string, number>();

  for (const job of rows) {
    const state = freshnessState(job, now);
    counts[state] += 1;
    if (state === 'exempt') continue;

    scraped += 1;
    const raw = job.lastSeenAt;
    if (typeof raw !== 'string' || raw.trim() === '') missingSeen += 1;
    else if (!Number.isFinite(Date.parse(raw))) malformedSeen += 1;
    else withSeen += 1;

    const age = freshnessAgeMs(job, now);
    if (age !== null) {
      const b = bucketOf(age);
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
    if (state === 'stale') {
      if (job.status === 'published') stalePublished += 1;
      const provider = String(job.sourceId ?? '').split(':')[0] || '(no sourceId)';
      staleByProvider.set(provider, (staleByProvider.get(provider) ?? 0) + 1);
    }
  }

  console.log('── Population ──');
  console.log(`  total jobs                 ${counts.total}`);
  console.log(`  scraped                    ${scraped}`);
  console.log(`  manual/employer (exempt)   ${counts.exempt}`);
  console.log(`  scraped with valid seen    ${withSeen}`);
  console.log(`  scraped missing seen       ${missingSeen}`);
  console.log(`  scraped malformed seen     ${malformedSeen}`);

  console.log('\n── Under the 168h rule (scraped only) ──');
  console.log(`  fresh   (<168h)            ${counts.fresh}`);
  console.log(`  stale   (>=168h)           ${counts.stale}   of which published: ${stalePublished}`);
  console.log(`  unknown (no usable seen)   ${counts.unknown}   <- NOT hidden by the rule`);

  console.log('\n── lastSeenAt age buckets ──');
  for (const b of ['0-24h','24-48h','48-72h','72-96h','96-120h','120-144h','144-168h','168-336h','336-720h','720h+']) {
    const n = buckets.get(b) ?? 0;
    if (n) console.log(`  ${b.padEnd(10)} ${String(n).padStart(6)}   ${b === '144-168h' || b < '168' ? '' : ''}`);
  }

  console.log('\n── Stale by provider ──');
  for (const [p, n] of Array.from(staleByProvider).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(18)} ${String(n).padStart(6)}`);
  }

  /* ═══ CROSS-CHECK: does the query's expression agree with the predicate? ═══
     The public filter will run `staleCond` inside MongoDB, not this loop. If
     the two counted different populations, the report would be describing a
     rule the site does not apply. */
  const mongoStale = await col.countDocuments({ $expr: staleCond(DOC_REF, now) });
  const agree = mongoStale === counts.stale;
  console.log('\n── Cross-check: Mongo expression vs pure predicate ──');
  console.log(`  predicate stale   ${counts.stale}`);
  console.log(`  $expr stale       ${mongoStale}`);
  console.log(`  ${agree ? 'AGREE' : 'DISAGREE — DO NOT ACTIVATE'}`);

  console.log('\n── If activated NOW ──');
  console.log(`  public scraped postings would drop by ${stalePublished}`);
  console.log('  This is a measurement, not a recommendation. Activation requires evidence of');
  console.log('  renewal (seenStamped > 0 across enabled sources over real scrape cycles).');

  process.exitCode = agree ? 0 : 2;
}

main().catch((error) => {
  console.error('dry-run failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
