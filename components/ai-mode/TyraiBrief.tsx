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
import { ArrowRight, Briefcase, Building2, Users } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';
import { cachedJson } from '@/lib/client/request-cache';
import { companyJobsHref, formatCompanyJobCount, type CompanyExplorerTile } from '@/lib/company-explorer';

const BAND_WORD: Record<string, string> = {
  'low': 'Needs work',
  'medium-low': 'Fair',
  'medium-high': 'Good',
  'high': 'Great',
  'complete': 'Complete',
};

export default function TyraiBrief({ open }: { open: boolean }) {
  const { data: session, status } = useSession();
  const signedIn = status === 'authenticated';

  const [jobCount, setJobCount] = useState<number | null>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [companies, setCompanies] = useState<CompanyExplorerTile[]>([]);

  /* Only while the overlay is open, and only once per opening: these are
     small, cached calls, and TYRAI is opened far more often than the numbers
     behind it change. */
  useEffect(() => {
    if (!open || !signedIn) return;
    let alive = true;
    const load = <T,>(url: string, pick: (d: T) => number | null, set: (n: number | null) => void) => {
      cachedJson<T>(url).then((d) => { if (alive) set(pick(d)); }).catch(() => {});
    };
    load<{ total?: number }>('/api/recommendations/jobs', (d) => d.total ?? 0, setJobCount);
    load<{ total?: number }>('/api/recommendations/people', (d) => d.total ?? 0, setPeopleCount);
    load<{ profileScore?: number | null }>('/api/me/badge', (d) => d.profileScore ?? null, setScore);
    cachedJson<{ companies?: CompanyExplorerTile[] }>('/api/company-explorer')
      .then((d) => { if (alive && Array.isArray(d.companies)) setCompanies(d.companies.slice(0, 4)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, signedIn]);

  /* Signed out there is no "your" anything to report. */
  if (!signedIn) return null;

  const firstName = (session?.user?.name ?? '').trim().split(/\s+/)[0] || 'there';
  const band = profileStatusStyle(score ?? 0);
  const word = BAND_WORD[band.band] ?? 'In progress';

  return (
    <div className="aim-brief">
      <p className="aim-brief-hi">
        Hey, {firstName} <span aria-hidden>👋</span>
        <span className="aim-brief-sub">Here is what is waiting for you.</span>
      </p>

      <div className="aim-brief-row">
        <a href="/jobs?recommended=1" className="aim-brief-tile">
          <Briefcase className="aim-brief-i" aria-hidden />
          <span className="aim-brief-n">{jobCount ?? '—'}</span>
          <span className="aim-brief-l">Job matches</span>
        </a>

        <a href="/people?recommended=1" className="aim-brief-tile">
          <Users className="aim-brief-i" aria-hidden />
          <span className="aim-brief-n">{peopleCount ?? '—'}</span>
          <span className="aim-brief-l">New people</span>
        </a>

        {/* The score keeps the band's own colour — the one the profile page
            and the readiness pill already use — so it is the same fact in the
            same hue wherever it is read. */}
        <a href="/profile#score" className="aim-brief-tile aim-brief-score">
          <span className="aim-brief-n" style={{ color: band.fg }}>
            {score === null ? '—' : `${score}%`}
          </span>
          <span className="aim-brief-l">Profile · {score === null ? 'Loading' : word}</span>
          <span className="aim-brief-bar" aria-hidden>
            <span style={{ width: `${Math.max(2, Math.min(100, score ?? 0))}%`, background: band.ring }} />
          </span>
        </a>
      </div>

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
  );
}
