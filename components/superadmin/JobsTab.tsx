'use client';

/**
 * Superadmin — Jobs management & scraper CSV import.
 *
 * Imports scraper-produced CSV into native HiringJobPosting records that appear
 * in the existing Main Jobs Feed. Two-step flow: PREVIEW (validate + dedup, no
 * writes) then IMPORT (commit valid, non-duplicate rows). All system/ownership
 * fields are assigned server-side; the CSV supplies job content only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import CompanyLogo from '@/components/jobs/company/CompanyLogo';

const CARD = 'rounded-xl border border-white/10 bg-white/[0.03] p-4';
const BTN = 'rounded-lg px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-40';
const INPUT = 'h-9 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[13px] text-white outline-none focus:border-white/25';

type JobRow = {
  id: string; title: string; organizationName: string; location: string;
  employmentType: string; workMode: string; experienceLevel: string;
  status: string; source: string; applyUrl: string; createdAt: string;
};
type Stats = { total: number; published: number; draft: number; closed: number; scraped: number };
type ImportSummary = {
  totalRows: number; valid: number; invalid: number; duplicates: number; imported: number; committed: boolean;
  invalidRows: { row: number; errors: string[] }[];
  duplicateRows: { row: number; reason: string }[];
  preview: { title: string; organizationName: string; location: string; employmentType: string; workMode: string; experienceLevel: string }[];
};

/* Mirrors SourceInfo in lib/server/scraper-client.ts. `logoUrl` and
   `companyId` come from the shared company-logo resolver — resolved once per
   COMPANY, not per row and never per job. `lastError` is the reason a source
   failed, which the scraper fix now persists. */
type SourceInfo = { name: string; label: string; provider: string; enabled: boolean;
  companyId?: string; logoUrl?: string; websiteUrl?: string; lastSyncAt?: string; jobs?: number; failed?: boolean;
  lastError?: string; lastErrorKind?: string; consecutiveFailures?: number };
type ScraperRun = { runAt: string; fetched: number; valid: number; duplicates: number; imported: number; rejected: number; failed: number;
  discovered?: number; inserted?: number; updated?: number; unchanged?: number; contentChanged?: number;
  existingUnknown?: number; duplicateInRun?: number; truncated?: number; sourcesOk?: number };
type ScraperStatus = { mode: 'internal' | 'unconfigured'; configured: boolean; sourceNames: string[]; sources: SourceInfo[]; lastRun: ScraperRun | null };
type ScrapeSummary = { sources: number; sourcesOk?: number; fetched: number; valid: number; duplicates: number; imported: number; rejected: number; failed: number;
  discovered?: number; inserted?: number; updated?: number; unchanged?: number; contentChanged?: number;
  existingUnknown?: number; duplicateInRun?: number; truncated?: number;
  perSource: Array<{ name: string; provider: string; fetched: number; active: number; failed: boolean }>; runAt: string };

const CSV_HEADER = 'title,organizationName,location,department,employmentType,workMode,experienceLevel,description,responsibilities,requirements,preferredSkills,targetRoleKeywords,applyUrl';

/* The one place a source's state is decided. The filter and the row both call
   it, so a source can never be counted as "failed" by one and drawn as "synced"
   by the other. Status is READ from data that already exists: a source with no
   timestamp has genuinely never run, which is a different thing from one that
   ran and failed. Nothing here is inferred, and a logo is never consulted. */
type SourceState = 'synced' | 'never' | 'failed';
function sourceState(s: { failed?: boolean; lastSyncAt?: string }): SourceState {
  return s.failed ? 'failed' : s.lastSyncAt ? 'synced' : 'never';
}

const STATE_TONE: Record<SourceState, { dot: string; text: string; label: string }> = {
  failed: { dot: 'bg-red-400', text: 'text-red-300/90', label: 'Sync failed' },
  synced: { dot: 'bg-emerald-400', text: 'text-emerald-300/90', label: 'Synced' },
  never: { dot: 'bg-zinc-600', text: 'text-zinc-500', label: 'Never synced' },
};

export default function JobsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'commit'>('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Job Scraper (runs entirely inside DoCrud via approved public job APIs) ---
  const [scraper, setScraper] = useState<ScraperStatus | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeSummary, setScrapeSummary] = useState<ScrapeSummary | null>(null);
  const [scrapeErr, setScrapeErr] = useState('');
  /* Source Status search + filter. Presentation only — these never mutate the
     source data, they only decide which existing rows are drawn. */
  const [srcQuery, setSrcQuery] = useState('');
  const [srcFilter, setSrcFilter] = useState<'all' | 'synced' | 'never' | 'failed'>('all');

  const loadStatus = useCallback(() => {
    fetch('/api/super-admin/jobs/scraper')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ScraperStatus | null) => { if (d) setScraper(d); })
      .catch(() => { /* scraper status is best-effort */ });
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  /* The rows to draw. Filtering is presentation only — it never edits, sorts
     or re-counts the sources it was given. */
  const sourceRows = (scraper?.sources ?? []).filter((s) => {
    if (srcFilter !== 'all' && srcFilter !== sourceState(s)) return false;
    const q = srcQuery.trim().toLowerCase();
    return !q || s.label.toLowerCase().includes(q) || s.provider.toLowerCase().includes(q);
  });

  const runScraper = async () => {
    if (scraping) return;                        // prevent duplicate clicks
    setScraping(true); setScrapeErr(''); setScrapeSummary(null); setErr(''); setMsg('');
    try {
      const r = await fetch('/api/super-admin/jobs/scraper/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (!r.ok) { setScrapeErr(d.error || 'Scrape failed.'); return; }
      setScrapeSummary(d as ScrapeSummary);
      await load();        // refresh Existing Jobs with the newly imported roles
      loadStatus();        // refresh last-run + per-source status
    } catch { setScrapeErr('Network error.'); }
    finally { setScraping(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/super-admin/jobs?query=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (r.ok) { setStats(d.stats); setJobs(Array.isArray(d.jobs) ? d.jobs : []); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const onFile = async (file: File | null) => {
    setErr(''); setMsg(''); setSummary(null);
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const run = async (mode: 'preview' | 'commit', csvArg?: string) => {
    const csv = csvArg ?? csvText;
    if (!csv.trim()) { setErr('Choose a CSV file first.'); return; }
    setBusy(mode); setErr(''); setMsg('');
    try {
      const r = await fetch('/api/super-admin/jobs/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mode }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Import failed.'); return; }
      setSummary(d);
      if (mode === 'commit') {
        setMsg(`${d.imported} inserted · ${d.duplicates} already known · ${d.invalid} invalid rejected`);
        setCsvText(''); setFileName(''); if (fileRef.current) fileRef.current.value = '';
        await load();
      }
    } catch { setErr('Network error.'); }
    finally { setBusy(''); }
  };

  const stat = (label: string, value: number, color: string) => (
    <div className={CARD}>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Jobs</h2>
        <p className="text-[13px] text-zinc-500">Import scraper CSV into the Main Jobs Feed. System fields are assigned server-side.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stat('Total', stats?.total ?? 0, 'text-white')}
        {stat('Published', stats?.published ?? 0, 'text-emerald-400')}
        {stat('Draft', stats?.draft ?? 0, 'text-amber-400')}
        {stat('Closed', stats?.closed ?? 0, 'text-zinc-400')}
        {stat('Scraped', stats?.scraped ?? 0, 'text-sky-400')}
      </div>

      {/* Job Scraper — runs INSIDE DoCrud against approved public job APIs
          (Greenhouse / Ashby / Lever) and imports through the SAME importer (no second path). */}
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Job Scraper</div>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${scraper?.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${scraper?.configured ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {scraper?.configured ? 'Active' : 'No approved sources'}
          </span>
        </div>

        {!scraper?.configured ? (
          <p className="mt-2 text-[12px] text-zinc-500">
            No approved sources are configured. Set{' '}
            <span className="font-mono text-zinc-400">GREENHOUSE_BOARDS</span>,{' '}
            <span className="font-mono text-zinc-400">ASHBY_JOB_BOARDS</span> and/or{' '}
            <span className="font-mono text-zinc-400">LEVER_COMPANIES</span> on the server (public APIs, no secret), or use manual CSV import below.
          </p>
        ) : (
          <>
            {/* Dashboard */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className={CARD}><div className="text-[10px] uppercase tracking-wide text-zinc-500">Approved sources</div><div className="mt-1 text-xl font-bold text-white">{scraper.sources.filter((s) => s.enabled).length}</div></div>
              {/* DISCOVERED is what the sources returned; INSERTED is what was
                  written. They are different facts, and showing only "found"
                  and "imported" made a fully up-to-date board — everything
                  discovered, nothing new to write — read as a failed run. */}
              <div className={CARD}><div className="text-[10px] uppercase tracking-wide text-zinc-500">Discovered</div><div className="mt-1 text-xl font-bold text-sky-400">{scraper.lastRun?.discovered ?? scraper.lastRun?.fetched ?? '—'}</div></div>
              <div className={CARD}><div className="text-[10px] uppercase tracking-wide text-zinc-500">Inserted (last run)</div><div className="mt-1 text-xl font-bold text-emerald-400">{scraper.lastRun?.inserted ?? scraper.lastRun?.imported ?? '—'}</div></div>
              <div className={CARD}><div className="text-[10px] uppercase tracking-wide text-zinc-500">Last run</div><div className="mt-1 text-[12px] font-semibold text-zinc-300">{scraper.lastRun ? new Date(scraper.lastRun.runAt).toLocaleString() : 'Never'}</div></div>
            </div>

            <div className="mt-3">
              <button type="button" disabled={scraping || busy !== ''} onClick={() => void runScraper()} className={`${BTN} bg-sky-500/90 text-white hover:bg-sky-500`}>
                {scraping ? 'Scraping…' : 'Run scraper'}
              </button>
            </div>

            {scrapeErr && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{scrapeErr}</div>}

            {/* Every bucket is mutually exclusive and reported even when zero,
                so a run that changed nothing still explains itself. */}
            {scrapeSummary && (
              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded-md bg-white/5 px-2 py-1 text-zinc-300">Sources: <b className="text-white">{scrapeSummary.sourcesOk ?? scrapeSummary.sources}/{scrapeSummary.sources}</b></span>
                <span className="rounded-md bg-sky-500/10 px-2 py-1 text-sky-300">Discovered: <b>{scrapeSummary.discovered ?? scrapeSummary.fetched}</b></span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300">Inserted: <b>{scrapeSummary.inserted ?? scrapeSummary.imported}</b></span>
                <span className="rounded-md bg-white/5 px-2 py-1 text-zinc-300">Updated: <b className="text-white">{scrapeSummary.updated ?? 0}</b></span>
                <span className="rounded-md bg-white/5 px-2 py-1 text-zinc-300">Unchanged: <b className="text-white">{scrapeSummary.unchanged ?? 0}</b></span>
                {(scrapeSummary.contentChanged ?? 0) > 0 && (
                  <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300" title="Already stored, but the source content changed. This importer does not update existing jobs.">Stale: <b>{scrapeSummary.contentChanged}</b></span>
                )}
                {(scrapeSummary.existingUnknown ?? 0) > 0 && (
                  <span className="rounded-md bg-white/5 px-2 py-1 text-zinc-400" title="Already stored, but imported before content hashing — current vs changed cannot be determined.">Indeterminate: <b>{scrapeSummary.existingUnknown}</b></span>
                )}
                <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300">Duplicates: <b>{scrapeSummary.duplicateInRun ?? scrapeSummary.duplicates}</b></span>
                <span className="rounded-md bg-red-500/10 px-2 py-1 text-red-300">Rejected: <b>{scrapeSummary.rejected}</b></span>
                {(scrapeSummary.truncated ?? 0) > 0 && (
                  <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300" title="Jobs discarded because the run hit its limit. Raise the limit to ingest them.">Truncated: <b>{scrapeSummary.truncated}</b></span>
                )}
                {scrapeSummary.failed > 0 && <span className="rounded-md bg-red-500/10 px-2 py-1 text-red-300">Failed sources: <b>{scrapeSummary.failed}</b></span>}
              </div>
            )}

            {/* ── Source status ──────────────────────────────────────────
                 A row answers five questions at a glance: who the company is,
                 which ATS serves its jobs, whether that source is synced, how
                 many jobs it holds, and when it last ran. The logo answers a
                 SIXTH — who this company is — and is deliberately independent
                 of the other five: a source that has never synced can still
                 have a perfect brand mark, and a company with no logo can be
                 perfectly synced. */}
            <div className="mt-4">
              <div className="mb-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Source status</div>
                  <div className="mt-0.5 text-[11px] text-zinc-600">Connected job sources and ingestion state</div>
                </div>
                {/* Derived, never hardcoded. */}
                <div className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                  {sourceRows.length} of {scraper.sources.length} {scraper.sources.length === 1 ? 'source' : 'sources'}
                </div>
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="relative min-w-0 flex-1 basis-44">
                  <span className="sr-only">Search sources by company</span>
                  <input value={srcQuery} onChange={(e) => setSrcQuery(e.target.value)}
                    placeholder="Search company…"
                    className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[12px] text-white placeholder:text-zinc-600 outline-none focus-visible:border-white/20" />
                </label>
                <label className="shrink-0">
                  <span className="sr-only">Filter by sync status</span>
                  <select value={srcFilter} onChange={(e) => setSrcFilter(e.target.value as typeof srcFilter)}
                    className="h-8 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[12px] text-zinc-300 outline-none focus-visible:border-white/20">
                    <option value="all">All</option>
                    <option value="synced">Synced</option>
                    <option value="never">Never synced</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
              </div>

              {/* A constrained scroll area: 20+ sources must not push the rest
                  of the dashboard off screen. Vertical only — the page itself
                  never scrolls sideways. */}
              <div className="overflow-hidden rounded-lg border border-white/10">
                <div className="max-h-[520px] overflow-y-auto overflow-x-hidden">
                  {sourceRows.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12px] text-zinc-500">
                      No sources match that search.
                    </div>
                  ) : sourceRows.map((s) => {
                    /* Four explicit states, read from data that already exists.
                       Nothing is inferred: a source with no timestamp has
                       genuinely never run, which is different from one that ran
                       and failed. */
                    const tone = STATE_TONE[sourceState(s)];
                    return (
                      <div key={s.name}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-white/5 px-3 py-2.5 text-[12px] transition-colors last:border-0 hover:bg-white/[0.02] sm:grid-cols-[auto_minmax(0,1.4fr)_auto_auto_auto] sm:gap-x-4">
                        {/* The one shared component. Resolves verified logo →
                            configured logo → initials, and a broken URL falls
                            back rather than showing a broken-image icon. */}
                        <CompanyLogo name={s.label} logoUrl={s.logoUrl} size={38} rounded={10} />

                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white">{s.label}</div>
                          {/* Only a website an operator configured. Never
                              derived from the ATS host, never guessed. */}
                          <div className="truncate text-[10.5px] text-zinc-600">
                            {s.websiteUrl
                              ? s.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
                              : 'Website not configured'}
                          </div>
                        </div>

                        <span className="justify-self-start rounded-md bg-white/5 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-zinc-400 sm:justify-self-auto">
                          {s.provider}
                        </span>

                        {/* Status carries a WORD, not just a colour — a dot
                            alone is unreadable to a colour-blind operator. */}
                        <span className={`col-start-2 flex items-center gap-1.5 sm:col-start-auto ${tone.text}`}>
                          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                          {tone.label}
                        </span>

                        <div className="col-start-2 text-[11px] text-zinc-500 sm:col-start-auto sm:text-right">
                          <div className="tabular-nums">
                            {typeof s.jobs === 'number'
                              ? <><b className="text-zinc-300">{s.jobs.toLocaleString()}</b> {s.jobs === 1 ? 'job' : 'jobs'}</>
                              : <span className="text-zinc-600">—</span>}
                          </div>
                          {/* Only the real date. The status column already says
                              "Never synced", and repeating it here would print
                              the same fact twice on one row. */}
                          <div className="tabular-nums text-[10.5px] text-zinc-600">
                            {s.lastSyncAt
                              ? new Date(s.lastSyncAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                              : <span aria-hidden>—</span>}
                          </div>
                        </div>

                        {/* Why it failed, when the scraper recorded a reason. */}
                        {s.failed && s.lastError ? (
                          <div className="col-span-full text-[10.5px] text-red-400/80">{s.lastError}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Import */}
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Import Jobs (CSV)</div>
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(CSV_HEADER); setMsg('CSV header copied'); setTimeout(() => setMsg(''), 1500); }}
            className={`${BTN} border border-white/10 text-zinc-300 hover:bg-white/5`}
          >Copy header</button>
        </div>
        <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">{CSV_HEADER}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="text-[13px] text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-500/20 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-amber-300"
          />
          {fileName && <span className="text-[12px] text-zinc-400">{fileName}</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!csvText || busy !== ''} onClick={() => run('preview')} className={`${BTN} border border-white/10 text-zinc-200 hover:bg-white/5`}>
            {busy === 'preview' ? 'Validating…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={!summary || summary.valid === 0 || busy !== ''}
            onClick={() => run('commit')}
            className={`${BTN} bg-emerald-500/90 text-white hover:bg-emerald-500`}
          >
            {busy === 'commit' ? 'Importing…' : summary ? `Import ${summary.valid} Jobs` : 'Import'}
          </button>
        </div>

        {err && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{err}</div>}
        {msg && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">{msg}</div>}

        {/* Preview / result */}
        {summary && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-md bg-white/5 px-2 py-1 text-zinc-300">Total rows: <b className="text-white">{summary.totalRows}</b></span>
              <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300">Valid: <b>{summary.valid}</b></span>
              <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300">Duplicates: <b>{summary.duplicates}</b></span>
              <span className="rounded-md bg-red-500/10 px-2 py-1 text-red-300">Invalid: <b>{summary.invalid}</b></span>
              {summary.committed && <span className="rounded-md bg-sky-500/10 px-2 py-1 text-sky-300">Imported: <b>{summary.imported}</b></span>}
            </div>

            {summary.invalidRows.length > 0 && (
              <div>
                <div className="mb-1 text-[12px] font-semibold text-red-300">Invalid rows</div>
                <div className="max-h-40 overflow-auto rounded-lg border border-white/10">
                  {summary.invalidRows.map((r) => (
                    <div key={`inv-${r.row}`} className="border-b border-white/5 px-3 py-1.5 text-[12px] text-zinc-400 last:border-0">
                      <span className="text-zinc-500">Row {r.row}:</span> {r.errors.join('; ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!summary.committed && summary.preview.length > 0 && (
              <div>
                <div className="mb-1 text-[12px] font-semibold text-zinc-300">Preview (first {summary.preview.length})</div>
                <div className="max-h-52 overflow-auto rounded-lg border border-white/10">
                  {summary.preview.map((p, i) => (
                    <div key={`prev-${i}`} className="grid grid-cols-3 gap-2 border-b border-white/5 px-3 py-1.5 text-[12px] last:border-0">
                      <span className="truncate text-white">{p.title}</span>
                      <span className="truncate text-zinc-400">{p.organizationName}</span>
                      <span className="truncate text-zinc-500">{p.location} · {p.employmentType}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Jobs list */}
      <div className={CARD}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">Existing Jobs</div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title / company / location" className={`${INPUT} max-w-xs`} />
        </div>
        {loading ? (
          <div className="py-8 text-center text-[13px] text-zinc-500">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-zinc-500">No jobs yet. Import a CSV to populate the feed.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-zinc-500">
                <tr className="border-b border-white/10">
                  <th className="px-2 py-2 font-medium">Title</th>
                  <th className="px-2 py-2 font-medium">Company</th>
                  <th className="px-2 py-2 font-medium">Location</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Mode</th>
                  <th className="px-2 py-2 font-medium">Exp</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-white/5 last:border-0">
                    <td className="px-2 py-2 text-white">{j.title}</td>
                    <td className="px-2 py-2">{j.organizationName}</td>
                    <td className="px-2 py-2 text-zinc-400">{j.location || '—'}</td>
                    <td className="px-2 py-2 text-zinc-400">{j.employmentType || '—'}</td>
                    <td className="px-2 py-2 text-zinc-400">{j.workMode || '—'}</td>
                    <td className="px-2 py-2 text-zinc-400">{j.experienceLevel || '—'}</td>
                    <td className="px-2 py-2">
                      <span className={j.status === 'published' ? 'text-emerald-400' : j.status === 'draft' ? 'text-amber-400' : 'text-zinc-500'}>{j.status}</span>
                    </td>
                    <td className="px-2 py-2 text-zinc-500">{j.source}</td>
                    <td className="px-2 py-2 text-zinc-500">{new Date(j.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
