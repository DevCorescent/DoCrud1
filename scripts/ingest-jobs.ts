/**
 * Run the job ingestion for real, from the command line.
 *
 * Run: npx tsx scripts/ingest-jobs.ts [--limit N] [--only id,id] [--dry]
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `runCanonicalIngestion` had no caller outside the selftests, and every one of
 * those injects a fake fetcher. So the pipeline was fully built, fully tested,
 * and had never been pointed at the internet from a terminal — the only way to
 * fill the corpus was to wait for whatever calls it in production.
 *
 * ═══ THE LIMIT IS THE IMPORTANT FLAG ═══
 *
 * The configured boards carry well over five thousand live postings between
 * them, and the local store is a JSON file that every recommendation read loads
 * whole. Pulling everything makes a corpus that is slow to read long before it
 * is useful — the repo's own notes put a 7.4 MB read at ~86 s. `--limit`
 * bounds each source so a first feed gets BREADTH (many companies, many
 * countries) rather than the whole of three of them.
 *
 * ═══ IT REPORTS PER SOURCE ═══
 *
 * Each board is fetched inside its own try/catch upstream, so one company's
 * board returning 500 costs exactly that source. The summary prints every one,
 * including the failures and why, because a source that has silently returned
 * nothing for a month is the failure mode that matters here.
 */

/* Next loads `.env.local` for the app; a bare tsx process does not, so the
   source configuration would be invisible here and the run would find nothing
   to fetch. Read by hand rather than adding `dotenv` — the format is four lines
   of parsing and this is the only script that needs it. An existing variable in
   the environment always wins, so a shell export can still override the file. */
import { readFileSync, existsSync } from 'fs';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

/* Imported DYNAMICALLY, after the environment is in place.
   A static `import` is hoisted above every statement in this file, so the whole
   module graph — including job-scraper/fetcher.ts, which reads its size ceiling
   into a `const` at module scope — was evaluated before `loadEnvFile` had run.
   The configuration was loaded correctly and then ignored, because the constant
   that needed it had already been computed from an empty environment. */

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.split('=').slice(1).join('=');
  const next = process.argv[process.argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);

(async () => {
  const limit = Number(flag('limit') ?? 40);
  const only = (flag('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const dry = flag('dry') !== undefined;

  if (!Number.isFinite(limit) || limit < 1) {
    console.error('--limit must be a positive number');
    process.exit(1);
  }

  console.log(`\nIngesting job sources${dry ? ' (dry run — nothing will be written)' : ''}`);
  console.log(`per-source limit: ${limit}${only.length ? `  ·  only: ${only.join(', ')}` : ''}\n`);

  const { runCanonicalIngestion } = await import('../lib/server/job-sources/run-ingestion');

  const started = Date.now();
  const summary = await runCanonicalIngestion({
    perSourceLimit: limit,
    onlySourceIds: only.length ? only : undefined,
    commit: !dry,
  });

  console.log(pad('SOURCE', 34) + num('FOUND', 7) + num('NEW', 7) + num('UPD', 7) + num('SAME', 7) + num('ms', 8) + '  NOTE');
  console.log('─'.repeat(94));
  for (const s of [...summary.perSource].sort((a, b) => b.inserted - a.inserted)) {
    const note = s.skipped ? `skipped — ${s.skipReason ?? ''}`
      : s.ok ? (s.rejected ? `${s.rejected} rejected` : '')
        : `FAILED ${s.errorKind ?? ''}${s.errorStatus ? ` ${s.errorStatus}` : ''} — ${s.error ?? ''}`;
    console.log(
      pad(`${s.name} (${s.sourceId})`.slice(0, 33), 34)
      + num(s.discovered, 7) + num(s.inserted, 7) + num(s.updated, 7) + num(s.unchanged, 7)
      + num(s.latencyMs, 8) + '  ' + note.slice(0, 44),
    );
  }

  console.log('─'.repeat(94));
  console.log(
    `${summary.sources} sources · ${summary.sourcesOk} ok · ${summary.failed} failed · ${summary.skipped} skipped`
    + `\n${summary.discovered} discovered · ${summary.inserted} inserted · ${summary.updated} updated`
    + ` · ${summary.unchanged} unchanged · ${summary.rejected} rejected`
    + (summary.truncated ? ` · ${summary.truncated} truncated by --limit` : '')
    + `\nfinished in ${((Date.now() - started) / 1000).toFixed(1)}s`
    + (dry ? '\n\nDry run — the job store was not written.' : ''),
  );

  if (summary.failed > 0) {
    console.log('\nFailed sources are listed above with their reason. A `config` error is a '
      + 'bad slug in .env.local; an `http 404` is a board that no longer exists.');
  }
  console.log('');

  /* Exit explicitly. The MongoDB driver keeps a pooled socket open, which keeps
     the event loop alive, so the process sits there having finished its work —
     and anything reading this through a pipe never sees the summary, because
     the pipe never closes. The run itself was over; only the exit was missing. */
  process.exit(summary.failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('\nIngestion failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
