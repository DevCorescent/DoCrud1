'use client';

/**
 * The ATS report, in a dialog.
 *
 * WHY: the full report is long by design — five sections, a keyword table and
 * an action plan. Rendered inline it buried the form that produces it, so
 * re-analysing meant scrolling past the previous report to reach the button.
 * The report is a RESULT you open, read and dismiss; a dialog says that, and
 * an inline block does not.
 *
 * This component owns presentation only: the backdrop, sizing, scroll lock,
 * focus and keyboard handling. The report itself is <AtsResults />, unchanged
 * and unduplicated — one renderer serves the evaluator, the history page and
 * this dialog, so they cannot drift apart.
 */
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AtsResults } from './AtsResults';
import type { AtsApiResponse } from './ats-view-model';

const TITLE_ID = 'ats-results-modal-title';

export default function AtsResultsModal({
  open,
  result,
  jobTitle,
  onClose,
  footer,
}: {
  open: boolean;
  /** Null until an evaluation succeeds — the dialog never opens empty. */
  result: AtsApiResponse | null;
  jobTitle?: string;
  onClose: () => void;
  /** Extra actions beside Close, e.g. a link to history. */
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  /** Whatever was focused before opening, so it can be restored on close. */
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const isOpen = open && result !== null;

  /* Escape closes. Bound to the document so it works wherever focus sits. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  /**
   * Scroll lock.
   *
   * BOTH <html> and <body> are locked, deliberately. Locking only the body is
   * the usual recipe and it did not work here: measured in Chrome, the page
   * still scrolled behind the open dialog, because the scrolling element on
   * this layout is documentElement, not body. Setting overflow on one element
   * and assuming the other obeys is how a scroll lock silently does nothing.
   *
   * `paddingRight` compensates for the scrollbar the lock removes; without it
   * the page visibly jumps sideways as the dialog opens. Every value is read
   * before it is changed and restored exactly, so a page that already had its
   * own overflow or padding is left as it was found.
   */
  useEffect(() => {
    if (!isOpen) return;
    const root = document.documentElement;
    const { body } = document;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPadding: body.style.paddingRight,
    };
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.paddingRight = previous.bodyPadding;
    };
  }, [isOpen]);

  /* Focus in on open, and back to the trigger on close. */
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => closeRef.current?.focus(), 40);
    return () => {
      clearTimeout(t);
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  /**
   * Keep Tab inside the dialog.
   *
   * Without this, tabbing past the last control lands on the page behind —
   * which is inert to a sighted user but not to a keyboard one, who then has
   * no way back and no idea where they are.
   */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, []);

  /* Rendered only in the browser: createPortal has no server equivalent. */
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      /* z-10000 clears the global bottom navigation, which sits at 9995
         (components/GlobalBottomNav.tsx). At z-1000 the nav painted over the
         dialog's footer on mobile and its Close button was measurably
         unclickable — elementFromPoint returned the nav's label, not the
         button. Still below the nav's own profile-menu portal, so this cannot
         trap that menu behind the dialog. */
      className="fixed inset-0 z-[10000] flex items-start justify-center overflow-hidden p-2 sm:items-center sm:p-6"
      /* The backdrop closes on click; the panel below stops propagation, so a
         click that begins inside the report can never dismiss it. */
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-black/70" aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onKeyDown={onKeyDown}
        /* Mobile takes almost the whole screen (the p-2 above is the 8px
           inset); from sm it becomes a centred panel capped at 1080px. */
        className="relative flex max-h-[calc(100vh-16px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl sm:max-h-[88vh] sm:max-w-[1080px] dark:border-white/[0.10] dark:bg-[#08080b]"
      >
        {/* Header — stays put while the body scrolls. */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-6 dark:border-white/[0.08]">
          <div className="min-w-0">
            <h2 id={TITLE_ID} className="text-[15px] font-bold tracking-[-0.01em] sm:text-[17px]">
              ATS Analysis
            </h2>
            {jobTitle && (
              <p className="mt-0.5 truncate text-[12px] text-slate-600 dark:text-white/45">{jobTitle}</p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close ATS analysis"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:text-white/60 dark:hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Body — the only scrolling region. `overscroll-contain` stops a
            flick at the end of the list from scrolling the page behind. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-6">
          {/* AtsResults owns its own top margin; this cancels the double gap. */}
          <div className="-mt-6">
            <AtsResults result={result} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-white/[0.08]">
          {footer}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-white dark:text-[#020617] dark:hover:bg-white/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
