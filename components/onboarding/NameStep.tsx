'use client';

/**
 * Name — the second onboarding step.
 *
 * Transferred from the design source's renderName(). Fully controlled by the
 * parent, so the flow Phase 11 builds owns the value and Back can return here
 * with what was typed still in place. This step stores nothing itself, calls
 * no endpoint, and creates no persistence of its own.
 *
 * If a resume ever supplies the name, the flow passes it in as `value` — this
 * component neither parses nor guesses one.
 *
 * Two deliberate notes on behaviour:
 *
 *  - AUTOFOCUS, by product decision. The design source did not focus the input
 *    and an earlier revision followed it, because focusing on entry moves a
 *    screen reader's cursor past the heading that explains what is being
 *    asked. The product owner asked for it, so it is here: typing works the
 *    moment the step opens. The heading is still the input's programmatic
 *    context through the wrapping <label>, so the question is announced with
 *    the field rather than skipped entirely.
 *  - ENTER CONTINUES, but only when the name is valid, and validity is just
 *    "not blank" — the source had no validation, and inventing rules about
 *    what a real name looks like gets people's names wrong.
 */

import { UserRound } from 'lucide-react';
import { OnboardingProgress, StepHeading } from './StepChrome';

/** A name is usable when it is not entirely whitespace. Nothing more. */
export function isNameValid(value: string): boolean {
  return value.trim().length > 0;
}

export default function NameStep({
  value,
  onChange,
  onContinue,
  step = 2,
  total = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter. The Continue button in the shell's nav calls it too. */
  onContinue: () => void;
  step?: number;
  total?: number;
}) {
  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />
      <StepHeading
        eyebrow="Identity / 02"
        title="What's your name?"
        description="Let's personalize your Docrud experience."
      />

      <label className="name-field" htmlFor="onboarding-profile-name">
        <span className="field-label">Full name</span>
        <div className="name-field-control">
          <UserRound className="field-icon" aria-hidden="true" />
          <input
            id="onboarding-profile-name"
            className="glass-input"
            value={value}
            onChange={event => onChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && isNameValid(value)) {
                event.preventDefault();
                onContinue();
              }
            }}
            placeholder="e.g. Alex Morgan"
            autoComplete="name"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- requested: the
            // step exists only to take this one value, so typing starts here.
            autoFocus
          />
        </div>
      </label>

      <p className="field-hint">
        Use the name you want to see across your personalized workspace.
      </p>
    </div>
  );
}
