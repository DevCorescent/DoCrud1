'use client';

/**
 * The three numbers that are waiting for you: job matches, new people, and how
 * ready your profile is.
 *
 * ═══ ONE ROW, TWO HOMES ═══
 *
 * Lifted out of `TyraiBrief` so the homepage can show it above the feed
 * without a second copy of the markup or a second set of fetches to keep in
 * step. `TyraiBrief` still renders it — this is the same component, not a
 * duplicate — so a change to a tile changes both places at once.
 *
 * ═══ THE NUMBERS ARE REAL ═══
 *
 * The same three endpoints the homepage band and the TYRAI brief already read:
 * `/api/recommendations/jobs`, `/api/recommendations/people` and
 * `/api/me/badge`. Nothing is computed here and nothing is invented — a count
 * that has not arrived yet shows an em dash rather than a zero, because "none"
 * and "not loaded" are different facts and a zero would state the wrong one.
 *
 * The score keeps the band colour `profileStatusStyle` already gives the
 * profile page and the readiness pill, so the same fact is the same hue
 * wherever it is read.
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Briefcase, Users } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';
import { cachedJson } from '@/lib/client/request-cache';
import '@/components/ai-mode/brief-row.css';

const BAND_WORD: Record<string, string> = {
  'low': 'Needs work',
  'medium-low': 'Fair',
  'medium-high': 'Good',
  'high': 'Great',
  'complete': 'Complete',
};

/**
 * `active` gates the fetches. TYRAI passes its open state so the calls happen
 * when the overlay opens rather than on every render of the page behind it;
 * the homepage passes true, because there the row is on screen already.
 *
 * `inline` picks the homepage's shape — content-sized tiles aligned right,
 * matching the action row it replaced — instead of TYRAI's full-width grid.
 */
export default function TyraiBriefRow(
  { active = true, inline = false }: { active?: boolean; inline?: boolean },
) {
  const { status } = useSession();
  const signedIn = status === 'authenticated';

  const [jobCount, setJobCount] = useState<number | null>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !signedIn) return;
    let alive = true;
    const load = <T,>(url: string, pick: (d: T) => number | null, set: (n: number | null) => void) => {
      cachedJson<T>(url).then((d) => { if (alive) set(pick(d)); }).catch(() => {});
    };
    load<{ total?: number }>('/api/recommendations/jobs', (d) => d.total ?? 0, setJobCount);
    load<{ total?: number }>('/api/recommendations/people', (d) => d.total ?? 0, setPeopleCount);
    load<{ profileScore?: number | null }>('/api/me/badge', (d) => d.profileScore ?? null, setScore);
    return () => { alive = false; };
  }, [active, signedIn]);

  if (!signedIn) return null;

  const band = profileStatusStyle(score ?? 0);
  const word = BAND_WORD[band.band] ?? 'In progress';

  return (
    /* `inline` is the homepage's shape: content-sized tiles sitting to the
       right, the way the Companies / Publish / Jobs row did. TYRAI keeps the
       full-width grid — there the row IS the content of the screen, and three
       equal columns is what makes it read as a summary rather than as three
       buttons somebody left in a corner. */
    <div className={inline ? 'aim-brief-row aim-brief-row-inline' : 'aim-brief-row'}>
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
  );
}
