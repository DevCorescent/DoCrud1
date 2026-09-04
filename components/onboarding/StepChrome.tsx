import { ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * The two pieces of chrome every step after Welcome shares: the progress bar
 * and the eyebrow/title/description block. Transferred from the design
 * source's `ProgressHeader` and `StepHeading`.
 *
 * `total` is a prop rather than a constant because the flow branches — the
 * individual and business paths do not have to be the same length, and Phase 5
 * onward decides that. The source hardcoded 6.
 */

export function OnboardingProgress({ step, total }: { step: number; total: number }) {
  const pct = Math.min(100, Math.max(0, (step / total) * 100));

  return (
    <div className="onboarding-progress">
      <div
        className="onboarding-progress-track"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Onboarding progress"
      >
        <div className="onboarding-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="skill-count">{step} / {total}</span>
    </div>
  );
}

export function StepHeading({
  eyebrow, title, description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="section-heading">{title}</h1>
      <p className="step-copy">{description}</p>
    </div>
  );
}

/**
 * The Back/Continue bar the shell renders as the card footer. Transferred from
 * the design source's navigation block; Welcome and the final steps omit it.
 */
export function StepNav({
  onBack, onContinue, canContinue,
}: {
  onBack: () => void;
  /** Omitted on a step that carries its own action and has nothing after it. */
  onContinue?: () => void;
  canContinue?: boolean;
}) {
  return (
    <>
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        <span>Back</span>
      </button>
      {onContinue && (
        <button
          type="button"
          className="primary-button step-nav-continue"
          onClick={onContinue}
          disabled={!canContinue}
        >
          <span>Continue</span>
          <ArrowRight aria-hidden="true" />
        </button>
      )}
    </>
  );
}
