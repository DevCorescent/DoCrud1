'use client';

/**
 * Phase 10 — the shared chrome for My Jobs.
 *
 * These are the marketplace's existing tokens, lifted out of JobDetailPage so
 * the three My Jobs panels cannot drift apart from each other or from /jobs.
 * Same shape language, same borders, same type scale.
 *
 * EVERY token carries a light value and a `dark:` value. The marketplace runs
 * under the global `data-ui-mode` toggle, so a bare `bg-white/[0.02]` — which
 * is what the old My Jobs page used throughout — renders as near-invisible
 * grey-on-white the moment someone switches to light mode.
 *
 * ═══ WHY THE COLOURS ARE ARBITRARY VALUES ═══
 *
 * `bg-[#ffffff]` rather than `bg-white`, `text-[#334155]` rather than
 * `text-slate-700`, and so on. These are the SAME colours; the difference is
 * that globals.css repaints Tailwind's named tokens in dark mode by SUBSTRING:
 *
 *   :root[data-ui-mode='dark'] body main [class*='bg-white']:not(button) {
 *     background-color: rgba(10, 10, 12, 0.78) !important;
 *   }
 *   :root[data-ui-mode='dark'] body button[class~='bg-white'] {
 *     color: rgb(2 6 23) !important;
 *   }
 *
 * `[class*='bg-white']` matches `dark:bg-white/[0.04]` too, and `:not(button)`
 * does not exclude an ANCHOR — so a `<Link>` styled as a primary CTA had its
 * background forced to near-black while its dark text stayed put: 1.0:1, an
 * invisible "Post a Job" button. The ghost buttons were hit by the second rule
 * and rendered slate-950 on a dark panel, equally unreadable.
 *
 * Both were measured in a real browser, not reasoned about. Escaping the token
 * names fixes it here without touching globals.css, which the rest of the app
 * depends on.
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  STATUS_DOT_CLASSES, STATUS_PILL_CLASSES, type StatusTone, initials, pageMeta,
} from '@/lib/job-ui-status';

/* ── Tokens ───────────────────────────────────────────────────────────────*/

export const PANEL =
  'rounded-2xl border border-slate-200 bg-[#ffffff] dark:border-white/[0.07] dark:bg-[rgba(255,255,255,0.02)]';
export const MUTED = 'text-slate-600 dark:text-white/45';
export const FAINT = 'text-slate-500 dark:text-white/30';
export const HEADING =
  'text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-white/35';

export const FIELD =
  'h-9 w-full rounded-[10px] border border-slate-300 bg-[#ffffff] px-3 text-[13px] text-slate-900 '
  + 'outline-none transition placeholder:text-slate-400 focus-visible:border-slate-400 '
  + 'dark:border-white/[0.08] dark:bg-[rgba(255,255,255,0.04)] dark:text-white dark:placeholder:text-white/20 '
  + 'dark:focus-visible:border-white/20 dark:focus-visible:bg-[rgba(255,255,255,0.06)]';

export const GHOST_BTN =
  'inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[10px] border border-slate-300 '
  + 'bg-[#ffffff] px-3 text-[12.5px] font-semibold text-[#334155] transition hover:bg-[#f8fafc] '
  + 'disabled:cursor-not-allowed disabled:opacity-60 '
  + 'dark:border-white/[0.10] dark:bg-[rgba(255,255,255,0.04)] dark:text-[rgba(255,255,255,0.55)] dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-[rgba(255,255,255,0.85)]';

export const PRIMARY_BTN =
  'inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[10px] bg-[#0f172a] px-3.5 '
  + 'text-[12.5px] font-bold text-white transition hover:bg-[#1e293b] '
  + 'disabled:cursor-not-allowed disabled:opacity-60 '
  + 'dark:bg-[#ffffff] dark:text-[#0b1220] dark:hover:bg-[rgba(255,255,255,0.90)]';

export const DANGER_BTN =
  'inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[10px] bg-rose-600 px-3.5 '
  + 'text-[12.5px] font-bold text-white transition hover:bg-rose-500 '
  + 'disabled:cursor-not-allowed disabled:opacity-60 '
  + 'dark:bg-rose-500 dark:hover:bg-rose-400';

/** A visible focus ring on every interactive element, in both modes. */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 '
  + 'focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-[#0A0A0C]';

/* ── Pill ─────────────────────────────────────────────────────────────────*/

/**
 * A status chip.
 *
 * The dot is decorative; the WORD carries the meaning. Status is never
 * conveyed by colour alone.
 */
export function Pill({ tone, children, className = '' }: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold ${STATUS_PILL_CLASSES[tone]} ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASSES[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

/* ── States ───────────────────────────────────────────────────────────────*/

export function Empty({ title, hint, action }: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${PANEL} flex flex-col items-center gap-2 px-6 py-14 text-center`}>
      <p className="text-[14px] font-semibold text-slate-800 dark:text-white/80">{title}</p>
      {hint ? <p className={`max-w-sm text-[12.5px] leading-relaxed ${MUTED}`}>{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** An error the user can act on. `role="alert"` so it is announced. */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert"
      className="flex flex-wrap items-center gap-3 rounded-[12px] border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/[0.08] dark:text-rose-200/90">
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={`${GHOST_BTN} ${FOCUS} h-8 shrink-0`}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Skeleton rows. `aria-busy` so a screen reader is told to wait. */
export function Skeletons({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${PANEL} h-[104px] animate-pulse`} />
      ))}
    </div>
  );
}

/* ── Pager ────────────────────────────────────────────────────────────────*/

/**
 * Server-side paging controls.
 *
 * Deliberately prev/next plus a count rather than numbered pages: the list is
 * paged on the server, and a job with 2,000 applicants would otherwise render
 * a hundred page buttons.
 */
export function Pager({ page, pageSize, total, onPage, label }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
  label: string;
}) {
  const meta = pageMeta({ page, pageSize, total });
  if (meta.total === 0) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 pt-1">
      <span className={`text-[12px] ${MUTED}`}>{meta.summary}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPage(meta.page - 1)} disabled={!meta.hasPrev}
          className={`${GHOST_BTN} ${FOCUS}`}>Previous</button>
        <button type="button" onClick={() => onPage(meta.page + 1)} disabled={!meta.hasNext}
          className={`${GHOST_BTN} ${FOCUS}`}>Next</button>
      </div>
    </nav>
  );
}

/* ── Sheet ────────────────────────────────────────────────────────────────*/

/**
 * The modal used for applicant detail, application detail and confirmations.
 *
 * A bottom sheet on phones and a centred panel from `sm` up — the same element
 * either way, so there is one focus trap and one Escape handler rather than
 * two implementations that can disagree.
 *
 * · Escape closes it, and so does a click on the backdrop.
 * · Focus moves in on open and returns to the trigger on close.
 * · Tab is trapped inside; body scroll is locked behind it.
 * · `max-h` plus an inner scroll area keeps it inside the viewport at 320px,
 *   and `pb-[env(safe-area-inset-bottom)]` keeps the last control clear of the
 *   phone home indicator and the app's fixed bottom navigation.
 */
export function Sheet({ open, title, onClose, children, footer, wide = false }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    /* Focus the panel itself rather than guessing at a first control: the
       first control may be a destructive one, and landing on it is hostile. */
    const raf = requestAnimationFrame(() => panelRef.current?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      cancelAnimationFrame(raf);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/70"
        onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-[#ffffff] shadow-2xl outline-none sm:max-h-[88dvh] sm:rounded-2xl dark:border-white/[0.10] dark:bg-[#111114] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/[0.07]">
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-bold text-slate-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-slate-300 bg-[#ffffff] text-slate-500 transition hover:bg-[#f8fafc] dark:border-white/[0.08] dark:bg-[rgba(255,255,255,0.04)] dark:text-white/48 dark:hover:bg-[rgba(255,255,255,0.08)] ${FOCUS}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/[0.07]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Small helpers ────────────────────────────────────────────────────────*/

/** A label/value pair. Renders nothing at all when the value is absent. */
export function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="min-w-0">
      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/25">{label}</dt>
      <dd className="mt-1 break-words text-[12.5px] font-semibold text-[#334155] dark:text-white/70">{value}</dd>
    </div>
  );
}

/** An avatar with initials as the fallback. Images are lazy — never eager. */
export function Avatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  const text = name.trim() ? name : 'Candidate';
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[#f1f5f9] text-[12px] font-bold text-slate-600 dark:border-white/[0.08] dark:bg-[rgba(255,255,255,0.06)] dark:text-white/60"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initials(text)}</span>
      )}
    </span>
  );
}
