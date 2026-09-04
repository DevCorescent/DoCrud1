/**
 * The persona taxonomy for the onboarding "Who are you?" step.
 *
 * ═══ THIS IS A BOUNDARY, NOT THE TAXONOMY ═══
 *
 * The list below is a DEFAULT so the UI has something real to render before
 * the Super Admin surface exists. It is deliberately the only place the
 * options are written down, and `PersonaStep` takes them as a prop, so Phase 11
 * can swap this for the configured source without touching the component.
 *
 * When that wiring happens, the natural home is the existing Super Admin
 * settings infrastructure. Note that `lib/server/dropdown-options.ts` cannot
 * hold this as-is: its `DropdownOptionMap` is `Record<string, string[]>`, flat
 * strings with no room for a description, an icon or — critically — the
 * account kind below. Either that store grows a richer shape or personas get
 * their own key in the settings document.
 *
 * ═══ PERSONA IS NOT accountType ═══
 *
 * Docrud already has an authoritative binary account kind: 'individual' or
 * 'business'. It lives in the NextAuth session (types/next-auth.d.ts), decides
 * routing and permissions, and lib/server/auth.ts will NEVER change it after
 * an account exists.
 *
 * Persona is a finer, editorial description that sits ON TOP of that, which is
 * why every option carries `accountKind`. Four of the five defaults are kinds
 * of individual. Two rules follow, and both matter:
 *
 *   1. The onboarding flow branches on `accountKind`, never on the persona id,
 *      so adding "Career switcher" tomorrow cannot break the branch.
 *   2. Whatever eventually creates the account must send `accountKind` as the
 *      accountType — a persona id must never reach that field.
 *
 * The design source had exactly two cards, Individual and Business, and used
 * them as both the persona and the account type. That conflation is not
 * carried over.
 *
 * A recruiter maps to `business`: they arrive to find people, not roles, so the
 * business branch is the one that answers their question. If the product later
 * wants a distinct recruiter journey, it branches on the persona id — which is
 * exactly why the id is kept separate from the account kind.
 */

import type { ComponentType, SVGProps } from 'react';
import { Building2, FileSignature, GraduationCap, BriefcaseBusiness, UserRound, Users } from 'lucide-react';

/** Mirrors AccountKind in components/AccountTypeToggle.tsx, the existing owner. */
export type PersonaAccountKind = 'individual' | 'business';

/** The flow's branch discriminator. Same two values, named for how it is used. */
export type AccountKind = PersonaAccountKind;

export type PersonaOption = {
  /** Stable identifier. Persisted as the persona, never as the accountType. */
  id: string;
  label: string;
  description: string;
  /** Which side of Docrud's authoritative binary this persona belongs to. */
  accountKind: PersonaAccountKind;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const DEFAULT_PERSONA_OPTIONS: readonly PersonaOption[] = [
  {
    id: 'student',
    label: 'Student',
    description: 'Find internships, early roles and people to learn from.',
    accountKind: 'individual',
    icon: GraduationCap,
  },
  {
    id: 'professional',
    label: 'Experienced Professional',
    description: 'Find roles and connections that fit where you are headed.',
    accountKind: 'individual',
    icon: BriefcaseBusiness,
  },
  {
    id: 'freelancer',
    label: 'Freelancer',
    description: 'Find gigs, clients and projects on your own terms.',
    accountKind: 'individual',
    icon: UserRound,
  },
  {
    id: 'recruiter',
    label: 'Recruiter',
    description: 'Hire for roles — your own team or someone else\u2019s.',
    accountKind: 'business',
    icon: Users,
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Something else — we will keep it broad for now.',
    accountKind: 'individual',
    icon: FileSignature,
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Discover talent and build a sharper hiring space.',
    accountKind: 'business',
    icon: Building2,
  },
];

/** The account kind a persona id belongs to, or null when it is unknown. */
export function accountKindForPersona(
  personaId: string | null | undefined,
  options: readonly PersonaOption[] = DEFAULT_PERSONA_OPTIONS,
): PersonaAccountKind | null {
  return options.find(option => option.id === personaId)?.accountKind ?? null;
}
