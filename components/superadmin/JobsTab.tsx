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

type ScraperStatus = { mode: 'internal' | 'unconfigured'; configured: boolean; sources: string[] };
type ScrapeResult = { runId: string; status: string; scanned: number; valid: number; invalid: number; duplicates: number; csv: string };

const CSV_HEADER = 'title,organizationName,location,department,employmentType,workMode,experienceLevel,description,responsibilities,requirements,preferredSkills,targetRoleKeywords,applyUrl';

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

  // --- Job Scraper (runs the EXTERNAL scraper via a Super-Admin-only proxy) ---
  const [scraper, setScraper] = useState<ScraperStatus | null>(null);
  const [scrapeSource, setScrapeSource] = useState('');
  const [scrapeLimit, setScrapeLimit] = useState('50');
  const [scrapeResume, setScrapeResume] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [scrapeErr, setScrapeErr] = useState('');

  useEffect(() => {
    fetch('/api/super-admin/jobs/scraper')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ScraperStatus | null) => {
        if (!d) return;
        setScraper(d);
        if (d.sources.length && !scrapeSource) setScrapeSource(d.sources[0]);
      })
      .catch(() => { /* scraper is optional; ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runScraper = async () => {
    if (!scrapeSource) { setScrapeErr('Select a source.'); return; }
    setScraping(true); setScrapeErr(''); setErr(''); setMsg(''); setScrapeResult(null); setSummary(null);
    try {
      const r = await fetch('/api/super-admin/jobs/scraper/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: scrapeSource, limit: Number(scrapeLimit) || 50, resume: scrapeResume }),
      });
      const d = await r.json();
      if (!r.ok) { setScrapeErr(d.error || 'Scrape failed.'); return; }
      setScrapeResult(d);
      setCsvText(d.csv || '');
      setFileName(`scrape: ${scrapeSource}`);
      // Feed the scraped CSV straight into the EXISTING import preview (validate + dedup).
      if (d.csv) await run('preview', d.csv);
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
        setMsg(`${d.imported} imported · ${d.duplicates} duplicates skipped · ${d.invalid} invalid rejected`);
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

      {/* Job Scraper — operates the EXTERNAL scraper via a Super-Admin-only proxy.
          Its output feeds the SAME import flow below (no second import path). */}
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Job Scraper</div>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${scraper?.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${scraper?.configured ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {scraper?.configured ? 'Ready' : 'No approved sources'}
          </span>
        </div>

        {!scraper?.configured ? (
          <p className="mt-2 text-[12px] text-zinc-500">
            No approved scraper sources are enabled. Add and enable a source in{' '}
            <span className="font-mono text-zinc-400">lib/server/job-scraper/sources.ts</span>, or use manual CSV import below.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Source</span>
                <select value={scrapeSource} onChange={(e) => setScrapeSource(e.target.value)} className={INPUT}>
                  {scraper.sources.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Max jobs</span>
                <input type="number" min={1} max={1000} value={scrapeLimit} onChange={(e) => setScrapeLimit(e.target.value)} className={`${INPUT} w-24`} />
              </label>
              <label className="flex h-9 items-center gap-1.5 text-[12px] text-zinc-400">
                <input type="checkbox" checked={scrapeResume} onChange={(e) => setScrapeResume(e.target.checked)} /> Resume
              </label>
            </div>
            <div className="mt-3">
              <button type="button" disabled={scraping || !scrapeSource || busy !== ''} onClick={() => void runScraper()} className={`${BTN} bg-sky-500/90 text-white hover:bg-sky-500`}>
                {scraping ? 'Scraping…' : 'Run scraper'}
              </button>
            </div>
            {scrapeErr && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{scrapeErr}</div>}
            {scrapeResult && (
              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded-md bg-white/5 px-2 py-1 text-zinc-300">Scanned: <b className="text-white">{scrapeResult.scanned}</b></span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300">Scraped: <b>{scrapeResult.valid}</b></span>
                <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300">Duplicates: <b>{scrapeResult.duplicates}</b></span>
                <span className="rounded-md bg-red-500/10 px-2 py-1 text-red-300">Invalid: <b>{scrapeResult.invalid}</b></span>
                <span className="text-zinc-500">→ previewed below; import valid rows with the button.</span>
              </div>
            )}
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
