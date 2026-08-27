'use client';

/**
 * The signed-in homepage opener: greeting → Jobs / Connections match counts →
 * profile score. Replaces the old Recents bar and the nav completion pill.
 *
 * Every number is real and already owned by an existing endpoint — nothing new
 * was invented to fill a tile:
 *   · Jobs        → /api/recommendations/jobs   `total` (uncapped match count)
 *   · Connections → /api/recommendations/people `total` (uncapped match count)
 *   · Score       → /api/me/badge               `profileScore` (derived, never stored)
 * A count that has not loaded shows a skeleton, and a genuine zero shows zero.
 *
 * Copy and artwork come from the Super Admin homepage config (`greeting`), so
 * the subtitle, cadence label and illustration are editable from the panel.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, Briefcase, CalendarDays, PencilLine, Users } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';

export type HomeGreetingConfig = {
  subtitle: string;
  cadenceLabel: string;
  illustrationUrl: string;
};

const CARD = 'rounded-[20px] border border-white/[0.07] bg-white/[0.025]';

/* Copy only — the bands themselves come from lib/profile-score.ts, so this
   card can never disagree with the profile page about how complete a profile
   is; it just says it in this card's voice. */
const BAND_WORD: Record<string, string> = {
  'low': 'Needs work',
  'medium-low': 'Fair',
  'medium-high': 'Good',
  'high': 'Great',
  'complete': 'Complete',
};

const BAND_HEADLINE: Record<string, string> = {
  'low': 'Let’s get you started',
  'medium-low': 'Good start',
  'medium-high': 'Good going',
  'high': 'Almost there',
  'complete': 'Your profile is complete',
};

/** The default artwork, so the card is never a broken image before an upload. */
function GreetingArtwork() {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden className="h-[86px] w-[108px] shrink-0 sm:h-[104px] sm:w-[130px]">
      <rect x="8" y="10" width="46" height="58" rx="6" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.13)" />
      <circle cx="21" cy="24" r="5" fill="rgba(255,255,255,0.20)" />
      <rect x="31" y="21" width="17" height="3" rx="1.5" fill="rgba(255,255,255,0.18)" />
      <rect x="15" y="36" width="33" height="3" rx="1.5" fill="rgba(255,255,255,0.14)" />
      <rect x="15" y="44" width="26" height="3" rx="1.5" fill="rgba(255,255,255,0.12)" />
      <rect x="15" y="52" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.10)" />
      <rect x="52" y="40" width="54" height="38" rx="7" fill="#1b1c20" stroke="rgba(255,255,255,0.14)" />
      <rect x="70" y="33" width="18" height="9" rx="3" fill="#1b1c20" stroke="rgba(255,255,255,0.14)" />
      <rect x="52" y="55" width="54" height="2.5" fill="rgba(255,255,255,0.10)" />
      <rect x="74" y="52" width="10" height="8" rx="2" fill="rgba(255,255,255,0.16)" />
      <circle cx="30" cy="76" r="9" fill="rgba(52,211,153,0.16)" stroke="rgba(52,211,153,0.30)" />
      <circle cx="46" cy="80" r="6" fill="rgba(52,211,153,0.11)" stroke="rgba(52,211,153,0.22)" />
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
    <Link href={href}
      className={`group relative flex min-w-0 flex-col overflow-hidden p-4 ${CARD} transition-colors hover:bg-white/[0.045]`}>
      {/* Soft corner wash, echoing the tile's own accent. */}
      <div className="pointer-events-none absolute -bottom-10 -right-8 h-28 w-28 rounded-full blur-2xl"
        style={{ background: tint }} aria-hidden />

      <span className="flex h-9 w-9 items-center justify-center rounded-[11px]"
        style={{ background: tint, border: `1px solid ${border}` }}>
        {icon}
      </span>

      <p className="relative mt-3 text-[13px] font-semibold text-white/60">{label}</p>

      {value === null
        ? <span className="relative mt-1.5 h-[30px] w-12 animate-pulse rounded-md bg-white/[0.06]" aria-hidden />
        : <p className="relative mt-0.5 text-[28px] font-bold leading-none tracking-[-0.02em] text-white">{value}</p>}

      <div className="relative mt-2.5 flex items-end justify-between gap-2">
        <span className="text-[12px] text-white/32">{caption}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.05] text-white/50 transition group-hover:text-white/85">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

/** The score ring. Stroke colour is the shared completion band, not a new palette. */
function ScoreRing({ score, colour }: { score: number | null; colour: string }) {
  const size = 92;
  const stroke = 7;
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
      <span className="absolute inset-0 flex items-center justify-center text-[19px] font-bold tracking-[-0.02em] text-white">
        {score === null ? '—' : `${score}`}<span className="ml-[1px] text-[12px] font-semibold text-white/45">%</span>
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
  const headline = BAND_HEADLINE[bandStyle.band] ?? 'Keep going';
  const subtitle = greeting?.subtitle?.trim() || "We've found some jobs and connections for you.";
  const cadence = greeting?.cadenceLabel?.trim() || 'Updated everyday';

  return (
    <section aria-label="Your Docrud summary" className="flex w-full min-w-0 flex-col gap-2.5">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className={`relative flex items-center gap-3 overflow-hidden p-4 sm:p-5 ${CARD}`}>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[19px] font-bold tracking-[-0.02em] text-white sm:text-[21px]">
            Hey, {firstName} <span aria-hidden>👋</span>
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{subtitle}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-white/32">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" /> {cadence}
          </p>
        </div>

        {greeting?.illustrationUrl
          ? <img src={greeting.illustrationUrl} alt="" aria-hidden loading="lazy" decoding="async"
              className="h-[86px] w-auto shrink-0 object-contain sm:h-[104px]" />
          : <GreetingArtwork />}

        <Link href="/people" aria-label="People you may know"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-white/55 transition hover:text-white/90 sm:right-4 sm:top-4">
          <Users className="h-4 w-4" />
        </Link>
      </div>

      {/* ── Match counts ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          href="/jobs"
          label="Jobs"
          value={jobCount}
          caption="New matches"
          tint="rgba(16,185,129,0.13)"
          border="rgba(16,185,129,0.26)"
          icon={<Briefcase className="h-[17px] w-[17px] text-emerald-300" />}
        />
        <StatTile
          href="/people"
          label="Connections"
          value={peopleCount}
          caption="New people"
          tint="rgba(245,158,11,0.13)"
          border="rgba(245,158,11,0.26)"
          icon={<Users className="h-[17px] w-[17px] text-amber-300" />}
        />
      </div>

      {/* ── Profile score ────────────────────────────────────────────────── */}
      <div className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5 ${CARD}`}>
        <div className="flex items-center gap-4 sm:flex-col sm:gap-2">
          <ScoreRing score={score} colour={bandStyle.ring} />
          <div className="sm:text-center">
            <p className="text-[12px] font-semibold text-white/45">Profile Score</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold sm:justify-center"
              style={{ color: bandStyle.fg }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: bandStyle.ring }} aria-hidden />
              {score === null ? 'Loading' : word}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold tracking-[-0.01em] text-white">
            {headline}, {firstName}!
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
            A complete profile gets 3x more visibility and better matches.
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <Link href="/profile"
              className="inline-flex h-10 items-center gap-1.5 rounded-[13px] border border-white/[0.10] bg-white/[0.05] px-4 text-[13px] font-semibold text-white/80 transition hover:bg-white/[0.09] hover:text-white">
              Edit Profile <PencilLine className="h-3.5 w-3.5" />
            </Link>
            <Link href="/profile#score"
              className="inline-flex h-10 items-center gap-1.5 rounded-[13px] px-1 text-[13px] font-semibold text-sky-300/80 transition hover:text-sky-200">
              Improve score <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
