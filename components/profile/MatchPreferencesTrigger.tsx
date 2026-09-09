'use client';

/**
 * The button that opens the matching-preferences dialog.
 *
 * Presentational and stateless: it owns no dialog and no preference state. Both
 * places that offer this — the profile-completion card and the About tab — hand
 * it the same data and the same `onOpen`, so one dialog is mounted once at page
 * level and cannot get out of step with itself.
 *
 * Two shapes for two contexts:
 *   `row`  — inside the completion card, where it sits among other tasks and
 *            has to say what completing it is worth.
 *   `card` — on the About tab, where it stands alone above the answers it
 *            governs.
 *
 * Both print the SAME summary sentence, from lib/match-preferences-ui.ts.
 */

import { Check, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { countAnswered, summarisePreferences, summarisePreferencesShort } from '@/lib/match-preferences-ui';

export default function MatchPreferencesTrigger({
  preferences,
  visibility,
  onOpen,
  variant = 'card',
  /** Points this section is worth, shown only while it is incomplete. */
  weight,
  /** Whether the completion model counts this section as done. */
  complete = false,
}: {
  /* `object` rather than an index signature: every caller holds a typed
     preference object, and none of them should have to cast to hand it over. */
  preferences?: object | null;
  visibility?: Record<string, string> | null;
  onOpen: () => void;
  variant?: 'card' | 'row';
  weight?: number;
  complete?: boolean;
}) {
  const answered = countAnswered(preferences);
  const summary = summarisePreferences(preferences, visibility);
  const shortSummary = summarisePreferencesShort(preferences, visibility);
  const action = answered === 0 ? 'Set up' : 'Edit';

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left transition hover:border-white/[0.16] hover:bg-white/[0.05] active:scale-[0.995]"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border transition ${
            complete
              ? 'border-emerald-400/25 bg-emerald-400/[0.10] text-emerald-300'
              : 'border-white/[0.08] bg-white/[0.04] text-white/45 group-hover:text-white/70'
          }`}
        >
          {complete
            ? <Check className="h-3.5 w-3.5" aria-hidden />
            : <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[12.5px] font-semibold text-white/80">How you want to be matched</span>
            {!complete && typeof weight === 'number' && (
              <span className="shrink-0 text-[10px] font-semibold text-emerald-300/55">+{weight}%</span>
            )}
          </span>
          {/* Short form where the row is tight, the full sentence where it
              fits — rather than one sentence truncated into nonsense. */}
          <span className="mt-0.5 block truncate text-[11.5px] text-white/40">
            <span className="sm:hidden">{shortSummary}</span>
            <span className="hidden sm:inline">{summary}</span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.10] px-2.5 py-1 text-[11px] font-semibold text-white/55 transition group-hover:border-white/25 group-hover:text-white/85">
          {action}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition hover:border-white/[0.16] hover:bg-white/[0.04]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.08] bg-white/[0.04]">
        <SlidersHorizontal className="h-4 w-4 text-white/50" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-white/85">How you want to be matched</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-white/40">{summary}</span>
      </span>
      <span className="shrink-0 rounded-full border border-white/[0.10] px-3 py-1.5 text-[12px] font-semibold text-white/60 transition group-hover:border-white/25 group-hover:text-white/85">
        {action}
      </span>
    </button>
  );
}
