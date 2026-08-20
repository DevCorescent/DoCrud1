'use client';

/**
 * Top-navigation profile-completion surfaces.
 *
 * Both pieces below render the SAME number: the score returned by
 * /api/me/badge, which the server derives with calculateProfileScore() from
 * lib/profile-score.ts — the one calculation the profile page also uses.
 * Nothing here recomputes or hardcodes a percentage.
 *
 * Colour comes from profileStatusStyle() so the pill, the ring and the Super
 * Admin preview can never drift apart.
 */

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';

export interface NavAnnouncementConfig {
  enabled: boolean;
  text: string;
  href: string;
}

/** Shared gate — Super Admin's switch, then the viewer's own completion. */
export function shouldShowAnnouncement(
  announcement: NavAnnouncementConfig | null,
  score: number | null,
): boolean {
  if (!announcement?.enabled) return false;
  if (!announcement.text) return false;
  if (score === null || !Number.isFinite(score)) return false;
  return score < 100;
}

/* ── Compact completion ring (announcement only — not the avatar ring) ───── */

function AnnouncementScoreRing({ score, size = 34 }: { score: number; size?: number }) {
  const s = profileStatusStyle(score);
  const r = (size / 2) - 3;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={s.ring}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          opacity="0.9"
        />
      </svg>
      <span
        className="relative z-[1] font-bold tabular-nums leading-none"
        style={{ color: s.fg, fontSize: size >= 30 ? 9.5 : 9 }}
      >
        {pct}%
      </span>
    </span>
  );
}

/** Soft highlight for the marketing word "Premium" only. */
function AnnouncementCopy({ text, fg }: { text: string; fg: string }) {
  const parts = text.split(/(Premium)/g);
  return (
    <span className="min-w-0 flex-1 text-left text-[11.5px] font-medium leading-[1.35]">
      {parts.map((part, i) =>
        part === 'Premium' ? (
          <span key={i} className="font-semibold" style={{ color: fg }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

/* ── Announcement bar ─────────────────────────────────────────────────────── */

export function NavAnnouncementBar({
  score,
  announcement,
  variant,
  className,
}: {
  score: number | null;
  announcement: NavAnnouncementConfig | null;
  variant: 'desktop' | 'mobile';
  className?: string;
}) {
  // Rendering nothing at all (rather than an empty shell) is what keeps the
  // navigation from reserving space once the profile hits 100%.
  if (!shouldShowAnnouncement(announcement, score)) return null;

  const pct = score as number;
  const s = profileStatusStyle(pct);
  const desktop = variant === 'desktop';
  const text = announcement!.text;

  const inner = (
    <>
      <AnnouncementScoreRing score={pct} size={desktop ? 28 : 26} />
      <AnnouncementCopy text={text} fg={s.fg} />
      <Sparkles
        className={`shrink-0 ${desktop ? 'h-[13px] w-[13px]' : 'h-[11px] w-[11px]'}`}
        style={{ color: s.ring, opacity: 0.85 }}
        aria-hidden="true"
      />
    </>
  );

  /* Desktop: compact pill that sits beside Explore (parent caps width).
     Mobile: full-width strip under the top nav; text may wrap to 2 lines. */
  const base = desktop
    ? 'flex w-full max-w-[340px] min-w-0 items-center gap-2.5 rounded-2xl border px-2.5 py-1.5 text-white/80 transition'
    : 'flex w-full min-w-0 items-center gap-2.5 rounded-2xl border px-2.5 py-1.5 text-white/80';

  const style: CSSProperties = {
    color: 'rgba(255,255,255,0.78)',
    background: `linear-gradient(135deg, ${s.bg} 0%, rgba(8,9,12,0.72) 70%)`,
    borderColor: s.border,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 24px ${s.bg}`,
  };
  const label = `${text} — profile ${pct}% complete`;

  if (announcement!.href) {
    return (
      <Link
        href={announcement!.href}
        aria-label={label}
        className={`${base} hover:brightness-110 active:scale-[0.99] ${className ?? ''}`}
        style={style}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div role="status" aria-label={label} className={`${base} ${className ?? ''}`} style={style}>
      {inner}
    </div>
  );
}

/* ── Ring around the avatar ───────────────────────────────────────────────── */

/**
 * Draws a thin completion arc around whatever it wraps (the existing avatar
 * trigger — this does not replace or restyle the avatar itself).
 *
 * `showValue` is suppressed for Infinity members because the ∞ badge already
 * occupies the bottom of the same 32px avatar; the ring still conveys status.
 */
export function ProfileCompletionRing({
  score,
  showValue = false,
  className,
  children,
}: {
  score: number | null;
  showValue?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (score === null || !Number.isFinite(score)) {
    return <>{children}</>;
  }

  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const s = profileStatusStyle(pct);

  // 38px box around a 32px avatar; r=17.5 leaves the 1.5px stroke clear of it.
  const r = 17.5;
  const circumference = 2 * Math.PI * r;

  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ''}`}>
      <svg
        viewBox="0 0 38 38"
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-3px] h-[38px] w-[38px] -rotate-90"
      >
        <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
        <circle
          cx="19" cy="19" r={r}
          fill="none"
          stroke={s.ring}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          opacity="0.85"
        />
      </svg>
      {children}
      {showValue && (
        <span
          className="pointer-events-none absolute -bottom-[7px] left-1/2 z-20 -translate-x-1/2 rounded-full border px-1 text-[8px] font-bold leading-[12px] tabular-nums"
          style={{ color: s.fg, background: '#08090a', borderColor: s.border }}
        >
          {pct}
        </span>
      )}
    </span>
  );
}
