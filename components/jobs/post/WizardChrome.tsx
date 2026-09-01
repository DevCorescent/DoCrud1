'use client';

/**
 * The wizard's navigation furniture: the progress rail and the action bar.
 *
 * RESPONSIVE BY SHAPE, NOT BY SCALE. The rail is a labelled vertical list on
 * `lg`, a compact numbered row on tablets, and "Step 3 of 7" plus a bar on
 * phones. Shrinking seven labels to fit 320px would produce seven unreadable
 * words; changing what the indicator IS keeps it legible at every width.
 */

import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { STEPS, type StepId } from '@/lib/jobs/post-wizard';
import { FAINT, MUTED } from './ui';

/**
 * The step rail.
 *
 * A visited step is a real button — going back is one click, not six. A step
 * ahead of the furthest one reached is disabled rather than hidden, so the
 * shape of the flow is visible from the start without offering a jump past
 * validation.
 */
export function WizardProgress({
  current, furthest, onJump,
}: {
  current: StepId;
  furthest: number;
  onJump: (step: StepId) => void;
}) {
  const index = STEPS.findIndex((s) => s.id === current);

  return (
    <>
      {/* ── Phones: one line and a bar ─────────────────────────────────── */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-bold text-slate-800 dark:text-white/80">
            {STEPS[index]?.label}
          </p>
          <p className={`text-[12px] font-medium ${MUTED}`}>
            Step {index + 1} of {STEPS.length}
          </p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.08]"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={`Step ${index + 1} of ${STEPS.length}: ${STEPS[index]?.label}`}
        >
          <div
            className="h-full rounded-full bg-sky-600 transition-[width] duration-300 dark:bg-sky-400"
            style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Desktop: the labelled rail ─────────────────────────────────── */}
      <nav className="hidden lg:block" aria-label="Job posting steps">
        <ol className="flex flex-col gap-0.5">
          {STEPS.map((step, i) => {
            const done = i < index;
            const active = i === index;
            const reachable = i <= furthest;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => reachable && onJump(step.id)}
                  disabled={!reachable}
                  aria-current={active ? 'step' : undefined}
                  className={[
                    'group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                    active
                      ? 'bg-slate-900/[0.05] dark:bg-white/[0.07]'
                      : reachable
                        ? 'hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04]'
                        : 'cursor-not-allowed opacity-45',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                      done
                        ? 'bg-sky-600 text-white dark:bg-sky-500'
                        : active
                          ? 'border-2 border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300'
                          : 'border border-slate-300 text-slate-500 dark:border-white/15 dark:text-white/35',
                    ].join(' ')}
                  >
                    {/* The number is kept for a completed step too — assistive
                        tech reads position, and a tick alone loses it. */}
                    {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                    {done && <span className="sr-only">{i + 1} — completed</span>}
                  </span>
                  <span
                    className={[
                      'truncate text-[13.5px]',
                      active
                        ? 'font-bold text-slate-900 dark:text-white'
                        : `font-medium ${MUTED}`,
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

const BTN_BASE =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-5 text-[14px] font-bold '
  + 'transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 '
  + 'focus-visible:ring-sky-500 focus-visible:ring-offset-transparent';

/**
 * The primary action.
 *
 * `dark:text-[#0b1220]` is an ARBITRARY VALUE on purpose, not `text-slate-950`.
 * app/globals.css carries
 *   :root[data-ui-mode='dark'] body [class*='text-slate-950'] { color: #f8fafc !important }
 * and that match is a SUBSTRING one, so it also catches the `dark:` prefixed
 * form. On a `dark:bg-white` button that forced near-white text onto a white
 * fill — measured at 1.0:1, an invisible label. The hex is the same colour and
 * matches neither that rule nor the sibling `text-black` one.
 */
export const BTN_PRIMARY =
  `${BTN_BASE} bg-slate-900 text-white hover:bg-slate-800 `
  + 'dark:bg-white dark:text-[#0b1220] dark:hover:bg-white/90';

export const BTN_QUIET =
  `${BTN_BASE} border border-slate-300 bg-white/70 text-slate-800 hover:bg-white `
  + 'dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.09] dark:hover:text-white';

/**
 * The action bar.
 *
 * Sticky at the bottom of the viewport on phones so Continue is always in
 * reach, and `pb-[env(safe-area-inset-bottom)]` keeps it clear of the home
 * indicator. The scroll container carries matching bottom padding, so the bar
 * never sits on top of the last field.
 */
export function WizardFooter({
  onBack, onContinue, continueLabel = 'Continue', busy = false,
  showBack = true, secondary,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  busy?: boolean;
  showBack?: boolean;
  secondary?: React.ReactNode;
}) {
  return (
    <div
      className={
        /* FIXED, NOT STICKY, below `lg`.
           This bar is the last child of its container, and `position: sticky`
           has nothing to stick against in that position: the containing block
           ends where the bar does, so it simply sits at the end of the content.
           Measured at 320px, that put Continue below the fold on every step —
           the button vanished until the poster scrolled, which is the exact
           failure this redesign exists to remove. Fixed pins it to the viewport
           at every height; `main` carries matching bottom padding so it never
           covers the last field. From `lg` the layout is short enough that the
           bar returns to normal flow. */
        'fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-slate-50/90 backdrop-blur-xl '
        + 'px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 '
        + 'dark:border-white/[0.07] dark:bg-[rgba(10,10,12,0.92)] '
        + 'lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none '
        + 'lg:dark:bg-transparent'
      }
    >
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2.5">
        {showBack && (
          <button type="button" onClick={onBack} className={BTN_QUIET}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Back
          </button>
        )}
        {secondary}
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className={`${BTN_PRIMARY} ml-auto min-w-[130px]`}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>Working…</span>
              <span className="sr-only" role="status">Saving, please wait</span>
            </>
          ) : (
            <>
              {continueLabel} <ChevronRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export { FAINT, MUTED };
