'use client';

/**
 * Light / Dark theme toggle, in two shapes.
 *
 * `compact` is ONE button that flips the mode on a single click — what the
 * desktop nav wants, where the control sits in a row of 32px circular icon
 * buttons and a segmented pair with two words was simply too large for that
 * row. The default segmented pair stays for the mobile appearance menu, which
 * has the width for it and reads better as an explicit choice.
 *
 * Both shapes REUSE the existing color-mode mechanism
 * (app/components/ThemeController: applyColorMode / getStoredColorMode). This is
 * a controlled component — the caller owns the ColorMode state and persists via
 * applyColorMode — so it introduces no second theme system and no storage of
 * its own. The segmented shape gets radiogroup semantics + roving tabindex for
 * keyboard support (Tab to the group, ← / → to switch); the compact shape is a
 * switch. Either way state is conveyed by aria-checked and an icon or label,
 * never by colour alone.
 */
import type { KeyboardEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { ColorMode } from '@/app/components/ThemeController';

const OPTIONS: Array<{ mode: ColorMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
];

export function ThemeToggle({
  value,
  onChange,
  className = '',
  compact = false,
  pill = false,
}: {
  value: ColorMode;
  onChange: (mode: ColorMode) => void;
  className?: string;
  /** Single icon button that flips the mode per click, sized for a nav row. */
  compact?: boolean;
  /**
   * Single button showing the CURRENT mode as an icon plus its name.
   *
   * The mobile profile menu's row needs one control that reads as one control.
   * The segmented pair below states both options and asks the reader to spot
   * which is selected; at that size, next to a heading, a single button that
   * simply says what the theme IS is easier to parse and half the width.
   * Distinct from `compact`, which is icon-only for a nav row with no space
   * for a word.
   */
  pill?: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(value === 'dark' ? 'light' : 'dark');
    }
  };

  /* One button, not a radiogroup: with a single control there is nothing to
     move between, so a switch with its own state is the honest semantic. The
     label names the DESTINATION ("Switch to light mode") because that is what
     the click does — naming the current mode reads as a status, not an
     action. */
  /* ONE BUTTON, NOT A CHOICE OF TWO.
     A plain <button>, deliberately: with a single control there is no group to
     describe, so radiogroup/radio semantics would be a lie about what is on
     screen. The label names the DESTINATION ("Switch to light mode") because
     that is what pressing it does — naming the current mode would read as a
     status rather than an action, even though the visible text is the current
     mode, which is what a reader glancing at the row wants to know. */
  if (pill) {
    const next: ColorMode = value === 'dark' ? 'light' : 'dark';
    const Icon = value === 'dark' ? Moon : Sun;
    return (
      <button
        type="button"
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode`}
        onClick={() => onChange(next)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[12px] font-semibold text-white/85 transition active:scale-95 hover:bg-white/[0.11] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {value === 'dark' ? 'Dark' : 'Light'}
      </button>
    );
  }

  if (compact) {
    const next: ColorMode = value === 'dark' ? 'light' : 'dark';
    const Icon = value === 'dark' ? Moon : Sun;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={value === 'dark'}
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode`}
        onClick={() => onChange(next)}
        /* Geometry copied from the notification bell beside it, so the nav row
           keeps one button size rather than gaining a third. */
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50 transition active:scale-95 hover:bg-white/[0.09] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className}`}
      >
        <Icon className="h-[15px] w-[15px]" aria-hidden />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      onKeyDown={onKeyDown}
      className={`inline-flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] p-0.5 ${className}`}
    >
      {OPTIONS.map(({ mode, label, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} mode`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(mode)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              active ? 'bg-white/[0.12] text-white shadow-sm' : 'text-white/45 hover:text-white/75'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default ThemeToggle;
