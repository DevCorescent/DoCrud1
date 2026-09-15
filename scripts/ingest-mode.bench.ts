/**
 * Whole-corpus lookup vs per-source lookup, against the REAL cluster.
 *
 *   npx tsx scripts/ingest-mode.bench.ts
 *
 * ═══ WHY THIS CANNOT BE A LOOPBACK BENCH ═══
 *
 * `incremental-refresh.bench.ts` already proves the algorithmic claim against
 * mongodb-memory-server: the per-source path is O(touched), not O(corpus). That
 * is not the open question.
 *
 * The open question is a NETWORK one. The whole-corpus path is one large read;
 * the per-source path is one round trip per source. Which wins depends entirely
 * on the latency between the application and the cluster, and the two
 * environments disagree:
 *
 *   developer laptop -> Atlas   ~200 ms RTT   whole-corpus WON (332 s vs 627 s)
 *   EC2 -> same-region Atlas    ~1 ms RTT     expected to invert, NOT MEASURED
 *
 * A loopback bench has ~0 ms RTT and therefore cannot answer it. This one must
 * run where the worker runs.
 *
 * ═══ SAFETY ═══
 *
 * `commit: false` throughout, so the planner runs in full and NOTHING is
 * written. Refuses to start if anything would commit. Boards are fetched for
 * real — that is the point — so run it when no scheduled run is in flight.
 *
 * Deliberately UNBOUNDED: no `deadlineAt`. The production failure is that the
 * corpus load eats the source window, and a bench that inherited the same
 * deadline would simply reproduce "0 sources attempted" in one arm and measure
 * nothing. Each mode is measured at its true cost, then compared against the
 * window it would have to fit inside.
 */
import { MongoClient } from 'mongodb';
import { loadAppEnvOrThrow } from './load-env';

const BUDGET_MS = Number(process.env.SCRAPER_BUDGET_MS) || 780_000;
const SAVE_RESERVE_BASE_MS = 45_000;
const SAVE_RESERVE_PER_JOB_MS = 12;
const SAVE_RESERVE_MAX_SHARE = 0.6;

interface ModeResult {
  mode: string;
  totalMs: number;
  sourceMs: number;
  nonSourceMs: number;
  attempted: number;
  skippedDeadline: number;
  skippedOther: number;
  failed: number;
  discovered: number;
  inserted: number;
  updated: number;
  unchanged: number;
  peakHeapMb: number;
  docsRead: number;
  commands: Record<string, number>;
}

/** Commands issued, and documents returned, counted by the driver itself. */
function instrument() {
  const commands: Record<string, number> = {};
  let docsRead = 0;
  return {
    commands,
    get docsRead() { return docsRead; },
    reset() { for (const k of Object.keys(commands)) delete commands[k]; docsRead = 0; },
    attach(client: MongoClient) {
      client.on('commandStarted', (e) => {
        commands[e.commandName] = (commands[e.commandName] ?? 0) + 1;
      });
      client.on('commandSucceeded', (e) => {
        const r = e.reply as { cursor?: { firstBatch?: unknown[]; nextBatch?: unknown[] } } | undefined;
        docsRead += (r?.cursor?.firstBatch?.length ?? 0) + (r?.cursor?.nextBatch?.length ?? 0);
      });
    },
  };
}

/** Peak heap over the life of a run, sampled. */
function watchHeap() {
  let peak = process.memoryUsage().heapUsed;
  const t = setInterval(() => {
    const h = process.memoryUsage().heapUsed;
    if (h > peak) peak = h;
  }, 250);
  t.unref();
  return { stop() { clearInterval(t); return Math.round(peak / 1_048_576); } };
}

async function measure(mode: 'whole-corpus' | 'incremental', probe: ReturnType<typeof instrument>): Promise<ModeResult> {
  process.env.INGEST_INCREMENTAL_LOOKUP = mode === 'incremental' ? 'true' : 'false';

  /* Fresh module registry: `incrementalIngestEnabled()` is read at call time,
     but the registry and source list cache env-derived state on first import. */
  const { runCanonicalIngestion } = await import(
    `@/lib/server/job-sources/run-ingestion?mode=${mode}-${Date.now()}`
  ) as typeof import('@/lib/server/job-sources/run-ingestion');

  probe.reset();
  const heap = watchHeap();
  const t0 = Date.now();
  const out = await runCanonicalIngestion({ commit: false });
  const totalMs = Date.now() - t0;
  const peakHeapMb = heap.stop();

  const sourceMs = out.perSource.reduce((n, s) => n + s.latencyMs, 0);
  return {
    mode,
    totalMs,
    sourceMs,
    nonSourceMs: totalMs - sourceMs,
    attempted: out.perSource.filter((s) => !s.skipped).length,
    skippedDeadline: out.deadlineSkipped,
    skippedOther: out.perSource.filter((s) => s.skipped && s.skipReason !== 'deadline').length,
    failed: out.failed,
    discovered: out.perSource.reduce((n, s) => n + s.discovered, 0),
    inserted: out.perSource.reduce((n, s) => n + s.inserted, 0),
    updated: out.perSource.reduce((n, s) => n + s.updated, 0),
    unchanged: out.perSource.reduce((n, s) => n + s.unchanged, 0),
    peakHeapMb,
    docsRead: probe.docsRead,
    commands: { ...probe.commands },
  };
}

function row(label: string, a: unknown, b: unknown) {
  console.log(`  ${label.padEnd(26)} ${String(a).padStart(14)} ${String(b).padStart(14)}`);
}

async function main() {
  loadAppEnvOrThrow({ required: ['MONGODB_URI'], anyOf: [] }, process.cwd());

  const uri = process.env.MONGODB_URI!;
  const host = /^mongodb(?:\+srv)?:\/\/(?:[^@]*@)?([^/?]+)/.exec(uri)?.[1] ?? '(unknown)';
  console.log(`cluster   ${host}`);
  console.log(`database  ${process.env.MONGODB_DB || 'docrud'}`);
  console.log('mode      DRY RUN — commit:false, nothing is written\n');

  /* The application caches its client on `global`. Seeding that slot with an
     instrumented client is how the counts below come from the driver rather
     than from a guess, without production code knowing about this file. */
  const probe = instrument();
  const client = new MongoClient(uri, { minPoolSize: 1, monitorCommands: true });
  probe.attach(client);
  await client.connect();
  (global as Record<string, unknown>).__docrudMongoClient = client;
  (global as Record<string, unknown>).__docrudMongoConnect = Promise.resolve(client);

  const db = client.db(process.env.MONGODB_DB || 'docrud');
  const corpus = await db.collection('hiring_jobs').estimatedDocumentCount();
  const reserve = Math.min(
    SAVE_RESERVE_BASE_MS + corpus * SAVE_RESERVE_PER_JOB_MS,
    Math.max(SAVE_RESERVE_BASE_MS, Math.floor(BUDGET_MS * SAVE_RESERVE_MAX_SHARE)),
  );
  const window = BUDGET_MS - reserve;
  console.log(`corpus    ${corpus} documents`);
  console.log(`budget    ${BUDGET_MS} ms  reserve ${reserve} ms  source window ${window} ms\n`);

  /* Whole-corpus first: it is the mode running in production today, so if the
     bench is interrupted the baseline is the measurement that survives. */
  console.log('running whole-corpus …');
  const a = await measure('whole-corpus', probe);
  console.log('running incremental …');
  const b = await measure('incremental', probe);

  console.log('\n' + ' '.repeat(28) + 'whole-corpus'.padStart(14) + 'incremental'.padStart(15));
  console.log('  ' + '─'.repeat(56));
  row('total', `${a.totalMs} ms`, `${b.totalMs} ms`);
  row('  source fetching', `${a.sourceMs} ms`, `${b.sourceMs} ms`);
  row('  everything else', `${a.nonSourceMs} ms`, `${b.nonSourceMs} ms`);
  row('sources attempted', a.attempted, b.attempted);
  row('skipped (deadline)', a.skippedDeadline, b.skippedDeadline);
  row('skipped (other)', a.skippedOther, b.skippedOther);
  row('failed', a.failed, b.failed);
  row('discovered', a.discovered, b.discovered);
  row('would insert', a.inserted, b.inserted);
  row('would update', a.updated, b.updated);
  row('unchanged', a.unchanged, b.unchanged);
  row('peak heap', `${a.peakHeapMb} MB`, `${b.peakHeapMb} MB`);
  row('documents read', a.docsRead, b.docsRead);
  for (const k of Array.from(new Set(Object.keys(a.commands).concat(Object.keys(b.commands))))) {
    row(`  ${k} commands`, a.commands[k] ?? 0, b.commands[k] ?? 0);
  }

  console.log('\n  fits inside the source window?');
  row('', a.totalMs < window ? 'YES' : 'NO', b.totalMs < window ? 'YES' : 'NO');

  /* Equivalence is the gate, not speed. A faster mode that plans different work
     is not a win — it is a defect that would show up as duplicate postings. */
  const samePlan = a.discovered === b.discovered
    && a.inserted === b.inserted && a.updated === b.updated;
  console.log(`\n  plans agree: ${samePlan ? 'YES' : 'NO — DO NOT ENABLE, investigate'}`);
  if (!samePlan) process.exitCode = 1;

  await client.close();
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
