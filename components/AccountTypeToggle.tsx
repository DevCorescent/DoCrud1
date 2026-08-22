'use client';

/**
 * Individual ↔ Business selector, shared by login and signup.
 *
 * One component so the two surfaces cannot drift apart visually. It is a
 * segmented control, not a pair of links: the account context is state on the
 * page, and the surrounding form, layout and styling are identical either way.
 *
 * Accessibility follows the standard segmented-control pattern — a `radiogroup`
 * of `radio`s rather than `aria-pressed` buttons, because the options are
 * mutually exclusive and exactly one is always chosen. Arrow keys move between
 * them, which is what a screen-reader user expects from a group like this.
 *
 * Colours come from the same translucent white tokens the auth cards already
 * use, so it works on the dark auth surface and inside the inverted light-mode
 * shell without a second palette.
 */

import { useCallback, useRef } from 'react';

export type AccountKind = 'individual' | 'business';

/** Anything that is not exactly 'business' is an individual. */
export function normalizeAccountKind(value: string | null | undefined): AccountKind {
  return value === 'business' ? 'business' : 'individual';
}

const OPTIONS: Array<{ id: AccountKind; label: string }> = [
  { id: 'individual', label: 'Individual' },
  { id: 'business', label: 'Business' },
];

export default function AccountTypeToggle({
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  value: AccountKind;
  onChange: (next: AccountKind) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  /* Arrow keys cycle the group, matching native radio behaviour. */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    onChange(value === 'individual' ? 'business' : 'individual');
    /* Keep focus on the newly selected option. */
    requestAnimationFrame(() => {
      const next = ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      next?.focus();
    });
  }, [value, onChange]);

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label="Account type"
      onKeyDown={onKeyDown}
      className={`flex w-full gap-1 rounded-[11px] p-1 ${className}`}
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            /* Only the selected option is in the tab order — the group is one
               stop, and arrows move within it. */
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className="flex-1 rounded-[8px] px-3 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/55"
            style={
              selected
                ? { background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.92)' }
                : { background: 'transparent', color: 'rgba(255,255,255,0.45)' }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
