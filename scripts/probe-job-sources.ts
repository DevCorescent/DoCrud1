/**
 * Read-only discovery probe for candidate job-board sources.
 *
 *   npm run scrape:sources:probe -- --file candidates.txt
 *   npm run scrape:sources:probe -- --env          (probe what is configured)
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * A company can only be added to the source inventory if its board identifier
 * is REAL. A plausible-looking slug that 404s costs a source every run: the
 * fetcher spends three attempts and ~37 s discovering nothing, and the board
 * shows as "failing" forever. Guessing identifiers is therefore not a shortcut,
 * it is a permanent tax — so every candidate is verified against the live
 * endpoint before it reaches configuration.
 *
 * ═══ WHAT IT DELIBERATELY DOES NOT DO ═══
 *
 * It performs NO ingestion. It never opens a database connection, never takes
 * the scraper lease, never writes a job, never touches run state. It resolves
 * each candidate through the SAME registry and adapters the real scraper uses —
 * so a source that probes clean will behave identically in a real run, and no
 * second fetch path exists to drift.
 *
 * Candidate file format (one per line, `#` comments allowed):
 *
 *   greenhouse  stripe                 Stripe          US
 *   lever       mindtickle             MindTickle      IN
 *   workday     acme:wd3:Careers       Acme            IN
 */
import { loadAppEnv } from './load-env';
import { readFileSync } from 'fs';

loadAppEnv();

interface Candidate {
  provider: string;
  slug: string;
  label: string;
  country?: string;
}

/** Which environment variable carries each provider's company list. */
const PROVIDER_ENV: Record<string, string> = {
  greenhouse: 'GREENHOUSE_BOARDS',
  lever: 'LEVER_COMPANIES',
  ashby: 'ASHBY_JOB_BOARDS',
  smartrecruiters: 'SMARTRECRUITERS_COMPANIES',
  workable: 'WORKABLE_COMPANIES',
  recruitee: 'RECRUITEE_COMPANIES',
  personio: 'PERSONIO_COMPANIES',
  bamboohr: 'BAMBOOHR_COMPANIES',
  microsoft: 'MICROSOFT_CAREERS',
  workday: 'WORKDAY_BOARDS',
};

function parseCandidateFile(path: string): Candidate[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [provider, slug, label, country] = line.split(/\s{2,}|\t/).map((x) => x.trim());
      return { provider, slug, label: label || slug, country: country || undefined };
    })
    .filter((c) => c.provider && c.slug && PROVIDER_ENV[c.provider]);
}

export interface ProbeResult {
  provider: string;
  slug: string;
  label: string;
  ok: boolean;
  jobs: number;
  durationMs: number;
  error?: string;
  errorKind?: string;
  errorStatus?: number;
}

/**
 * Probe one batch by CONFIGURING it and resolving through the real registry.
 *
 * The environment is rebuilt per batch because `allSources()` reads it at call
 * time — that is how the registry already works, and reusing it is what keeps
 * this tool honest about what a real run would do.
 */
async function probeBatch(candidates: readonly Candidate[]): Promise<ProbeResult[]> {
  /* Clear every provider list first: a leftover value from the developer's own
     .env would silently probe boards the caller did not ask about. */
  for (const env of Object.values(PROVIDER_ENV)) process.env[env] = '';
  process.env.JOB_SCRAPER_ENABLED = 'true';

  const byEnv = new Map<string, string[]>();
  for (const c of candidates) {
    const env = PROVIDER_ENV[c.provider];
    const entry = [c.slug, c.label, c.country].filter(Boolean).join('|');
    byEnv.set(env, [...(byEnv.get(env) ?? []), entry]);
  }
  /* Array.from, not spread: this tsconfig targets below ES2015 for iteration,
     and a bare `for..of` over a Map fails the build even though esbuild runs it. */
  for (const [env, entries] of Array.from(byEnv)) process.env[env] = entries.join(',');

  const { listSourceConfigs, getAdapter } = await import('@/lib/server/job-sources/registry');
  const configs = listSourceConfigs().filter((c) => c.accessType === 'public_ats' && c.enabled);

  const results: ProbeResult[] = [];
  for (const cfg of configs) {
    const [provider] = cfg.sourceId.split(':');
    const slug = cfg.sourceId.slice(provider.length + 1);
    const started = Date.now();
    try {
      const adapter = getAdapter(cfg.sourceId, {});
      if (!adapter) throw new Error('no adapter for this provider');
      const out = await adapter.fetch(null);
      results.push({
        provider, slug, label: cfg.name, ok: true,
        jobs: out.jobs.length, durationMs: Date.now() - started,
      });
    } catch (error) {
      const e = error as { message?: string; kind?: string; status?: number };
      results.push({
        provider, slug, label: cfg.name, ok: false, jobs: 0,
        durationMs: Date.now() - started,
        /* Safe message only — the fetcher's errors carry a host and a status,
           never a URL with credentials and never a stack. */
        error: e?.message ? String(e.message).slice(0, 120) : 'probe failed',
        errorKind: e?.kind, errorStatus: e?.status,
      });
    }
  }
  return results;
}

/** Probe in small groups so one slow board does not stall the whole report. */
const BATCH = 6;

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');

  let candidates: Candidate[];
  if (fileIdx >= 0 && args[fileIdx + 1]) {
    candidates = parseCandidateFile(args[fileIdx + 1]);
  } else {
    /* Probe whatever is already configured. */
    candidates = [];
    for (const [provider, env] of Object.entries(PROVIDER_ENV)) {
      for (const entry of (process.env[env] || '').split(',').map((e) => e.trim()).filter(Boolean)) {
        const [slug, label, country] = entry.split('|').map((x) => x.trim());
        candidates.push({ provider, slug, label: label || slug, country });
      }
    }
  }

  if (candidates.length === 0) {
    console.error('No candidates. Pass --file <path>, or configure provider env vars.');
    process.exit(1);
  }

  console.log(`Probing ${candidates.length} candidate board(s). Read-only: no ingestion, no database.\n`);

  const all: ProbeResult[] = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    const out = await probeBatch(slice);
    for (const r of out) {
      const mark = r.ok ? (r.jobs > 0 ? 'OK  ' : 'EMPTY') : 'FAIL';
      console.log(
        `${mark} ${r.provider.padEnd(16)} ${r.slug.padEnd(34)} ` +
        `${String(r.jobs).padStart(5)} jobs  ${String(r.durationMs).padStart(6)}ms` +
        (r.error ? `  ${r.errorKind ?? ''}${r.errorStatus ? `/${r.errorStatus}` : ''} ${r.error}` : ''),
      );
    }
    all.push(...out);
  }

  const verified = all.filter((r) => r.ok && r.jobs > 0);
  const empty = all.filter((r) => r.ok && r.jobs === 0);
  const failed = all.filter((r) => !r.ok);
  const totalJobs = verified.reduce((n, r) => n + r.jobs, 0);

  console.log('\n── Provider distribution (verified boards only) ──');
  const byProvider = new Map<string, { boards: number; jobs: number }>();
  for (const r of verified) {
    const cur = byProvider.get(r.provider) ?? { boards: 0, jobs: 0 };
    byProvider.set(r.provider, { boards: cur.boards + 1, jobs: cur.jobs + r.jobs });
  }
  for (const [p, v] of Array.from(byProvider).sort((a, b) => b[1].jobs - a[1].jobs)) {
    console.log(`  ${p.padEnd(16)} ${String(v.boards).padStart(3)} boards  ${String(v.jobs).padStart(6)} jobs`);
  }

  console.log('\n── Summary ──');
  console.log(`  candidates      ${all.length}`);
  console.log(`  verified        ${verified.length}`);
  console.log(`  empty board     ${empty.length}`);
  console.log(`  failed          ${failed.length}`);
  console.log(`  DISCOVERED JOBS ${totalJobs}`);
  if (verified.length) {
    console.log(`  avg jobs/board  ${Math.round(totalJobs / verified.length)}`);
  }

  /* The configuration lines for everything that verified, ready to paste. Only
     boards proven to return postings are emitted — a slug that 404s must never
     reach configuration. */
  console.log('\n── Verified configuration ──');
  for (const [provider, env] of Object.entries(PROVIDER_ENV)) {
    const rows = verified.filter((r) => r.provider === provider);
    if (rows.length === 0) continue;
    const cands = new Map(candidates.map((c) => [`${c.provider}:${c.slug}`, c]));
    const line = rows
      .map((r) => [r.slug, r.label, cands.get(`${provider}:${r.slug}`)?.country].filter(Boolean).join('|'))
      .join(',');
    console.log(`${env}=${line}`);
  }
}

main().catch((error) => {
  console.error('probe failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
