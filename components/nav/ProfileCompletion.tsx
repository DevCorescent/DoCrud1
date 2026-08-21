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
import { ArrowRight, Sparkles } from 'lucide-react';
import { profileStatusStyle } from '@/lib/profile-score';

export interface NavAnnouncementConfig {
  enabled: boolean;
  text: string;
  href: string;
  /* Everything below is Super Admin copy/behaviour that only the desktop card
     reads. Optional so the mobile bar — and any older caller — is untouched. */
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  showProfileProgress?: boolean;
  showSpotsLeft?: boolean;
}

/**
 * Client-side fallback copy.
 *
 * /api/announcement already falls back to the stored defaults, so this is the
 * last resort for a failed or timed-out request: the desktop card must never
 * vanish just because one fetch did not land. Nothing here is a substitute for
 * the Super Admin config — it is only used when the server said nothing at all.
 */
export const DEFAULT_ANNOUNCEMENT: NavAnnouncementConfig = {
  enabled: true,
  text: 'Complete your profile to get premium',
  href: '/profile',
  subtitle: '',
  ctaLabel: '',
  ctaHref: '/profile',
  showProfileProgress: true,
  showSpotsLeft: true,
};

/**
 * Fills in anything the server left out. `enabled` is deliberately normalised
 * with `!== false` rather than `!!`: a settings record written before these
 * fields existed has no `enabled` key, and an absent switch means "on", not
 * "off". Only an explicit `false` from Super Admin hides the bar.
 */
export function normalizeAnnouncement(raw: Partial<NavAnnouncementConfig> | null | undefined): NavAnnouncementConfig {
  if (!raw) return { ...DEFAULT_ANNOUNCEMENT };
  const text = typeof raw.text === 'string' && raw.text.trim() ? raw.text.trim() : DEFAULT_ANNOUNCEMENT.text;
  return {
    enabled: raw.enabled !== false,
    text,
    href: typeof raw.href === 'string' && raw.href ? raw.href : DEFAULT_ANNOUNCEMENT.href,
    subtitle: raw.subtitle ?? '',
    ctaLabel: raw.ctaLabel ?? '',
    ctaHref: typeof raw.ctaHref === 'string' && raw.ctaHref ? raw.ctaHref : '',
    showProfileProgress: raw.showProfileProgress !== false,
    showSpotsLeft: raw.showSpotsLeft !== false,
  };
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

/**
 * Desktop gate — deliberately NOT the mobile one.
 *
 * Hidden for a Premium viewer, for an admin switch-off, for a closed schedule
 * window (which arrives as `enabled: false` from /api/announcement), and for a
 * profile that is already complete — offering Premium for finishing a finished
 * profile reads as broken.
 *
 * The one case this treats differently from the mobile gate is a null score.
 * Null means /api/me/badge has not answered yet, NOT 100: the card renders
 * without its ring rather than vanishing and popping back a moment later. Only
 * a resolved 100 hides it.
 */
export function shouldShowDesktopAnnouncement(
  announcement: NavAnnouncementConfig | null,
  premium: boolean,
  score: number | null,
): boolean {
  if (premium) return false;
  if (!announcement?.enabled) return false;
  if (!announcement.text) return false;
  /* Unresolved stays visible; only a real number can be complete. */
  if (score !== null && Number.isFinite(score) && score >= 100) return false;
  return true;
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
        style={{ color: s.fg, fontSize: 8 }}
      >
        {pct}%
      </span>
    </span>
  );
}

/** Soft highlight for the marketing word "Premium" only. */
function AnnouncementCopy({ text, fg, oneLine = false }: { text: string; fg: string; oneLine?: boolean }) {
  const parts = text.split(/(Premium)/g);
  return (
    <span
      className={`min-w-0 flex-1 text-left text-[11px] font-medium leading-[1.25]${
        /* With the badge sharing the row the copy would wrap to a second line
           and grow the bar, so it stays on one line and truncates instead. */
        oneLine ? ' overflow-hidden text-ellipsis whitespace-nowrap' : ''
      }`}
    >
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
  premium = false,
  freePremium = null,
}: {
  score: number | null;
  announcement: NavAnnouncementConfig | null;
  variant: 'desktop' | 'mobile';
  className?: string;
  /** Real Premium status, resolved server-side from the session. */
  premium?: boolean;
  /** Aggregate launch-allocation counter. Null while it is still loading. */
  freePremium?: { spotsLeft: number; totalSpots: number } | null;
}) {
  const desktop = variant === 'desktop';

  /* Two different gates on purpose — see shouldShowDesktopAnnouncement().
     Mobile keeps the completion-driven behaviour it has always had; desktop
     hides only for Premium, an admin switch-off, or a closed schedule window.
     Either way rendering nothing (rather than an empty shell) is what stops
     the row from reserving space. */
  if (desktop) {
    if (!shouldShowDesktopAnnouncement(announcement, premium, score)) return null;
  } else if (!shouldShowAnnouncement(announcement, score)) {
    return null;
  }

  /* Null until /api/me/badge answers. Desktop renders without the ring in that
     window; mobile never gets here with a null score. */
  const hasScore = score !== null && Number.isFinite(score);
  const pct = hasScore ? (score as number) : 0;
  const s = profileStatusStyle(pct);

  /* Copy depends on who is reading it:
       - Premium member with an incomplete profile: the nudge still applies,
         but the reward does not, so the promise is dropped from the wording.
       - Everyone else: the Super Admin copy, unless the free allocation is
         gone, in which case promising free Premium would be false.
     The spots counter is for people who could still claim one, so Premium
     members never see it. */
  const soldOut = !premium && freePremium?.spotsLeft === 0;
  const text = premium
    ? 'Complete your profile'
    : soldOut
      ? 'Free Premium spots are full'
      : announcement!.text;
  const showSpots = !premium && !!freePremium && freePremium.spotsLeft > 0;

  /* ── Desktop card ─────────────────────────────────────────────────────
     Same glass language as the Explore tiles beside it: blurred translucent
     surface, hairline gold border, one inner highlight. Every string and
     toggle below comes from the Super Admin config. */
  if (desktop) {
    const showRing = hasScore && announcement!.showProfileProgress !== false;
    const spotsVisible = showSpots && announcement!.showSpotsLeft !== false;
    const subtitle = (announcement!.subtitle ?? '').trim();
    const ctaLabel = (announcement!.ctaLabel ?? '').trim();
    const target = (announcement!.ctaHref ?? '').trim() || announcement!.href;
    const secondLine = subtitle;

    const cardStyle: CSSProperties = {
      color: 'rgba(255,255,255,0.80)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.055) 0%, rgba(8,9,12,0.72) 100%)',
      backdropFilter: 'blur(24px) saturate(150%)',
      WebkitBackdropFilter: 'blur(24px) saturate(150%)',
      border: '1px solid rgba(206,151,96,0.20)',
      boxShadow: '0 8px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)',
    };

    const inner = (
      <>
        {showRing && <AnnouncementScoreRing score={pct} size={30} />}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <AnnouncementCopy text={text} fg={s.fg} oneLine />
          {(secondLine || spotsVisible) && (
            <span className="flex min-w-0 items-center gap-1.5">
              {secondLine && (
                <span className="min-w-0 truncate text-[10px] leading-[13px] text-white/45">{secondLine}</span>
              )}
              {spotsVisible && (
                <span
                  className="shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0 text-[9px] leading-[14px] font-semibold tabular-nums"
                  style={{
                    color: 'rgba(226,178,124,0.88)',
                    borderColor: 'rgba(206,151,96,0.30)',
                    background: 'rgba(206,151,96,0.07)',
                  }}
                  title={`${freePremium!.spotsLeft.toLocaleString()} of ${freePremium!.totalSpots.toLocaleString()} free Premium spots remaining`}
                >
                  {freePremium!.spotsLeft.toLocaleString()} spots left
                </span>
              )}
            </span>
          )}
        </span>
        {ctaLabel ? (
          <span
            className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-[4px] text-[10px] font-semibold"
            style={{ color: s.fg, borderColor: 'rgba(206,151,96,0.30)', background: 'rgba(255,255,255,0.045)' }}
          >
            {ctaLabel}
          </span>
        ) : (
          /* No label configured: the circular arrow from the reference, which
             also doubles as the affordance that the whole pill is a link. */
          <span
            className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: 'rgba(206,151,96,0.32)', background: 'rgba(206,151,96,0.06)' }}
            aria-hidden="true"
          >
            {target
              ? <ArrowRight className="h-[13px] w-[13px]" style={{ color: 'rgba(226,178,124,0.90)' }} />
              : <Sparkles className="h-[12px] w-[12px]" style={{ color: s.ring, opacity: 0.85 }} />}
          </span>
        )}
      </>
    );

    /* Pill, not a rounded rectangle — matches the reference composition. */
    const cardBase = 'flex w-full max-w-[380px] min-w-0 items-center gap-2.5 rounded-full py-[7px] pl-[7px] pr-[7px] transition';
    const cardLabel = hasScore ? `${text} — profile ${pct}% complete` : text;

    if (target) {
      return (
        <Link
          href={target}
          aria-label={cardLabel}
          className={`${cardBase} hover:brightness-110 active:scale-[0.99] ${className ?? ''}`}
          style={cardStyle}
        >
          {inner}
        </Link>
      );
    }
    return (
      <div role="status" aria-label={cardLabel} className={`${cardBase} ${className ?? ''}`} style={cardStyle}>
        {inner}
      </div>
    );
  }

  /* ── Mobile bar — unchanged ───────────────────────────────────────────── */
  const inner = (
    <>
      <AnnouncementScoreRing score={pct} size={22} />
      {/* Always one line: a wrap is what used to make this a two-row card. */}
      <AnnouncementCopy text={text} fg={s.fg} oneLine />
      {showSpots && (
        <span
          className="shrink-0 whitespace-nowrap rounded-full border border-white/[0.12] bg-white/[0.05] px-1.5 py-0 text-[9px] leading-[13px] font-semibold tabular-nums text-white/55"
          title={`${freePremium!.spotsLeft.toLocaleString()} of ${freePremium!.totalSpots.toLocaleString()} free Premium spots remaining`}
        >
          {freePremium!.spotsLeft.toLocaleString()} spots left
        </span>
      )}
      <Sparkles
        className="h-[10px] w-[10px] shrink-0"
        style={{ color: s.ring, opacity: 0.85 }}
        aria-hidden="true"
      />
    </>
  );

  const base = 'flex w-full min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-1 text-white/80';

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
