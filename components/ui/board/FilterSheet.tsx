'use client';

/**
 * The filter sheet, shared by every board.
 *
 * Extracted because it is the piece most likely to be got wrong twice. It
 * carries three decisions that took measurement to find:
 *
 *   · It is PORTALLED onto document.body. The boards render inside surfaces
 *     that declare `backdrop-filter`, and a blurred sheet nested under a
 *     filtered ancestor does not render as softer glass — it renders as grey
 *     rectangles over content that never gets painted. The toolbar it belongs
 *     to is also `position: sticky`, which creates a stacking context the
 *     sheet would otherwise be trapped inside.
 *   · Being outside the page root, the `--dh-*` tokens do not reach it, so its
 *     own root re-declares them (see filter-sheet.css). Every board's harness
 *     asserts those match the page, because the first version of this rendered
 *     white text on a white sheet: laid out, positioned, unreadable.
 *   · Its z-index clears the app's bottom navigation at 9995. Below that, the
 *     nav painted straight over the sheet's footer on every phone and there was
 *     no way to act on it.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import './filter-sheet.css';

export function FilterSheet({
  open, onClose, children, footer, count,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  count: number;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    /* The page behind a modal must not scroll. Compensating for the scrollbar's
       width keeps the layout from jumping sideways as it disappears. */
    const bar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (bar > 0) document.body.style.paddingRight = `${bar}px`;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      /* Tab stays inside the sheet while it is open. */
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    const raf = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('button')?.focus());

    return () => {
      document.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      restore.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="bd-sheet-root" role="presentation">
      <div className="bd-sheet-scrim" onClick={onClose} aria-hidden />
      <div
        className="bd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Filter roles"
        ref={panel}
      >
        <div className="bd-sheet-head">
          <span className="bd-sheet-grip" aria-hidden />
          <h2 className="bd-sheet-t">
            Filters
            {count > 0 && <span className="bd-sheet-n">{count}</span>}
          </h2>
          <button type="button" className="bd-sheet-x" onClick={onClose} aria-label="Close filters">
            <X size={16} />
          </button>
        </div>
        <div className="bd-sheet-body">{children}</div>
        <div className="bd-sheet-foot">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="bd-group">
      <h3 className="bd-group-t">{label}</h3>
      <div className="bd-group-b">{children}</div>
    </section>
  );
}

export function CheckRow({
  on, label, n, onClick,
}: { on: boolean; label: string; n?: number; onClick: () => void }) {
  return (
    <button type="button" className="bd-opt" data-on={on ? '1' : '0'} onClick={onClick} aria-pressed={on}>
      <span className="bd-opt-box" aria-hidden><Check size={11} strokeWidth={3} /></span>
      {label}
      {typeof n === 'number' && <span className="bd-opt-n">{n}</span>}
    </button>
  );
}
