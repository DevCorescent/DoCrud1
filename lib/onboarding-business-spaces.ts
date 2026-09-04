/**
 * Business spaces for the onboarding "What space are you in?" step.
 *
 * ═══ THIS IS THE REAL TAXONOMY, NOT A NEW ONE ═══
 *
 * These are Docrud's own industries, from lib/industry-presets.ts. That list is
 * already the authoritative one for business accounts:
 *
 *   · components/BusinessSignupForm.tsx renders it as the industry dropdown on
 *     the existing business signup.
 *   · components/BusinessSettingsCenter.tsx lets a business change it later.
 *   · lib/server/business.ts resolves the chosen key server-side.
 *
 * So the key chosen here is the same `IndustryKey` the business record already
 * stores, and the answer can be written straight to that field with no
 * translation table. It also does real work downstream:
 * `getIndustryWorkspaceProfile` drives dashboard focus, recommended modules and
 * starter templates, so this is a consequential answer, not a label.
 *
 * The design source hardcoded six spaces — AI, Fintech, SaaS, Healthcare,
 * E-commerce, EdTech. Those are not carried over. They are a prototype's
 * examples, they are not Docrud's industries, and adopting them would have
 * created a second taxonomy that the business record could not store.
 *
 * ═══ ON SUPER ADMIN CONTROL ═══
 *
 * These are NOT currently Super Admin configurable, and nothing here pretends
 * otherwise. They are a real, in-use application constant. `BusinessSpaceStep`
 * takes its options as a prop, so when an admin-managed source exists it can be
 * supplied without touching the component. Note that making this list editable
 * is a bigger change than it looks: the keys are referenced by the workspace
 * profiles, so an admin surface would have to manage those together.
 *
 * The labels here are the industry labels verbatim. The descriptions are the
 * profiles' own `summary` text, which is what makes each industry concrete.
 */

import type { ComponentType, SVGProps } from 'react';
import { Cpu, Factory, HeartPulse, Landmark, Scale, Users } from 'lucide-react';
import { industryOptions, type IndustryKey } from '@/lib/industry-presets';

export type BusinessSpaceOption = {
  /** An IndustryKey — the value the business record already stores. */
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

/** One icon per industry. Presentation only; the keys come from the source. */
const ICONS: Record<IndustryKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  technology: Cpu,
  hr_staffing: Users,
  legal_services: Scale,
  finance_ops: Landmark,
  healthcare: HeartPulse,
  manufacturing: Factory,
};

export const DEFAULT_BUSINESS_SPACE_OPTIONS: readonly BusinessSpaceOption[] =
  industryOptions.map(option => ({
    id: option.key,
    label: option.label,
    description: option.summary,
    icon: ICONS[option.key],
  }));
