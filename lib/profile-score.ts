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
  { id: 'photo',      label: 'Profile Photo', weight: 10, field: 'avatarUrl',
    isComplete: (p) => filled(p.avatarUrl) },
  { id: 'headline',   label: 'Headline',      weight: 10, field: 'headline',
    isComplete: (p) => filled(p.headline, 3) },
  { id: 'bio',        label: 'About/Bio',         weight: 10, field: 'bio',
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
  { id: 'links',      label: 'Professional Links', weight: 5, field: 'socialLinks | website',
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
  'Complete your profile to build your presence on Docrud and match with relevant opportunities.';
export const PROFILE_COMPLETE_SUBTITLE =
  "You're ready to build your presence and match with opportunities.";

/* ────────────────────────────────────────────────────────────────────────────
   Completion status bands.

   Separate from `tier` on purpose: `tier` drives the encouraging copy on the
   profile page (its 40/60/80 thresholds are tuned to that message ladder),
   while a band drives the *colour* of the completion indicators. Both read the
   same `score`, so they can never disagree about how complete a profile is.

   One definition, three consumers: the nav announcement pill, the ring around
   the avatar, and the Super Admin preview.
   ──────────────────────────────────────────────────────────────────────────── */

export type ProfileStatusBand = 'low' | 'medium-low' | 'medium-high' | 'high' | 'complete';

export interface ProfileStatusStyle {
  band: ProfileStatusBand;
  label: string;
  /** Muted pastel tokens — soft fill, low-contrast border, readable text. */
  fg: string;
  bg: string;
  border: string;
  /** Stroke for the ring around the avatar. */
  ring: string;
}

export function profileStatusBand(score: number): ProfileStatusBand {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 100) return 'complete';
  if (s >= 80) return 'high';
  if (s >= 60) return 'medium-high';
  if (s >= 30) return 'medium-low';
  return 'low';
}

const STATUS_STYLES: Record<ProfileStatusBand, ProfileStatusStyle> = {
  'low': {
    band: 'low', label: 'Low',
    fg: '#e9a7ac', bg: 'rgba(214,109,118,0.10)', border: 'rgba(214,109,118,0.24)', ring: '#d66d76',
  },
  'medium-low': {
    band: 'medium-low', label: 'Medium low',
    fg: '#e3bb92', bg: 'rgba(206,151,96,0.10)', border: 'rgba(206,151,96,0.24)', ring: '#ce9760',
  },
  'medium-high': {
    band: 'medium-high', label: 'Medium high',
    fg: '#ddcd94', bg: 'rgba(197,175,98,0.10)', border: 'rgba(197,175,98,0.24)', ring: '#c5af62',
  },
  'high': {
    band: 'high', label: 'High',
    fg: '#a9d3b6', bg: 'rgba(108,178,133,0.10)', border: 'rgba(108,178,133,0.24)', ring: '#6cb285',
  },
  'complete': {
    band: 'complete', label: 'Complete',
    fg: '#a9d3b6', bg: 'rgba(108,178,133,0.10)', border: 'rgba(108,178,133,0.24)', ring: '#6cb285',
  },
};

export function profileStatusStyle(score: number): ProfileStatusStyle {
  return STATUS_STYLES[profileStatusBand(score)];
}
