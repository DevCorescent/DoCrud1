'use client';

/**
 * Company Explorer — the Super Admin entry point.
 *
 * ═══ WHY THIS TAB EXISTS ═══
 *
 * The company manager (order, visibility, membership, and each company's
 * uploaded logo) was only reachable from the "Manage" button on the PUBLIC
 * homepage strip. That works, but nobody looks for company administration on
 * the homepage — it belongs where every other administrative surface lives.
 * This tab is that path:
 *
 *   /super-admin → Company Explorer → Manage → a company row → Logo
 *
 * ═══ IT ADDS NO SECOND IMPLEMENTATION ═══
 *
 * It opens the EXISTING `CompanyExplorerManageModal` — the same dialog the
 * homepage button opens, with the same allow-listed PATCH, the same logo
 * uploader and the same server-side authorization. Nothing here duplicates it,
 * and there is no second way to write company configuration.
 *
 * Authorization is NOT decided here. The dialog's endpoints re-check the
 * super-admin session on every read and write, so reaching this tab grants
 * nothing on its own.
 */

import { useEffect, useState } from 'react';
import CompanyExplorerManageModal from '@/components/jobs/company/CompanyExplorerManageModal';
import CompanyLogo from '@/components/jobs/company/CompanyLogo';
import { formatCompanyJobCount, type CompanyExplorerTile } from '@/lib/company-explorer';

export default function CompanyExplorerTab() {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyExplorerTile[] | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  /* null while unknown. The endpoint reports it, so the tab can say so BEFORE
     an admin picks a file and gets a 503. */
  const [storageReady, setStorageReady] = useState<boolean | null>(null);

  /** The configured strip, plus which companies have an uploaded mark. */
  async function load() {
    try {
      const [stripRes, logoRes] = await Promise.all([
        fetch('/api/company-explorer', { cache: 'no-store' }),
        fetch('/api/super-admin/company-logo', { cache: 'no-store' }),
      ]);
      const strip = stripRes.ok ? await stripRes.json() : null;
      setCompanies(Array.isArray(strip?.companies) ? strip.companies : []);
      if (logoRes.ok) {
        const d = await logoRes.json() as {
          logos?: Array<{ id: string; url: string }>; storageReady?: boolean;
        };
        setUploaded(Object.fromEntries((d.logos ?? []).map((l) => [l.id, l.url])));
        setStorageReady(Boolean(d.storageReady));
      }
    } catch {
      /* An unreachable list must not blank the tab — the manager still opens. */
      setCompanies([]);
    }
  }

  useEffect(() => { void load(); }, []);

  const withLogo = companies?.filter((c) => uploaded[c.id]).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Company Explorer</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Choose which companies appear on the homepage strip, set their order, and upload the
            logo used for each company everywhere on DoCrud.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/25 border border-amber-500/25">
          Manage companies &amp; logos
        </button>
      </div>

      {/* Stated up front rather than discovered as a failed upload. */}
      {storageReady === false && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3" role="status">
          <p className="text-sm font-semibold text-amber-300">Object storage is not configured</p>
          <p className="mt-0.5 text-xs text-amber-200/70">
            Existing logos still display, but new uploads will be refused until R2 credentials are
            set. Everything else on this tab works.
          </p>
        </div>
      )}

      {/* Counts, so an admin can see at a glance how much is curated. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ['In the explorer', companies === null ? '—' : String(companies.length)],
          ['With an uploaded logo', companies === null ? '—' : String(withLogo)],
          ['Using automatic logo', companies === null ? '—' : String(companies.length - withLogo)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Companies</p>
          <p className="text-[11px] text-zinc-600">Open the manager to upload or replace a logo</p>
        </div>

        {companies === null ? (
          <p className="px-4 py-6 text-sm text-zinc-500">Loading companies…</p>
        ) : companies.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No companies are configured yet. Open the manager to add them.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <CompanyLogo name={c.name} logoUrl={uploaded[c.id] || c.logoUrl} size={28} rounded={8} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{c.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                  {formatCompanyJobCount(c.jobCount)}
                </span>
                {/* States which logo is in use — never implies an upload that
                    does not exist. */}
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  uploaded[c.id]
                    ? 'border-violet-500/30 bg-violet-500/12 text-violet-300'
                    : 'border-zinc-700/60 bg-zinc-800/40 text-zinc-500'}`}>
                  {uploaded[c.id] ? '✓ Uploaded' : 'Automatic'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The SAME dialog the homepage Manage button opens. */}
      {open && (
        <CompanyExplorerManageModal
          onClose={() => { setOpen(false); void load(); }}
          onSaved={() => { void load(); }}
        />
      )}
    </div>
  );
}
