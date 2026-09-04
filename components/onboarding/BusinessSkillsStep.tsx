'use client';

/**
 * Business skills — "What skills do you need?", the business branch's fifth
 * step.
 *
 * This is the same control as the individual Skills step with different copy,
 * so it delegates rather than duplicating. That matters: the ten-skill cap,
 * the duplicate guard and the checkbox semantics are product rules, and a
 * second copy of them would be a second place for them to drift. SkillsStep
 * already accepts its copy as props for exactly this reason.
 *
 * The DISTINCTION is in the question, and in what the parent does with the
 * answer: the individual step collects skills a person HAS, this one collects
 * skills a business NEEDS. The flow keeps them in separate state, so a person
 * who somehow reached both would not have one overwrite the other.
 */

import SkillsStep from './SkillsStep';
import { MAX_SKILLS, type SkillOption } from '@/lib/onboarding-skills';

export default function BusinessSkillsStep({
  options,
  value,
  onChange,
  maxSkills = MAX_SKILLS,
  step = 5,
  total = 6,
}: {
  options: readonly SkillOption[];
  value: readonly string[];
  onChange: (skills: string[]) => void;
  maxSkills?: number;
  step?: number;
  total?: number;
}) {
  return (
    <SkillsStep
      options={options}
      value={value}
      onChange={onChange}
      maxSkills={maxSkills}
      step={step}
      total={total}
      eyebrow="Talent stack / 05"
      title="What skills do you need?"
      description="Select the skills most relevant to your hiring needs."
    />
  );
}
