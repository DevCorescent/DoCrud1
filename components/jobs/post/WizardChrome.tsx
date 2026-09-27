'use client';

/**
 * The wizard's navigation furniture: the progress rail and the action bar.
 *
 * RESPONSIVE BY SHAPE, NOT BY SCALE. The rail is a labelled vertical list on
 * `lg`, a compact numbered row on tablets, and "Step 3 of 7" plus a bar on
 * phones. Shrinking seven labels to fit 320px would produce seven unreadable
 * words; changing what the indicator IS keeps it legible at every width.
 */

import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { STEPS, stepIndex, type StepId } from '@/lib/jobs/post-wizard';

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
  onJump: (id: StepId) => void;
}) {
  const index = stepIndex(current);
  return (
    <nav className="wz-rail" aria-label="Steps">
      <p className="wz-rail-t">Step {index + 1} of {STEPS.length}</p>
      <div className="wz-steps">
        {STEPS.map((s, i) => {
          const done = i < furthest;
          const on = s.id === current;
          /* A step you have not reached is not a destination yet — jumping to
             it would skip the validation that stands between them. */
          const reachable = i <= furthest;
          return (
            <button
              key={s.id}
              type="button"
              className="wz-step"
              data-on={on ? '1' : '0'}
              data-done={done ? '1' : '0'}
              disabled={!reachable}
              aria-current={on ? 'step' : undefined}
              onClick={() => reachable && onJump(s.id)}
            >
              <span className="wz-num" aria-hidden>
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              {s.title}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* Kept as names other files import; the styling lives in wizard.css now. */
export const BTN_PRIMARY = 'wz-go';
export const BTN_QUIET = 'wz-btn';

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
    <div className="wz-foot">
      {showBack && (
        <button type="button" onClick={onBack} className="wz-btn">
          <ArrowLeft size={15} aria-hidden /> Back
        </button>
      )}
      {secondary}
      <button type="button" onClick={onContinue} disabled={busy} className="wz-go">
        {busy
          ? <><Loader2 size={15} className="wz-spin" aria-hidden /> Working…</>
          : <>{continueLabel ?? 'Continue'} <ArrowRight size={15} aria-hidden /></>}
      </button>
    </div>
  );
}
