'use client';

/**
 * Segmented Light / Dark theme toggle.
 *
 * A clean, accessible control that REUSES the existing color-mode mechanism
 * (app/components/ThemeController: applyColorMode / getStoredColorMode). It is a
 * controlled component — the caller owns the ColorMode state and persists via
 * applyColorMode — so it introduces no second theme system and no storage of
 * its own. Radiogroup semantics + roving tabindex give proper keyboard support
 * (Tab to the group, ← / → to switch), and selection is conveyed by aria-checked
 * and an icon+label, never by colour alone.
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
}: {
  value: ColorMode;
  onChange: (mode: ColorMode) => void;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(value === 'dark' ? 'light' : 'dark');
    }
  };

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
