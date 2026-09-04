'use client';

/**
 * Who are you? — the account-type step.
 *
 * ═══ IT COLLECTS accountKind, NOT A PERSONA LABEL ═══
 *
 * This is the branch point of the whole flow, so it stores the value the flow
 * actually branches on: 'individual' or 'business'. Nothing downstream has to
 * map a display label back to a kind, and adding a persona later cannot
 * accidentally reroute anybody.
 *
 * The richer persona list (Student, Freelancer, Experienced Professional,
 * Other…) is NOT deleted — it lives on in lib/onboarding-personas.ts, to be
 * asked inside the individual flow where it describes someone rather than
 * routing them.
 *
 * ═══ A SELECT, NOT CARDS ═══
 *
 * Two mutually exclusive options do not need half a screen of cards. A native
 * <select> is smaller, is the control people already know, and brings its own
 * keyboard handling, screen-reader semantics and mobile picker for free.
 */

import type { AccountKind } from '@/lib/onboarding-personas';
import { OnboardingProgress, StepHeading } from './StepChrome';

export const ACCOUNT_KIND_OPTIONS: ReadonlyArray<{ value: AccountKind; label: string }> = [
  { value: 'individual', label: 'Candidate / Individual' },
  { value: 'business', label: 'Business' },
];

export default function PersonaStep({
  value,
  onChange,
  onContinue,
  step = 3,
  total = 7,
}: {
  value: AccountKind | null;
  onChange: (kind: AccountKind) => void;
  onContinue: () => void;
  step?: number;
  total?: number;
}) {
  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />
      <StepHeading
        eyebrow="Track / 03"
        title="Who are you?"
        description="Tell us how you'll use Docrud."
      />

      <label className="account-kind" htmlFor="onboarding-account-kind">
        <span className="onb-visually-hidden">Who are you?</span>
        <select
          id="onboarding-account-kind"
          className="glass-input account-kind-select"
          value={value ?? ''}
          onChange={event => onChange(event.target.value as AccountKind)}
          onKeyDown={event => {
            if (event.key === 'Enter' && value) { event.preventDefault(); onContinue(); }
          }}
        >
          <option value="" disabled>Choose one…</option>
          {ACCOUNT_KIND_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
