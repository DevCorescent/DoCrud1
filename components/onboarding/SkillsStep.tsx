'use client';

/**
 * Skills — "What are your skills?", the fifth onboarding step.
 *
 * Transferred from the design source's renderSkills(): heading row with the
 * count pinned to its right, then a wrap of toggle pills.
 *
 * ═══ CHECKBOXES, NOT BUTTONS ═══
 *
 * The source used the same aria-pressed chip it used for single-choice roles.
 * Several skills can be chosen at once, which is what a checkbox group means,
 * so each pill is a real <input type="checkbox"> inside its label. Space
 * toggles natively, the selected state is exposed properly, and the limit is
 * enforced by `disabled` rather than by a click handler that silently declines.
 * The pill looks identical.
 *
 * ═══ THE LIMIT ═══
 *
 * MAX_SKILLS is a product rule. At the limit the unchosen pills go disabled and
 * dimmed — the state is visible rather than a click that does nothing — while
 * every chosen pill stays enabled so a swap is always one click away. An 11th
 * cannot be added: the input is disabled, and the change handler re-checks the
 * cap regardless.
 *
 * ═══ NOTHING IS RECOMMENDED HERE ═══
 *
 * `SkillOption.recommended` is rendered if an authoritative source sets it.
 * This component never computes it, and no source sets it today — see
 * lib/onboarding-skills.ts. In particular it is never derived from an ATS
 * score, a match score, or a resume: those systems stay separate, and pre-auth
 * there is no resume to read.
 */

import { Check } from 'lucide-react';
import { MAX_SKILLS, type SkillOption } from '@/lib/onboarding-skills';
import { OnboardingProgress, StepHeading } from './StepChrome';

export default function SkillsStep({
  options,
  value,
  onChange,
  maxSkills = MAX_SKILLS,
  step = 5,
  total = 6,
  eyebrow = 'Skill signal / 05',
  title = 'What are your skills?',
  description = `Select up to ${MAX_SKILLS} skills that best represent you.`,
}: {
  options: readonly SkillOption[];
  value: readonly string[];
  onChange: (skills: string[]) => void;
  maxSkills?: number;
  step?: number;
  total?: number;
  /* Overridable so the business branch can supply its own copy later without
     this component learning what a persona is. */
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const selected = new Set(value);
  const atLimit = selected.size >= maxSkills;

  const toggle = (id: string) => {
    if (selected.has(id)) {
      onChange(value.filter(item => item !== id));
      return;
    }
    /* Re-checked here as well as via `disabled`, so the cap holds even if a
       caller renders the pills some other way. */
    if (selected.size >= maxSkills) return;
    onChange([...value, id]);
  };

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />

      <div className="skills-header">
        <StepHeading eyebrow={eyebrow} title={title} description={description} />
        <span className="skill-count" aria-live="polite">
          {selected.size} / {maxSkills}
        </span>
      </div>

      <div className="skills-options" role="group" aria-label={title}>
        {options.map(option => {
          const isSelected = selected.has(option.id);
          return (
            <label key={option.id}>
              <input
                type="checkbox"
                className="skill-pill-input"
                checked={isSelected}
                disabled={!isSelected && atLimit}
                onChange={() => toggle(option.id)}
              />
              <span className={`choice-chip${isSelected ? ' choice-chip-selected' : ''}`}>
                {isSelected && <Check aria-hidden="true" />}
                <span>{option.label}</span>
                {option.recommended && <span className="skill-count">Recommended</span>}
              </span>
            </label>
          );
        })}
      </div>

      {atLimit && (
        <p className="demo-note skills-note">
          That&apos;s {maxSkills} — remove one to choose a different skill.
        </p>
      )}
    </div>
  );
}
