'use client';

/**
 * The signed-in homepage opener: greeting → Jobs / Connections matches →
 * profile score, in ONE compact band of roughly 170px.
 *
 * HEIGHT IS THE CONSTRAINT HERE. The first version stacked three full cards
 * and ate three quarters of a phone screen before the feed began. This one
 * keeps every number and drops the packaging: the greeting is a bare row
 * rather than a card, and the three readings sit side by side in one strip of
 * tiles. Adding a row, a paragraph or a button back is what regresses it.
 *
 * Every number is real and already owned by an existing endpoint — nothing new
 * was invented to fill a tile:
 *   · Jobs        → /api/recommendations/jobs   `total` (uncapped match count)
 *   · Connections → /api/recommendations/people `total` (uncapped match count)
 *   · Score       → /api/me/badge               `profileScore` (derived, never stored)
 * A count that has not loaded shows a skeleton, and a genuine zero shows zero.
 *
 * Copy and artwork come from the Super Admin homepage config (`greeting`).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowUpRight, Briefcase, CalendarDays, Users } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';

export type HomeGreetingConfig = {
  subtitle: string;
  cadenceLabel: string;
  illustrationUrl: string;
};

const TILE =
  'group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-2.5 transition-colors hover:bg-white/[0.045]';

/* Copy only — the bands themselves come from lib/profile-score.ts, so this
   strip can never disagree with the profile page about how complete a profile
   is; it just says it in this card's voice. */
const BAND_WORD: Record<string, string> = {
  'low': 'Needs work',
  'medium-low': 'Fair',
  'medium-high': 'Good',
  'high': 'Great',
  'complete': 'Complete',
};

/** Compact default artwork, so the row is never a broken image before an upload. */
function GreetingArtwork() {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden className="h-10 w-[52px] shrink-0 sm:h-11 sm:w-[58px]">
      <rect x="8" y="10" width="46" height="58" rx="6" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.13)" />
      <circle cx="21" cy="24" r="5" fill="rgba(255,255,255,0.20)" />
      <rect x="31" y="21" width="17" height="3" rx="1.5" fill="rgba(255,255,255,0.18)" />
      <rect x="15" y="36" width="33" height="3" rx="1.5" fill="rgba(255,255,255,0.14)" />
      <rect x="15" y="44" width="26" height="3" rx="1.5" fill="rgba(255,255,255,0.12)" />
      <rect x="52" y="40" width="54" height="38" rx="7" fill="#1b1c20" stroke="rgba(255,255,255,0.14)" />
      <rect x="70" y="33" width="18" height="9" rx="3" fill="#1b1c20" stroke="rgba(255,255,255,0.14)" />
      <rect x="52" y="55" width="54" height="2.5" fill="rgba(255,255,255,0.10)" />
      <circle cx="30" cy="76" r="9" fill="rgba(52,211,153,0.16)" stroke="rgba(52,211,153,0.30)" />
    </svg>
  );
}

function StatTile({
  icon, tint, border, label, value, caption, href,
}: {
  icon: ReactNode; tint: string; border: string;
  label: string; value: number | null; caption: string; href: string;
}) {
  return (
    <Link href={href} className={TILE}>
      <div className="pointer-events-none absolute -bottom-8 -right-6 h-20 w-20 rounded-full blur-2xl"
        style={{ background: tint }} aria-hidden />

      <div className="relative flex items-center justify-between gap-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: tint, border: `1px solid ${border}` }}>
          {icon}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/25 transition group-hover:text-white/70" />
      </div>

      {value === null
        ? <span className="relative mt-2 h-6 w-10 animate-pulse rounded bg-white/[0.06]" aria-hidden />
        : <p className="relative mt-2 text-[22px] font-bold leading-none tracking-[-0.02em] text-white">{value}</p>}

      <p className="relative mt-1 truncate text-[11px] font-semibold text-white/55">{label}</p>
      <p className="relative truncate text-[10.5px] text-white/28">{caption}</p>
    </Link>
  );
}

/** The score ring. Stroke colour is the shared completion band, not a new palette. */
function ScoreRing({ score, colour }: { score: number | null; colour: string }) {
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12.5px] font-bold tracking-[-0.02em] text-white">
        {score === null ? '—' : score}
      </span>
    </div>
  );
}

export default function HomeHighlights({ greeting }: { greeting?: HomeGreetingConfig | null }) {
  const { data: session, status } = useSession();

  const [jobCount, setJobCount] = useState<number | null>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);

  const firstName = useMemo(() => {
    const name = session?.user?.name?.trim() || session?.user?.email?.split('@')[0] || '';
    return name.split(/\s+/)[0] || 'there';
  }, [session?.user?.email, session?.user?.name]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;

    const load = async (url: string, key: 'total' | 'profileScore', set: (n: number) => void) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const value = Number(data?.[key]);
        if (active && Number.isFinite(value)) set(Math.max(0, Math.round(value)));
      } catch { /* a tile that cannot load keeps its skeleton rather than showing a wrong number */ }
    };

    load('/api/recommendations/jobs', 'total', setJobCount);
    load('/api/recommendations/people', 'total', setPeopleCount);
    load('/api/me/badge', 'profileScore', setScore);

    return () => { active = false; };
  }, [status]);

  // Signed out there is no "your" anything to report; the section stays hidden.
  if (status !== 'authenticated') return null;

  const bandStyle = profileStatusStyle(score ?? 0);
  const word = BAND_WORD[bandStyle.band] ?? 'In progress';
  const subtitle = greeting?.subtitle?.trim() || "We've found some jobs and connections for you.";
  const cadence = greeting?.cadenceLabel?.trim() || 'Updated everyday';

  return (
    <section aria-label="Your Docrud summary" className="flex w-full min-w-0 flex-col gap-2">

      {/* ── Greeting — a row, not a card: the card was most of the old height ── */}
      <div className="flex items-center gap-2.5 px-0.5">
        {greeting?.illustrationUrl
          ? <img src={greeting.illustrationUrl} alt="" aria-hidden loading="lazy" decoding="async"
              className="h-10 w-auto shrink-0 object-contain sm:h-11" />
          : <GreetingArtwork />}

        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 truncate text-[16px] font-bold tracking-[-0.02em] text-white sm:text-[17px]">
            Hey, {firstName} <span aria-hidden>👋</span>
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-white/40">{subtitle}</p>
        </div>

        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/32 sm:inline-flex">
          <CalendarDays className="h-3 w-3 shrink-0" /> {cadence}
        </span>
      </div>

      {/* ── Three readings in one strip ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          href="/jobs"
          label="Jobs"
          value={jobCount}
          caption="New matches"
          tint="rgba(16,185,129,0.13)"
          border="rgba(16,185,129,0.26)"
          icon={<Briefcase className="h-[15px] w-[15px] text-emerald-300" />}
        />
        <StatTile
          href="/people"
          label="Connections"
          value={peopleCount}
          caption="New people"
          tint="rgba(245,158,11,0.13)"
          border="rgba(245,158,11,0.26)"
          icon={<Users className="h-[15px] w-[15px] text-amber-300" />}
        />

        {/* Profile score reads as the third tile; the whole tile is the CTA,
            which is what removed the paragraph and two buttons. */}
        <Link href="/profile"
          className={`${TILE} justify-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2.5`}>
          <ScoreRing score={score} colour={bandStyle.ring} />
          {/* Stacked on a narrow phone — a 44px ring beside text in a third of
              360px leaves no room for the label, so it truncates to nothing. */}
          <div className="min-w-0 sm:flex-1">
            <p className="truncate text-[11px] font-semibold text-white/55">Profile Score</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] font-semibold"
              style={{ color: bandStyle.fg }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: bandStyle.ring }} aria-hidden />
              {score === null ? 'Loading' : word}
            </p>
            <p className="mt-1 hidden items-center gap-1 truncate text-[10.5px] font-semibold text-sky-300/70 transition group-hover:text-sky-200 sm:flex">
              Improve <ArrowUpRight className="h-3 w-3 shrink-0" />
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}
