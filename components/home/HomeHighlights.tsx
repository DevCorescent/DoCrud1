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

import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, Users } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';
import { cachedJson } from '@/lib/client/request-cache';

export type HomeGreetingConfig = {
  subtitle: string;
  illustrationUrl: string;
};

const CARD = 'rounded-[20px] border border-white/[0.07] bg-white/[0.025]';

/* Desktop puts all four cards on ONE row. Two literal templates rather than a
   built string, because Tailwind only emits arbitrary values it can see in the
   source — a template assembled at runtime would produce no CSS.

   The second is used when the profile is complete and its card is gone: the
   remaining three take the freed width instead of leaving a hole. */
const ROW_4 = 'lg:grid-cols-[minmax(300px,1.55fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_minmax(280px,1.35fr)]';
const ROW_3 = 'lg:grid-cols-[minmax(300px,1.9fr)_minmax(180px,1fr)_minmax(180px,1fr)]';

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
  /** The accent colour as bare `r,g,b` channels. See WASH_* below. */
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
         like-for-like swap, not an approximation.

         Only the COLOUR travels inline now; the gradient itself lives in the
         stylesheet below, because the alphas have to differ per theme and an
         inline background-image would beat any rule that tried to change
         them. */
      style={{ '--wash-rgb': wash } as CSSProperties}
      className={`hh-wash group flex min-h-[124px] min-w-0 flex-col justify-between p-4 ${CARD} transition-colors hover:bg-white/[0.045]`}>
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

/* `--wash-rgb` takes bare channels, but the profile bands in
   lib/profile-score.ts are hex — so the score card's accent is converted here
   rather than duplicated as a second palette. A band colour that changes with
   the percentage then changes the card's glow with it, automatically. */
const channels = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '255,255,255';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

/* One accent per card, and none of them may collide with the score card.
   That card is the only DYNAMIC one — its glow follows the band colour, which
   moves through red, gold, yellow and green as the percentage changes — so the
   three fixed cards stay out of that warm range entirely. The greeting used to
   take the brand gold, which read as a duplicate of the score card whenever a
   profile sat in the Fair band; connections' amber collided with the same
   band. Keeping the fixed cards cool means every combination stays legible.

   Just the channels — the gradient that consumes them is WASH_CSS below. */
const WASH_VIOLET = '139,127,232';
const WASH_TEAL = '45,178,196';
const WASH_BLUE = '96,150,240';

/* The corner accent: a bottom-right glow with concentric rings rising out of
   it, built to the approved reference.

   Two layers, because one cannot do both jobs. The GLOW is a plain radial on
   the element's own background-image, anchored at the corner rather than
   inset from it — the light source is the corner itself. The RINGS are a
   repeating-radial-gradient on an ::after, since a repeating gradient tiles
   forever and would march evenly across the whole card; the mask is what
   fades them out with distance so they read as ripples from the corner and
   not as a pattern. Both share the corner as origin, so they stay one object.

   ONE set of alphas, not one per theme. An earlier attempt keyed the strength
   off `.dark`, which was the wrong hook twice over: the rule never matched on
   a default first paint (the server renders data-ui-mode="light" and adds no
   `.dark` class until ThemeController runs on mount), and even when it did
   match it was answering the wrong question — this card has no light variant.
   `bg-white/[0.025]` over `text-white` is its surface in every theme, so one
   accent covers both and the card underneath stays clearly dark.

   `overflow: hidden` is what keeps the rings inside the 20px radius, and the
   z-index rule is what keeps the count and its caption above them — an
   absolutely positioned ::after otherwise paints over static children. */
const WASH_CSS = `
  .hh-wash {
    position: relative;
    overflow: hidden;
    background-image: radial-gradient(
      circle at 100% 100%,
      rgba(var(--wash-rgb),0.40) 0%,
      rgba(var(--wash-rgb),0.21) 26%,
      rgba(var(--wash-rgb),0.09) 46%,
      rgba(var(--wash-rgb),0.03) 62%,
      transparent 76%);
  }
  .hh-wash::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: repeating-radial-gradient(
      circle at 100% 100%,
      transparent 0 42px,
      rgba(var(--wash-rgb),0.24) 42px 43.5px,
      transparent 43.5px 84px);
    -webkit-mask-image: radial-gradient(circle at 100% 100%, #000 0%, #000 34%, transparent 74%);
    mask-image: radial-gradient(circle at 100% 100%, #000 0%, #000 34%, transparent 74%);
  }
  .hh-wash > * { position: relative; z-index: 1; }
`;

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

export default function HomeHighlights({
  greeting,
  initialViewer = null,
  initialJobCount = null,
  initialPeopleCount = null,
}: {
  greeting?: HomeGreetingConfig | null;
  /* The last personalised totals the server knew for this viewer. Seeding state
     with them is what removes the visible 0 → 149 flash: the number is already
     in the first paint, and the refresh below only corrects it if it moved.
     Null means the server had nothing cheap to give, so the tile shows its
     existing skeleton and the fetch fills it in, exactly as before. */
  initialJobCount?: number | null;
  initialPeopleCount?: number | null;
  /* Who is signed in, resolved by the SERVER component that rendered the page.
     Without it this section had to wait for next-auth's client-side
     /api/auth/session round trip before `status` became 'authenticated' and the
     count requests were even allowed to start — a whole extra hop sitting in
     front of both numbers. With it, the requests fire on mount. */
  initialViewer?: { name: string | null; email: string | null } | null;
}) {
  const { data: session, status } = useSession();

  /* The server's answer wins while the client session resolves; once it has,
     they agree. Never invented: absent server data falls back to useSession
     exactly as before. */
  const signedIn = initialViewer !== null || status === 'authenticated';

  const [jobCount, setJobCount] = useState<number | null>(initialJobCount);
  const [peopleCount, setPeopleCount] = useState<number | null>(initialPeopleCount);
  const [score, setScore] = useState<number | null>(null);

  const firstName = useMemo(() => {
    const name = session?.user?.name?.trim()
      || initialViewer?.name?.trim()
      || session?.user?.email?.split('@')[0]
      || initialViewer?.email?.split('@')[0]
      || '';
    return name.split(/\s+/)[0] || 'there';
  }, [session?.user?.email, session?.user?.name, initialViewer]);

  useEffect(() => {
    if (!signedIn) return;
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

    /* Refresh in the background. A seeded number is already on screen, so this
       only ever corrects it — it never blanks the tile, and a failed refresh
       silently leaves the seeded value in place. */
    load('/api/recommendations/jobs', 'total', setJobCount);
    load('/api/recommendations/people', 'total', setPeopleCount);
    load('/api/me/badge', 'profileScore', setScore);

    return () => { active = false; };
  }, [signedIn]);

  // Signed out there is no "your" anything to report; the section stays hidden.
  if (!signedIn) return null;

  /* A complete profile has nothing to improve, so its card is not rendered at
     all and the row rebalances to three. `null` means the score has not loaded
     yet — the card stays, because hiding then reappearing would jump the
     layout. */
  const showScoreCard = score === null || score < 100;

  const bandStyle = profileStatusStyle(score ?? 0);
  const word = BAND_WORD[bandStyle.band] ?? 'In progress';
  const subtitle = greeting?.subtitle?.trim() || "We've found some jobs and connections for you.";

  return (
    /* Mobile/tablet stack; from lg the four cards share one grid row.
       `items-stretch` is what gives them equal height without a fixed value. */
    <section
      aria-label="Your Docrud summary"
      className={`flex w-full min-w-0 flex-col gap-2.5 px-2 sm:px-3 lg:grid lg:items-stretch lg:gap-2.5 ${showScoreCard ? ROW_4 : ROW_3}`}
    >
      <style>{WASH_CSS}</style>

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div
        className={`hh-wash relative flex items-center gap-3 overflow-hidden p-4 sm:p-5 ${CARD}`}
        style={{ '--wash-rgb': WASH_VIOLET } as CSSProperties}
      >
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[19px] font-bold tracking-[-0.02em] text-white sm:text-[21px]">
            Hey, {firstName} <span aria-hidden>👋</span>
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{subtitle}</p>
        </div>

        {/* No default artwork. The card is a greeting and a sentence, and both
            of the illustrations that have sat here — an animated character,
            then a 3D render — read as decoration on what is otherwise a plain
            information surface. Nothing replaces it: the text simply takes the
            width, which is the professional version of this card.

            A deployment that configures greeting.illustrationUrl still gets
            its image; that is an existing product setting, not a default.
            Deliberately SMALLER at lg than at sm: on desktop this card shares
            one row with three others and the tallest item sets the row height,
            so a 150px illustration would make the whole strip 150px tall for
            the sake of decoration. */}
        {greeting?.illustrationUrl && (
          <img
            src={greeting.illustrationUrl}
            alt="" aria-hidden loading="lazy" decoding="async"
            className="h-[86px] w-auto shrink-0 object-contain sm:h-[104px] lg:h-[88px]"
          />
        )}

        <Link href={RECOMMENDED_PEOPLE_HREF} aria-label="People you may know"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-white/55 transition hover:text-white/90 sm:right-4 sm:top-4">
          <Users className="h-4 w-4" />
        </Link>
      </div>

      {/* ── Match counts ─────────────────────────────────────────────────── */}
      {/* `lg:contents` dissolves this wrapper so its two cards become direct
          grid items of the row above — the nesting is exactly what forced them
          onto their own line. Below lg it stays a normal two-up grid. */}
      <div className="grid grid-cols-2 gap-2.5 lg:contents">
        <StatTile
          href={RECOMMENDED_JOBS_HREF}
          label="Jobs"
          value={jobCount}
          caption="New matches"
          wash={WASH_TEAL}
        />
        <StatTile
          href={RECOMMENDED_PEOPLE_HREF}
          label="Connections"
          value={peopleCount}
          caption="New people"
          wash={WASH_BLUE}
        />
      </div>

      {/* ── Profile score ──────────────────────────────────────────────────
          One row: the ring, then the band, the reason and a single action.
          "Edit Profile" is gone — two buttons pointing at the same profile was
          the bulk of this card's height, and "Improve score" is the one that
          says what to do. */}
      {/* The glow is keyed to bandStyle.ring — the SAME colour the ring and the
          "Improve score" link already use — so at 55% the card reads gold and
          at 80%+ it turns green with the band, without a palette of its own. */}
      {showScoreCard && (
      <div
        className={`hh-wash flex items-center gap-4 p-4 sm:gap-5 sm:p-5 ${CARD}`}
        style={{ '--wash-rgb': channels(bandStyle.ring) } as CSSProperties}
      >
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
      )}
    </section>
  );
}
