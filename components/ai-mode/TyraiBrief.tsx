'use client';

/**
 * What is waiting for you, on TYRAI's first screen.
 *
 * ═══ WHY IT MOVED HERE ═══
 *
 * The greeting, the two match counts, the profile score and the companies rail
 * used to be a band across the top of the homepage — above a feed people had
 * come to read, in the space that feed wanted. Here it has a screen of its own
 * that was otherwise empty: TYRAI opens on one question and nothing else, and
 * the moment before somebody types is exactly the moment "you have 3 new
 * connections and a 32% profile" is worth reading.
 *
 * ═══ IT DISAPPEARS THE MOMENT YOU TYPE ═══
 *
 * Rendered only in the ask phase. Once there are results this is not what the
 * screen is for, and a dashboard hanging under a set of search results is
 * clutter with a good reason to exist somewhere else.
 *
 * ═══ ONE SOURCE EACH ═══
 *
 * The same four endpoints the homepage band read — the counts, the badge (for
 * the profile score) and the company explorer — so a number here can never
 * disagree with the same number anywhere else in the product.
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowRight, Building2, ChevronDown } from 'lucide-react';
import { cachedJson } from '@/lib/client/request-cache';
import TyraiBriefRow from '@/components/ai-mode/TyraiBriefRow';
import { companyJobsHref, formatCompanyJobCount, type CompanyExplorerTile } from '@/lib/company-explorer';

export default function TyraiBrief({ open }: { open: boolean }) {
  const { data: session, status } = useSession();
  const signedIn = status === 'authenticated';

  const [companies, setCompanies] = useState<CompanyExplorerTile[]>([]);
  /* Local, and deliberately not persisted: this is a "not right now", not a
     preference. Every opening of TYRAI starts with the brief showing, which is
     the whole reason it is on this screen. */
  const [briefOpen, setBriefOpen] = useState(true);

  /* Only while the overlay is open, and only once per opening: these are
     small, cached calls, and TYRAI is opened far more often than the numbers
     behind it change. */
  useEffect(() => {
    if (!open || !signedIn) return;
    let alive = true;
    cachedJson<{ companies?: CompanyExplorerTile[] }>('/api/company-explorer')
      .then((d) => { if (alive && Array.isArray(d.companies)) setCompanies(d.companies.slice(0, 4)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, signedIn]);

  /* Signed out there is no "your" anything to report. */
  if (!signedIn) return null;

  const firstName = (session?.user?.name ?? '').trim().split(/\s+/)[0] || 'there';

  return (
    <div className="aim-brief" data-open={briefOpen ? 'true' : 'false'}>
      <div id="tyrai-brief-content" className="aim-brief-content">
      <p className="aim-brief-hi">
        Hey, {firstName} <span aria-hidden>👋</span>
        <span className="aim-brief-sub">Here is what is waiting for you.</span>
      </p>

      <TyraiBriefRow active={open} />

      {companies.length > 0 && (
        <div className="aim-brief-cos">
          <span className="aim-brief-cos-l">
            <Building2 className="h-3 w-3" aria-hidden /> Hiring now
          </span>
          {companies.map((c) => (
            <a key={c.id} href={companyJobsHref(c.id)} className="aim-brief-co">
              <span className="aim-brief-co-n">{c.name}</span>
              <span className="aim-brief-co-j">{formatCompanyJobCount(c.jobCount)}</span>
            </a>
          ))}
          <a href="/businesses" className="aim-brief-co aim-brief-co-all">
            All companies <ArrowRight className="h-3 w-3" aria-hidden />
          </a>
        </div>
      )}
      </div>

      {/* The only thing that toggles. The tiles and the company links stay
          ordinary navigation — making the whole panel a control would mean a
          click meant for "Job matches" collapsed the panel instead. */}
      <button
        type="button"
        className="aim-brief-toggle"
        aria-expanded={briefOpen}
        aria-controls="tyrai-brief-content"
        aria-label={briefOpen ? 'Collapse summary' : 'Expand summary'}
        onClick={() => setBriefOpen((v) => !v)}
      >
        <ChevronDown className="aim-brief-chev" aria-hidden />
      </button>
    </div>
  );
}
