'use client';

/**
 * Persona — "Who are you?", the third onboarding step.
 *
 * Visually transferred from the design source's renderPersona(). Two things
 * differ, both deliberate:
 *
 *  1. THE OPTIONS ARE DATA, NOT MARKUP. The source hardcoded exactly two
 *     cards, Individual and Business, and treated them as both the persona and
 *     the account type. Here the list arrives as a prop from
 *     lib/onboarding-personas.ts, so Phase 11 can hand it the Super Admin
 *     configured set without touching this file, and each option carries the
 *     `accountKind` the flow actually branches on. See that file for why the
 *     two concepts must stay separate.
 *
 *  2. RADIOGROUP, NOT aria-pressed BUTTONS. The source used independent
 *     toggle buttons, which tells a screen reader these are separate on/off
 *     controls when in fact exactly one can be chosen. Docrud already made the
 *     other choice for the same problem — AccountTypeToggle is a radiogroup
 *     with arrow-key movement — so this matches the app rather than the
 *     prototype. The visual treatment is unchanged.
 *
 * Enter continues (when something is chosen) rather than selecting, because
 * arrow keys already select and the step needs a keyboard way forward that
 * matches NameStep. Space selects, as a radio should.
 */

import { useRef } from 'react';
import { Check } from 'lucide-react';
import type { PersonaOption } from '@/lib/onboarding-personas';
import { OnboardingProgress, StepHeading } from './StepChrome';

export default function PersonaStep({
  options,
  value,
  onChange,
  otherText,
  onOtherTextChange,
  onContinue,
  step = 3,
  total = 6,
}: {
  options: readonly PersonaOption[];
  value: string | null;
  onChange: (personaId: string) => void;
  /** Free text for the catch-all option, so nobody is forced into a label. */
  otherText: string;
  onOtherTextChange: (text: string) => void;
  onContinue: () => void;
  step?: number;
  total?: number;
}) {
  const groupRef = useRef<HTMLDivElement | null>(null);

  /* Arrow keys move and select, the way a native radio group does. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      if (value) { event.preventDefault(); onContinue(); }
      return;
    }
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !back) return;

    event.preventDefault();
    const current = options.findIndex(option => option.id === value);
    /* No selection yet: forward starts at the first option, back at the last. */
    const from = current === -1 ? (forward ? -1 : 0) : current;
    const next = (from + (forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next].id);
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
  };

  /* Roving tabindex: the group is one tab stop. Without a selection the first
     option carries it, so the group is always reachable. */
  const tabbableIndex = Math.max(0, options.findIndex(option => option.id === value));

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />
      <StepHeading
        eyebrow="Track / 03"
        title="Who are you?"
        description="Tell us what best describes you so we can tune your first view."
      />

      <div
        className="persona-options"
        role="radiogroup"
        aria-label="Who are you?"
        ref={groupRef}
        onKeyDown={onKeyDown}
      >
        {options.map((option, index) => {
          const selected = option.id === value;
          const Icon = option.icon;
          return (
            <button
              type="button"
              key={option.id}
              role="radio"
              aria-checked={selected}
              tabIndex={index === tabbableIndex ? 0 : -1}
              className={`persona-card${selected ? ' persona-card-selected' : ''}`}
              onClick={() => onChange(option.id)}
            >
              <span className="persona-icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="persona-card-text">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {selected && <Check className="persona-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* Only for the catch-all: a person the list does not describe can say so
          in their own words. Kept beside the persona id, never instead of it,
          so the branch still has something stable to read. */}
      {value === 'other' && (
        <label className="persona-other" htmlFor="onboarding-persona-other">
          <span className="field-label">Tell us in your own words</span>
          <div className="name-field-control">
            <input
              id="onboarding-persona-other"
              className="glass-input persona-other-input"
              value={otherText}
              onChange={event => onOtherTextChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && value) { event.preventDefault(); onContinue(); }
              }}
              placeholder="e.g. Career switcher, returning to work"
              autoComplete="off"
            />
          </div>
        </label>
      )}
    </div>
  );
}
