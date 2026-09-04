'use client';

/**
 * Business space — "What space are you in?", the business branch's fourth step.
 *
 * Transferred from the design source's business variant of renderRole(): a
 * compact grid of space cards, two up on a phone and three up above 640px.
 *
 * ═══ NATIVE RADIOS ═══
 *
 * The source used aria-pressed buttons. These are real <input type="radio">
 * elements in a fieldset, visually replaced by the card. Exactly one can be
 * chosen, which is what a radio group means, and the browser then supplies
 * arrow-key movement, Space selection, the roving tab stop and the selected
 * state for free — no script, and nothing to get wrong. The card looks the
 * same. Enter continues, matching every other step.
 *
 * ═══ THE OPTIONS ARE REAL ═══
 *
 * They arrive as a prop from lib/onboarding-business-spaces.ts, which maps
 * Docrud's own industry list. The source's AI/Fintech/SaaS/Healthcare/
 * E-commerce/EdTech set is not used — see that file. Nothing on this screen
 * claims popularity, company counts or market size; no metric is shown at all.
 */

import { Check } from 'lucide-react';
import type { BusinessSpaceOption } from '@/lib/onboarding-business-spaces';
import { OnboardingProgress, StepHeading } from './StepChrome';

export default function BusinessSpaceStep({
  options,
  value,
  onChange,
  onContinue,
  step = 4,
  total = 6,
}: {
  options: readonly BusinessSpaceOption[];
  value: string | null;
  onChange: (spaceId: string) => void;
  onContinue: () => void;
  step?: number;
  total?: number;
}) {
  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />
      <StepHeading
        eyebrow="Business space / 04"
        title="What space are you in?"
        description="This tunes the talent we surface for you, and the roles we put your postings in front of."
      />

      <fieldset
        className="space-fieldset"
        onKeyDown={event => {
          if (event.key === 'Enter' && value) {
            event.preventDefault();
            onContinue();
          }
        }}
      >
        <legend className="onb-visually-hidden">What space are you in?</legend>
        <div className="space-options">
          {options.map(option => {
            const selected = option.id === value;
            const Icon = option.icon;
            return (
              <label key={option.id}>
                <input
                  type="radio"
                  name="onboarding-business-space"
                  className="space-input onb-visually-hidden"
                  value={option.id}
                  checked={selected}
                  onChange={() => onChange(option.id)}
                />
                <span className={`space-card${selected ? ' space-card-selected' : ''}`}>
                  <span className="space-card-head">
                    {Icon && <Icon aria-hidden="true" />}
                    <span className="space-card-label">{option.label}</span>
                    {selected && <Check className="space-card-check" aria-hidden="true" />}
                  </span>
                  {option.description && <small>{option.description}</small>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
