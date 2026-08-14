/**
 * Profile completeness scoring.
 *
 * Derived from the stored profile every time it is asked for — nothing is
 * persisted, so the score can never go stale relative to the profile.
 *
 * Section weights follow the product spec. Two of the ten requested sections
 * have no dedicated field in this schema, so each maps onto the existing field
 * that carries the same meaning rather than inventing new storage:
 *   • "Portfolio / Projects"  → `achievements[]`   (the only work-samples list)
 *   • "Professional links"    → `socialLinks{}` or `website`
 * Everything else maps 1:1 onto a real UserProfileData field.
 *
 * Pure and dependency-free so the server, the profile page and any future
 * consumer (search ranking, opportunity matching, recommendations) can share
 * one definition. Nothing here reads or writes storage.
 */

export type ProfileSectionId =
  | 'photo' | 'headline' | 'bio' | 'skills' | 'experience'
  | 'education' | 'location' | 'interests' | 'portfolio' | 'links';

export interface ProfileSectionResult {
  id: ProfileSectionId;
  label: string;
  weight: number;
  complete: boolean;
  /** Field(s) this section reads, for debugging and future consumers. */
  field: string;
}

export interface ProfileScoreResult {
  score: number;                       // 0–100
  completedSections: ProfileSectionId[];
  missingSections: ProfileSectionId[];
  totalSections: number;
  sections: ProfileSectionResult[];
  tier: 'start' | 'started' | 'strong' | 'almost' | 'complete';
  /** Headline message for the tier. */
  message: string;
}

/** Only the fields scoring reads — keeps this usable from any layer. */
export interface ScorableProfile {
  avatarUrl?: string;
  headline?: string;
  bio?: string;
  location?: string;
  website?: string;
  skills?: string[];
  interests?: string[];
  experience?: Array<{ title?: string; company?: string; period?: string; desc?: string }>;
  education?: Array<{ degree?: string; school?: string; year?: string }>;
  achievements?: Array<{ title?: string; desc?: string }>;
  socialLinks?: Record<string, string | undefined | null>;
}

const filled = (v?: string | null, min = 1) => typeof v === 'string' && v.trim().length >= min;
const hasItems = (v?: unknown[] | null, min = 1) => Array.isArray(v) && v.filter(Boolean).length >= min;

/**
 * Weights are not equal: they reflect how much each section contributes to
 * being found and matched (skills and experience carry the most signal for
 * search and opportunity matching, cosmetic fields the least).
 */
const SECTIONS: Array<{
  id: ProfileSectionId; label: string; weight: number; field: string;
  isComplete: (p: ScorableProfile) => boolean;
}> = [
  { id: 'photo',      label: 'Profile photo', weight: 10, field: 'avatarUrl',
    isComplete: (p) => filled(p.avatarUrl) },
  { id: 'headline',   label: 'Headline',      weight: 10, field: 'headline',
    isComplete: (p) => filled(p.headline, 3) },
  { id: 'bio',        label: 'About',         weight: 10, field: 'bio',
    // A one-word bio adds nothing to discovery; ask for a real sentence.
    isComplete: (p) => filled(p.bio, 40) },
  { id: 'skills',     label: 'Skills',        weight: 15, field: 'skills',
    isComplete: (p) => hasItems(p.skills, 3) },
  { id: 'experience', label: 'Experience',    weight: 15, field: 'experience',
    isComplete: (p) => hasItems(p.experience) },
  { id: 'education',  label: 'Education',     weight: 10, field: 'education',
    isComplete: (p) => hasItems(p.education) },
  { id: 'location',   label: 'Location',      weight: 10, field: 'location',
    isComplete: (p) => filled(p.location, 2) },
  { id: 'interests',  label: 'Interests',     weight: 10, field: 'interests',
    isComplete: (p) => hasItems(p.interests, 2) },
  { id: 'portfolio',  label: 'Portfolio',     weight: 5,  field: 'achievements',
    isComplete: (p) => hasItems(p.achievements) },
  { id: 'links',      label: 'Professional links', weight: 5, field: 'socialLinks | website',
    isComplete: (p) => Object.values(p.socialLinks ?? {}).some((v) => filled(v)) || filled(p.website, 4) },
];

export const PROFILE_SCORE_TOTAL_WEIGHT = SECTIONS.reduce((n, s) => n + s.weight, 0); // 100

const TIER_MESSAGES: Record<ProfileScoreResult['tier'], string> = {
  start:    "Let's build your presence",
  started:  'Your profile is getting started',
  strong:   "You're building a strong profile",
  almost:   'Almost there — make it complete',
  complete: 'Your profile is complete',
};

export function profileScoreTier(score: number): ProfileScoreResult['tier'] {
  if (score >= 100) return 'complete';
  if (score >= 80) return 'almost';
  if (score >= 60) return 'strong';
  if (score >= 40) return 'started';
  return 'start';
}

/** The shared, authoritative calculation. */
export function calculateProfileScore(profile: ScorableProfile | null | undefined): ProfileScoreResult {
  const p = profile ?? {};
  const sections: ProfileSectionResult[] = SECTIONS.map((s) => ({
    id: s.id, label: s.label, weight: s.weight, field: s.field,
    complete: (() => { try { return s.isComplete(p); } catch { return false; } })(),
  }));

  const earned = sections.reduce((n, s) => n + (s.complete ? s.weight : 0), 0);
  const score = Math.max(0, Math.min(100, Math.round((earned / PROFILE_SCORE_TOTAL_WEIGHT) * 100)));
  const tier = profileScoreTier(score);

  return {
    score,
    completedSections: sections.filter((s) => s.complete).map((s) => s.id),
    missingSections: sections.filter((s) => !s.complete).map((s) => s.id),
    totalSections: sections.length,
    sections,
    tier,
    message: TIER_MESSAGES[tier],
  };
}

export const PROFILE_COMPLETION_CTA =
  'Complete your profile to build your presence on Docrud and match with opportunities.';
export const PROFILE_COMPLETE_SUBTITLE =
  "You're ready to build your presence and match with opportunities.";
