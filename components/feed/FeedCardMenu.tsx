'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export type FeedCardMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * Task 10 header "more / options" menu.
 * Purely a container — every entry is an existing host handler passed in by the
 * card host. No new capability, no network calls of its own.
 */
export function FeedCardMenu({ items, label = 'More options' }: { items: FeedCardMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={`transition ${open ? 'text-white/70' : 'text-white/25 hover:text-white/60'}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="absolute right-0 top-6 z-30 min-w-[168px] overflow-hidden rounded-xl border border-white/[0.09] bg-[#111116] py-1 shadow-2xl"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); it.onSelect(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] font-semibold transition ${
                it.danger
                  ? 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
                  : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
              }`}
            >
              {it.icon && <span className="shrink-0 opacity-70">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
