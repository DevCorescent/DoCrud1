'use client';

/**
 * The signed-in homepage opener: greeting → Jobs / Connections → profile score.
 *
 * LAYOUT IS FIXED BY AN APPROVED REFERENCE: greeting card with the artwork on
 * its right and a people button in the corner, then the two count tiles side
 * by side, then the full-width profile-score card. It was once compacted into
 * a single strip and that is not this design — restore the reference, not the
 * strip. The score card is the one deliberate departure from it: a single row
 * — ring, band, reason, one action — rather than a stacked ring over two
 * buttons. "Edit Profile" is gone; both buttons pointed at the same page
 * and that pair was most of the card's height.
 *
 * THE COUNTS ARE RECOMMENDATIONS, NOT INVENTORY. Both tiles report the size of
 * the viewer's matched set and open that same set:
 *   · Jobs        → /api/recommendations/jobs   `total` → /jobs?recommended=1
 *   · Connections → /api/recommendations/people `total` → /people?recommended=1
 * A job counts only when it genuinely overlaps the profile (shared skill or
 * matching role); "remote" and "posted recently" alone are not a match, which
 * is what used to make the number read like the whole job board.
 *   · Score       → /api/me/badge `profileScore` (derived, never stored)
 * A count that has not loaded shows a skeleton, and a genuine zero shows zero.
 *
 * Copy and artwork come from the Super Admin homepage config (`greeting`).
 */

import { memo, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, Users } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';
import { cachedJson } from '@/lib/client/request-cache';
import AnimatedWelcomeCharacter from '@/components/home/AnimatedWelcomeCharacter';

export type HomeGreetingConfig = {
  subtitle: string;
  illustrationUrl: string;
};

const CARD = 'rounded-[20px] border border-white/[0.07] bg-white/[0.025]';

/** Where each tile sends you: the matched set itself, never the full listing. */
const RECOMMENDED_JOBS_HREF = '/jobs?recommended=1';
const RECOMMENDED_PEOPLE_HREF = '/people?recommended=1';

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

function StatTileBase({
  wash, label, value, caption, href,
}: {
  /** The corner accent, as a background-image. See WASH_* below. */
  wash: string;
  label: string; value: number | null; caption: string; href: string;
}) {
  return (
    <Link href={href}
      /* The accent is painted straight onto the card. It used to be a separate
         absolutely-positioned circle under `blur-2xl`, which cost an extra DOM
         node, a filter pass and its own compositor layer per tile — and forced
         `overflow-hidden` plus a `relative` wrapper on both children just to
         stack above it. The gradient below was matched against the blurred
         version pixel-wise (same peak alpha, same falloff start), so this is a
         like-for-like swap, not an approximation. */
      style={{ backgroundImage: wash }}
      className={`group flex min-h-[124px] min-w-0 flex-col justify-between p-4 ${CARD} transition-colors hover:bg-white/[0.045]`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-white/60">{label}</p>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.05] text-white/50 transition group-hover:text-white/85">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>

      <div>
        {value === null
          ? <span className="block h-[30px] w-12 animate-pulse rounded-md bg-white/[0.06]" aria-hidden />
          : <p className="text-[30px] font-bold leading-none tracking-[-0.02em] text-white">{value}</p>}
        <p className="mt-1.5 truncate text-[12px] text-white/32">{caption}</p>
      </div>
    </Link>
  );
}

/* The three counts arrive as three separate responses, so the section renders
   three times. Without this, both tiles re-rendered on each — including when
   only the profile score changed, which neither tile shows. Every prop is a
   primitive, so the comparison is exact and needs no useCallback. */
const StatTile = memo(StatTileBase);

/* Same geometry the blurred circle had: centred 24px in from the right edge and
   16px up from the bottom, fading out by ~84px. */
const wash = (r: number, g: number, b: number) =>
  `radial-gradient(84px 84px at calc(100% - 24px) calc(100% - 16px),`
  + ` rgba(${r},${g},${b},0.13) 0%, rgba(${r},${g},${b},0.105) 38%,`
  + ` rgba(${r},${g},${b},0.045) 62%, transparent 78%)`;
const WASH_EMERALD = wash(16, 185, 129);
const WASH_AMBER = wash(245, 158, 11);

/** The score ring. Stroke colour is the shared completion band, not a new palette. */
function ScoreRing({ score, colour }: { score: number | null; colour: string }) {
  const size = 84;
  const stroke = 9;
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
      <span className="absolute inset-0 flex items-center justify-center text-[21px] font-bold tracking-[-0.02em] text-white">
        {score === null ? '—' : `${score}`}<span className="ml-[1px] text-[12px] font-semibold text-white/50">%</span>
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

    /* Shared with the nav avatar ring (/api/me/badge) and the recommended-jobs
       carousel (/api/recommendations/jobs), which ask for the same data on the
       same page — cachedJson collapses those into one request each. The three
       here are independent and already run concurrently. */
    const load = async (url: string, key: 'total' | 'profileScore', set: (n: number) => void) => {
      try {
        const data = await cachedJson<Record<string, unknown>>(url);
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

  return (
    <section aria-label="Your Docrud summary" className="flex w-full min-w-0 flex-col gap-2.5">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className={`relative flex items-center gap-3 overflow-hidden p-4 sm:p-5 ${CARD}`}>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[19px] font-bold tracking-[-0.02em] text-white sm:text-[21px]">
            Hey, {firstName} <span aria-hidden>👋</span>
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{subtitle}</p>
        </div>

        {/* An uploaded illustration still wins; the animated character is the
            default.

            Mobile and tablet keep the ORIGINAL box exactly, so the card cannot
            gain height or shift where space is tight. Only from lg — where the
            card is wide and the left column is nowhere near full — does the
            character grow to read at roughly 40% of the card, which is the one
            place the reference asks for it. */}
        {greeting?.illustrationUrl
          ? <img src={greeting.illustrationUrl} alt="" aria-hidden loading="lazy" decoding="async"
              className="h-[86px] w-auto shrink-0 object-contain sm:h-[104px] lg:h-[150px]" />
          : <AnimatedWelcomeCharacter className="h-[86px] w-[108px] shrink-0 sm:h-[104px] sm:w-[130px] lg:h-[150px] lg:w-[190px]" />}

        <Link href={RECOMMENDED_PEOPLE_HREF} aria-label="People you may know"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-white/55 transition hover:text-white/90 sm:right-4 sm:top-4">
          <Users className="h-4 w-4" />
        </Link>
      </div>

      {/* ── Match counts ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          href={RECOMMENDED_JOBS_HREF}
          label="Jobs"
          value={jobCount}
          caption="New matches"
          wash={WASH_EMERALD}
        />
        <StatTile
          href={RECOMMENDED_PEOPLE_HREF}
          label="Connections"
          value={peopleCount}
          caption="New people"
          wash={WASH_AMBER}
        />
      </div>

      {/* ── Profile score ──────────────────────────────────────────────────
          One row: the ring, then the band, the reason and a single action.
          "Edit Profile" is gone — two buttons pointing at the same profile was
          the bulk of this card's height, and "Improve score" is the one that
          says what to do. */}
      <div className={`flex items-center gap-4 p-4 sm:gap-5 sm:p-5 ${CARD}`}>
        <ScoreRing score={score} colour={bandStyle.ring} />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-white/40">
            Profile Score
            <span className="flex items-center gap-1.5 normal-case tracking-normal" style={{ color: bandStyle.fg }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: bandStyle.ring }} aria-hidden />
              <span className="text-[12px] font-semibold">{score === null ? 'Loading' : word}</span>
            </span>
          </p>

          <p className="mt-1.5 text-[13px] leading-snug text-white">
            A complete profile gets 3x more visibility.
          </p>

          {/* The link takes the band's own colour, so the card reads as one
              object instead of a gold ring beside an unrelated blue link. */}
          <Link href="/profile#score"
            className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-bold transition-opacity hover:opacity-80"
            style={{ color: bandStyle.fg }}>
            Improve score <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
