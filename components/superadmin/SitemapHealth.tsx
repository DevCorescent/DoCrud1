'use client';

/**
 * Super Admin → SEO Manager → Sitemap Health.
 *
 * Everything shown here comes from an actual validation run against the served
 * /sitemap.xml and /robots.txt. Nothing is hardcoded, and a number the server
 * could not measure renders as "Not available" rather than as 0 — an admin must
 * never read "0 duplicates" when the truth is "we could not check".
 *
 * Validation runs ONLY when the button is pressed. Mounting this component
 * issues one cheap configuration read and starts no timers, so opening the SEO
 * Manager costs nothing extra and nothing polls.
 *
 * On Google: this panel reports what Docrud SENDS and how it is configured. It
 * deliberately makes no claim about whether Google has fetched, accepted or
 * indexed anything, because the application has no Search Console API
 * integration and therefore cannot know.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

interface SitemapCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'unavailable';
  detail?: string;
}
interface SitemapCategory { category: string; count: number; sample: string[] }
interface SitemapHealthReport {
  status: 'healthy' | 'warning' | 'error' | 'unavailable';
  checkedAt: string;
  sitemapUrl: string; robotsUrl: string; canonicalHost: string;
  checkedOrigin: string; isProductionCheck: boolean;
  responseMs: number | null; lastGenerated: string | null;
  httpStatus: number | null; contentType: string | null; xmlValid: boolean;
  robotsResponseMs: number | null; robotsHttpStatus: number | null;
  robotsSitemapReference: string | null;
  sitemapCount: number;
  childSitemaps: { url: string; urls: number | null; ok: boolean }[];
  httpUrls: number | null;
  validationLimited: boolean; limitReason?: string;
  totalUrls: number | null; duplicateUrls: number | null; invalidUrls: number | null;
  localhostUrls: number | null; nonCanonicalHostUrls: number | null;
  robotsConflicts: number | null; privateUrls: number | null;
  schemeMismatches: number | null; wwwVariantUrls: number | null;
  breakdown: SitemapCategory[];
  checks: SitemapCheck[];
  issues: string[];
  robotsAvailable: boolean; sitemapDeclaredInRobots: boolean;
  indexingEnabled: boolean; googleVerificationConfigured: boolean;
}
interface HistoryEntry { time: string; status: string; urls: number | null; issues: number | null }
interface Config {
  canonicalHost: string; sitemapUrl: string; robotsUrl: string;
  indexingEnabled: boolean; googleVerificationConfigured: boolean;
  history: HistoryEntry[];
  report: SitemapHealthReport | null;
}

const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';
const BTN_PRIMARY =
  'rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition '
  + 'hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 '
  + 'disabled:opacity-60';

/** A number the server could not measure must not read as zero. */
function metric(value: number | null): string {
  return value === null || value === undefined ? 'Not available' : String(value);
}

function fmtTime(iso: string | null): string {
  if (!iso) return 'Not available';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not available';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* The status word carries the meaning; the dot and colour only reinforce it. */
const STATUS_TEXT: Record<string, { word: string; tone: string; blurb: string }> = {
  healthy: {
    word: 'Healthy', tone: 'text-emerald-400',
    blurb: 'Your public sitemap is available, valid and ready for search-engine discovery.',
  },
  warning: {
    word: 'Warning', tone: 'text-amber-400',
    blurb: 'The sitemap is being served, but some non-critical issues were found.',
  },
  error: {
    word: 'Error', tone: 'text-rose-400',
    blurb: 'The sitemap has a problem that will stop search engines using it correctly.',
  },
  unavailable: {
    word: 'Unavailable', tone: 'text-zinc-300',
    blurb: 'The public sitemap could not be reached, so its health is unknown. '
      + 'This is not the same as the sitemap being broken.',
  },
};

function StatCard({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <p className={`truncate text-xl font-black tabular-nums ${tone ?? 'text-zinc-100'}`} title={value}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</p>
    </div>
  );
}

/** A pass/fail line whose state is readable without seeing the colour. */
function StateLine({ label, ok, okText, badText }: {
  label: string; ok: boolean; okText: string; badText: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12px] text-zinc-400">{label}</span>
      <span className={`text-[12px] font-semibold ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
        <span aria-hidden>{ok ? '● ' : '○ '}</span>{ok ? okText : badText}
      </span>
    </div>
  );
}

export default function SitemapHealth() {
  const [config, setConfig] = useState<Config | null>(null);
  const [report, setReport] = useState<SitemapHealthReport | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  /* Validation runs ONCE when the section is first opened, then only on
     demand. No polling: each run fetches the live sitemap and robots.txt. */
  const [autoChecked, setAutoChecked] = useState(false);

  /* One cheap read: configuration and past results. No validation on mount. */
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/super-admin/seo/sitemap', { cache: 'no-store' });
      if (!r.ok) {
        setError(r.status === 401 ? 'Session expired — sign in again.' : 'Could not load sitemap status.');
        return;
      }
      const data = (await r.json()) as Config;
      setConfig(data);
      setHistory(data.history ?? []);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);


  const validate = useCallback(async () => {
    if (validating) return; // no duplicate requests in flight
    setValidating(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/seo/sitemap', { method: 'POST' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Sitemap validation failed.'); return; }
      setReport(data.report);
      setHistory(data.history ?? []);
      setNotice(data.report?.status === 'healthy'
        ? 'Sitemap validated successfully.'
        : 'Sitemap validation completed with issues.');
    } catch { setError('Could not reach the server.'); }
    finally { setValidating(false); }
  }, [validating]);

  useEffect(() => {
    if (loading || autoChecked || report || validating) return;
    setAutoChecked(true);
    void validate();
  }, [loading, autoChecked, report, validating, validate]);

  const sitemapUrl = report?.sitemapUrl || config?.sitemapUrl || '';
  const robotsUrl = report?.robotsUrl || config?.robotsUrl || '';
  const canonicalHost = report?.canonicalHost || config?.canonicalHost || '';
  const indexingEnabled = report?.indexingEnabled ?? config?.indexingEnabled ?? true;
  const verified = report?.googleVerificationConfigured ?? config?.googleVerificationConfigured ?? false;

  const copyUrl = useCallback(async () => {
    if (!sitemapUrl) return;
    try {
      await navigator.clipboard.writeText(sitemapUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { setError('Could not copy to the clipboard.'); }
  }, [sitemapUrl]);

  const status = useMemo(
    () => (report ? STATUS_TEXT[report.status] ?? STATUS_TEXT.error : null),
    [report],
  );

  if (loading) {
    return <p className="text-sm text-zinc-500" aria-live="polite">Loading sitemap status…</p>;
  }

  return (
    <div className="space-y-4">
      {/* ── Status and actions ── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL}>Status</p>
            {status ? (
              <>
                <p className={`text-[15px] font-bold ${status.tone}`}>
                  <span aria-hidden>● </span>{status.word}
                </p>
                <p className={`${HINT} max-w-prose`}>{status.blurb}</p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-bold text-zinc-400">Not validated yet</p>
                <p className={`${HINT} max-w-prose`}>
                  Press Validate sitemap to check the live /sitemap.xml and /robots.txt.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void validate()} disabled={validating}
              className={BTN_PRIMARY}>
              {validating ? 'Validating…' : 'Validate sitemap'}
            </button>
            {sitemapUrl && (
              <a href={sitemapUrl} target="_blank" rel="noreferrer" className={BTN}>Open sitemap</a>
            )}
            {robotsUrl && (
              <a href={robotsUrl} target="_blank" rel="noreferrer" className={BTN}>Open robots.txt</a>
            )}
          </div>
        </div>

        <p aria-live="polite" className="mt-2 text-[12px]">
          {validating && <span className="text-zinc-400">Validating sitemap…</span>}
          {!validating && notice && (
            <span className={report?.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}>
              {report?.status === 'healthy' ? '✓ ' : '⚠ '}{notice}
            </span>
          )}
        </p>
        {error && (
          <p role="alert" className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </p>
        )}
      </div>

      {/* A local result shown beside a production URL is a lie by proximity. */}
      {report && !report.isProductionCheck && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200">
          This check ran against <span className="break-all font-semibold">{report.checkedOrigin}</span>,
          not {report.canonicalHost}. It describes the local server, not production.
        </p>
      )}

      {/* A partial check presented as a complete one is worse than no check. */}
      {report?.validationLimited && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200">
          Validation was limited — {report.limitReason} These figures do not cover the whole sitemap.
        </p>
      )}

      {/* ── Quick stats ── */}
      {report && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
          <StatCard value={metric(report.totalUrls)} label="Total URLs" />
          <StatCard value={metric(report.duplicateUrls)} label="Duplicates"
            tone={report.duplicateUrls ? 'text-amber-400' : undefined} />
          <StatCard value={metric(report.invalidUrls)} label="Invalid URLs"
            tone={report.invalidUrls ? 'text-rose-400' : undefined} />
          <StatCard value={metric(report.localhostUrls)} label="Localhost URLs"
            tone={report.localhostUrls ? 'text-rose-400' : undefined} />
          <StatCard value={metric(report.nonCanonicalHostUrls)} label="Wrong host"
            tone={report.nonCanonicalHostUrls ? 'text-rose-400' : undefined} />
          <StatCard value={metric(report.robotsConflicts)} label="Robots conflicts"
            tone={report.robotsConflicts ? 'text-rose-400' : undefined} />
          <StatCard value={metric(report.httpUrls)} label="Non-HTTPS URLs"
            tone={report.httpUrls ? 'text-rose-400' : undefined} />
        </div>
      )}

      {/* ── Issues ── */}
      {report && report.issues.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-[12px] font-semibold text-amber-300">
            {report.issues.length} issue{report.issues.length === 1 ? '' : 's'} found
          </p>
          <ul className="mt-1.5 space-y-1">
            {report.issues.map((issue) => (
              <li key={issue} className="text-[12px] leading-relaxed text-zinc-300">• {issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Sitemap facts ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className={LABEL}>Sitemap</p>
          {/* break-all so a long URL wraps instead of forcing the card wider. */}
          <p className="break-all text-[12px] text-zinc-300">{sitemapUrl || 'Not available'}</p>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between gap-3">
              <dt className="text-[11px] text-zinc-500">Last validated</dt>
              <dd className="text-[11px] text-zinc-300">{fmtTime(report?.checkedAt ?? null)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[11px] text-zinc-500">HTTP status</dt>
              <dd className="text-[11px] text-zinc-300">
                {report?.httpStatus ? `${report.httpStatus}${report.httpStatus === 200 ? ' OK' : ''}` : 'Not available'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[11px] text-zinc-500">XML</dt>
              <dd className="text-[11px] text-zinc-300">
                {report ? (report.xmlValid ? 'Valid' : 'Invalid') : 'Not available'}
              </dd>
            </div>
            {report && report.sitemapCount > 1 && (
              <div className="flex justify-between gap-3">
                <dt className="text-[11px] text-zinc-500">Sitemaps</dt>
                <dd className="text-[11px] text-zinc-300">
                  {report.sitemapCount} (index + {report.childSitemaps.length})
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-[11px] text-zinc-500">Response time</dt>
              <dd className="text-[11px] text-zinc-300">
                {report?.responseMs === null || report?.responseMs === undefined
                  ? 'Not available' : `${(report.responseMs / 1000).toFixed(2)}s`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[11px] text-zinc-500">Served at</dt>
              <dd className="text-[11px] text-zinc-300">{fmtTime(report?.lastGenerated ?? null)}</dd>
            </div>
          </dl>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyUrl()} className={BTN}>
              {copied ? '✓ Sitemap URL copied' : 'Copy sitemap URL'}
            </button>
          </div>
          <p className={HINT}>
            Generated from live content and cached hourly. Validation reads the served sitemap and
            does not force it to regenerate.
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className={LABEL}>Robots &amp; indexing</p>
          <StateLine label="robots.txt"
            ok={report ? report.robotsAvailable : false}
            okText="Available" badText={report ? 'Unavailable' : 'Not checked'} />
          <StateLine label="Sitemap declaration"
            ok={report ? report.sitemapDeclaredInRobots : false}
            okText="Present" badText={report ? 'Missing' : 'Not checked'} />
          {report?.robotsSitemapReference && (
            <p className="break-all pb-1 text-right text-[11px] text-zinc-500">
              {report.robotsSitemapReference}
            </p>
          )}
          <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-[12px] text-zinc-400">robots.txt response</span>
            <span className="text-[12px] text-zinc-300">
              {report?.robotsHttpStatus ? `${report.robotsHttpStatus}` : 'Not checked'}
              {report?.robotsResponseMs !== null && report?.robotsResponseMs !== undefined
                ? ` · ${report.robotsResponseMs} ms` : ''}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-[12px] text-zinc-400">Canonical host</span>
            <span className="break-all text-right text-[12px] font-semibold text-zinc-200">
              {canonicalHost.replace(/^https?:\/\//, '') || 'Not configured'}
            </span>
          </div>
          <StateLine label="Search indexing" ok={indexingEnabled}
            okText="Enabled" badText="Disabled" />
          {!indexingEnabled && (
            <p role="alert" className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">
              Search engine indexing is currently disabled. The sitemap still advertises these URLs —
              configuration conflict detected.
            </p>
          )}
        </div>
      </div>

      {/* ── URL breakdown ── */}
      {report && report.breakdown.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className={LABEL}>URL breakdown</p>
          <ul className="mt-1">
            {report.breakdown.map((row) => {
              const open = openCategory === row.category;
              return (
                <li key={row.category} className="border-b border-zinc-900 last:border-0">
                  <button type="button"
                    onClick={() => setOpenCategory(open ? null : row.category)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                    <span className="min-w-0 truncate text-[12px] text-zinc-300">{row.category}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[12px] font-semibold tabular-nums text-zinc-200">{row.count}</span>
                      <span className="text-[11px] text-amber-400">{open ? 'Hide' : 'View URLs'}</span>
                    </span>
                  </button>
                  {open && (
                    <ul className="mb-2 max-h-48 overflow-y-auto rounded border border-zinc-900 bg-black/40 p-2">
                      {row.sample.map((p) => (
                        <li key={p} className="break-all py-0.5 text-[11px] text-zinc-400">{p}</li>
                      ))}
                      {row.count > row.sample.length && (
                        <li className="pt-1 text-[11px] italic text-zinc-600">
                          …and {row.count - row.sample.length} more
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2">
            <span className="text-[12px] font-semibold text-zinc-400">Total</span>
            <span className="text-[12px] font-bold tabular-nums text-zinc-100">{metric(report.totalUrls)}</span>
          </div>
        </div>
      )}

      {/* ── Child sitemaps, only when the sitemap is actually an index ── */}
      {report && report.childSitemaps.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className={LABEL}>Sitemap index</p>
          <ul className="mt-1">
            {report.childSitemaps.map((c) => (
              <li key={c.url} className="flex items-baseline justify-between gap-3 py-1">
                <span className="min-w-0 break-all text-[12px] text-zinc-300">{c.url}</span>
                <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                  c.ok ? 'text-zinc-200' : 'text-rose-400'}`}>
                  {c.ok ? `${c.urls} URLs` : 'Unreadable'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Checks ── */}
      {report && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className={LABEL}>Validation checks</p>
          <ul className="mt-1 sm:columns-2 sm:gap-6">
            {report.checks.map((c) => (
              <li key={c.id} className="flex gap-2 py-1">
                <span aria-hidden className={`mt-px w-3 shrink-0 text-center text-[12px] font-bold ${
                  c.status === 'pass' ? 'text-emerald-400'
                    : c.status === 'warn' ? 'text-amber-400'
                    : c.status === 'fail' ? 'text-rose-400' : 'text-zinc-500'}`}>
                  {c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : c.status === 'fail' ? '✕' : '–'}
                </span>
                <span className="sr-only">
                  {c.status === 'pass' ? 'Passed:' : c.status === 'warn' ? 'Warning:'
                    : c.status === 'fail' ? 'Failed:' : 'Not available:'}
                </span>
                <span className="min-w-0 text-[12px] leading-relaxed text-zinc-300">
                  {c.label}
                  {c.detail && <span className="block text-[11px] text-zinc-500">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Google Search Console ── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className={LABEL}>Google Search Console</p>
        <StateLine label="Verification" ok={verified}
          okText="Configured" badText="Not configured" />
        <p className="mt-1 break-all text-[12px] text-zinc-300">{sitemapUrl || 'Not available'}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyUrl()} className={BTN}>
            {copied ? '✓ Copied' : 'Copy URL'}
          </button>
          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer"
            className={BTN}>Open Search Console</a>
        </div>
        {/* The distinction the whole panel rests on. */}
        <p className={HINT}>
          Docrud can confirm that this sitemap exists, is valid and is referenced by robots.txt.
          It cannot tell whether Google has fetched or indexed any of these URLs — Search Console
          is the only place that shows Google&rsquo;s actual crawling and indexing status.
        </p>
      </div>

      {/* ── History ── */}
      {history.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className={LABEL}>Recent validations</p>
          {/* The table scrolls inside its own box so the page never does. */}
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">
                  <th scope="col" className="py-1 pr-3 font-semibold">Time</th>
                  <th scope="col" className="py-1 pr-3 font-semibold">Status</th>
                  <th scope="col" className="py-1 pr-3 font-semibold">URLs</th>
                  <th scope="col" className="py-1 font-semibold">Issues</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.time} className="border-t border-zinc-900">
                    <td className="py-1 pr-3 text-zinc-300">{fmtTime(h.time)}</td>
                    <td className={`py-1 pr-3 font-semibold ${
                      h.status === 'healthy' ? 'text-emerald-400'
                        : h.status === 'warning' ? 'text-amber-400' : 'text-rose-400'}`}>
                      {STATUS_TEXT[h.status]?.word ?? h.status}
                    </td>
                    <td className="py-1 pr-3 tabular-nums text-zinc-300">{metric(h.urls)}</td>
                    <td className="py-1 tabular-nums text-zinc-300">{metric(h.issues)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
