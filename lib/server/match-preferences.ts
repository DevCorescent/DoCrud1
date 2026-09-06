/**
 * What a member tells us so we can match them to work — and who is allowed to
 * see each answer.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * The eligibility engine (lib/server/job-sources/eligibility.ts) has always
 * known how to reason about work modes, employment types, salary floors,
 * domains and work authorisation. It has never had anything to reason WITH:
 * its own comments say "the profile has no stored work-mode, employment-type,
 * salary or domain preference, so those rules cannot fire and correctly report
 * unknown". Every one of those rules has been sitting idle. This is the store
 * that feeds them.
 *
 * ═══ PRIVATE IS THE DEFAULT, AND IT IS ENFORCED BY CONSTRUCTION ═══
 *
 * These answers are not ordinary profile fields. A salary floor, a notice
 * period and a willingness to relocate are things a person may want used on
 * their behalf without being published to colleagues, recruiters or their
 * current employer.
 *
 * So visibility is per field, and `publicMatchPreferences` is an ALLOW-LIST: it
 * starts from nothing and copies across only what has been explicitly marked
 * public. A field added to this file later, a field written by an older client,
 * a field whose visibility record is missing or corrupt — all of them come out
 * private. There is no path through that function that leaks a value by
 * forgetting to redact it, because it never had the value to begin with.
 *
 * That matters here more than usual: the public profile endpoint spreads the
 * whole stored profile to any viewer and redacts a handful of fields
 * afterwards. Any preference added to `UserProfileData` without going through
 * this projection would be world-readable the moment it was written.
 *
 * ═══ NOTHING IS INFERRED ═══
 *
 * A preference is a statement a person made. Nothing here derives one from
 * behaviour, from a résumé, or from a job title, and an absent answer stays
 * absent rather than becoming a default that quietly filters work away from
 * somebody. `experienceYears` is the clearest case: the repository can guess a
 * seniority band from job titles, and the eligibility engine deliberately
 * refuses to use a guess to hard-reject a job.
 */

import { NEVER_PUBLISHED, visiblePreferences } from '@/lib/match-preferences-ui';

/* ─── The model ───────────────────────────────────────────────────────────── */

export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const EMPLOYMENT_TYPES = [
  'full_time', 'part_time', 'contract', 'internship', 'freelance', 'temporary',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const AVAILABILITY = [
  'immediately', 'within_30_days', 'within_90_days', 'not_looking',
] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const SALARY_PERIODS = ['year', 'month', 'hour'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const RELOCATION = ['yes', 'no', 'for_the_right_role'] as const;
export type Relocation = (typeof RELOCATION)[number];

export interface MatchPreferences {
  /** Cities the person will work in. Free text; the classifier canonicalises. */
  preferredLocations?: string[];
  /** Would they move for the job. */
  relocation?: Relocation;
  /** ISO 3166-1 alpha-2 codes they are authorised to work in. */
  workAuthorization?: string[];
  workModes?: WorkMode[];
  employmentTypes?: EmploymentType[];
  /** Domain ids from the job taxonomy — never a free-text label. */
  preferredDomains?: string[];
  /** Titles they are aiming for, in their own words. */
  desiredTitles?: string[];
  /** Years of experience they HAVE. Stated, never derived. */
  experienceYears?: number;
  /** The least they will accept. Meaningless without currency and period. */
  minSalary?: number;
  salaryCurrency?: string;
  salaryPeriod?: SalaryPeriod;
  availability?: Availability;
  /** Notice they must give their current employer, in days. */
  noticePeriodDays?: number;
  willingToTravel?: boolean;
  /** Languages they work in. */
  languages?: string[];
  /** Company sizes they want. Free text from a fixed list in the UI. */
  companySizes?: string[];
}

export type PreferenceKey = keyof MatchPreferences;

export type Visibility = 'public' | 'private';
export type PreferenceVisibility = Partial<Record<PreferenceKey, Visibility>>;

/**
 * The registry. One entry per answer, and it is the ONLY list — validation,
 * visibility, the editor and the About section all read from here, so a field
 * cannot exist in one of those places and be forgotten in another.
 */
export interface PreferenceField {
  key: PreferenceKey;
  label: string;
  /** What the About section calls it when it is public. */
  publicLabel: string;
  /** One line telling the person what it is used for. */
  help: string;
  /**
   * Whether this answer may EVER be shown publicly.
   *
   * Salary and notice period are `false`: they are used for matching and are
   * never published, whatever a client asks for. A person cannot accidentally
   * broadcast what they earn, and a bug in an editor cannot do it for them.
   */
  publishable: boolean;
  /** Where it is used, shown next to the field so the trade is legible. */
  usedFor: string;
}

export const PREFERENCE_FIELDS: readonly PreferenceField[] = [
  { key: 'preferredLocations', label: 'Preferred locations', publicLabel: 'Open to work in', publishable: true,
    help: 'Cities you would work in. Used to rank roles near you and to filter out ones you cannot take.',
    usedFor: 'Location matching' },
  { key: 'relocation', label: 'Open to relocating', publicLabel: 'Relocation', publishable: true,
    help: 'Whether a role elsewhere is worth considering.', usedFor: 'Location matching' },
  { key: 'workAuthorization', label: 'Authorised to work in', publicLabel: 'Work authorisation', publishable: true,
    help: 'Countries you can legally work in. Roles outside these are not shown as matches.',
    usedFor: 'Eligibility' },
  { key: 'workModes', label: 'Work mode', publicLabel: 'Work mode', publishable: true,
    help: 'Remote, hybrid or onsite. Roles that cannot offer any of these stop being recommended.',
    usedFor: 'Eligibility and ranking' },
  { key: 'employmentTypes', label: 'Employment type', publicLabel: 'Looking for', publishable: true,
    help: 'Full-time, contract, internship and so on.', usedFor: 'Eligibility and ranking' },
  { key: 'preferredDomains', label: 'Preferred fields', publicLabel: 'Fields', publishable: true,
    help: 'The kinds of work you want. Roles in these fields rank higher.', usedFor: 'Ranking' },
  { key: 'desiredTitles', label: 'Roles you want', publicLabel: 'Looking for roles like', publishable: true,
    help: 'Titles you are aiming for, in your words. Matched against job titles.', usedFor: 'Ranking' },
  { key: 'experienceYears', label: 'Years of experience', publicLabel: 'Experience', publishable: true,
    help: 'Compared only against a role that states its own minimum. Never guessed from your titles.',
    usedFor: 'Eligibility' },
  { key: 'minSalary', label: 'Minimum salary', publicLabel: '', publishable: false,
    help: 'The least you will accept. Roles that state less are not recommended. Never shown on your profile.',
    usedFor: 'Eligibility' },
  { key: 'salaryCurrency', label: 'Currency', publicLabel: '', publishable: false,
    help: 'The currency your minimum is in.', usedFor: 'Eligibility' },
  { key: 'salaryPeriod', label: 'Per', publicLabel: '', publishable: false,
    help: 'Whether that figure is per year, month or hour.', usedFor: 'Eligibility' },
  { key: 'availability', label: 'Availability', publicLabel: 'Availability', publishable: true,
    help: 'When you could start.', usedFor: 'Ranking' },
  { key: 'noticePeriodDays', label: 'Notice period', publicLabel: '', publishable: false,
    help: 'Days of notice you owe your current employer. Never shown on your profile.', usedFor: 'Ranking' },
  { key: 'willingToTravel', label: 'Willing to travel', publicLabel: 'Travel', publishable: true,
    help: 'Whether travel is acceptable.', usedFor: 'Ranking' },
  { key: 'languages', label: 'Languages', publicLabel: 'Languages', publishable: true,
    help: 'Languages you work in.', usedFor: 'Ranking' },
  { key: 'companySizes', label: 'Company size', publicLabel: 'Company size', publishable: true,
    help: 'The size of organisation you want to work in.', usedFor: 'Ranking' },
] as const;

const FIELD_BY_KEY = new Map<string, PreferenceField>(PREFERENCE_FIELDS.map((f) => [f.key, f]));

/* ─── Validation ──────────────────────────────────────────────────────────── */

const MAX_LIST = 12;
const MAX_ENTRY = 60;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function coerceList(v: unknown, allowed?: readonly string[]): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const value = str(raw).slice(0, MAX_ENTRY);
    if (!value) continue;
    const key = value.toLowerCase();
    if (allowed && !allowed.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(allowed ? key : value);
    if (out.length >= MAX_LIST) break;
  }
  return out.length ? out : undefined;
}

function coerceEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const value = str(v).toLowerCase() as T;
  return allowed.includes(value) ? value : undefined;
}

function coerceNumber(v: unknown, min: number, max: number): number | undefined {
  /* An ABSENT answer is not a zero. `Number('')` and `Number(null)` are both 0,
     and both are finite and in range — so without this guard a profile that had
     never been asked about salary would arrive at the eligibility engine
     stating a floor of zero, and one that had never stated its experience would
     claim zero years. Not answering has to stay distinguishable from answering
     with nothing. */
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  if (typeof v !== 'number' && typeof v !== 'string') return undefined;

  const n = typeof v === 'number' ? v : Number(str(v));
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : undefined;
}

/**
 * Everything a client sends, reduced to what this model actually allows.
 *
 * Unknown keys are dropped, lists are capped, enums are checked against their
 * own vocabulary and numbers against a sane range — so a client cannot write an
 * unbounded array, an arbitrary string where a domain id belongs, or a negative
 * salary into a profile row.
 */
export function coerceMatchPreferences(input: unknown): MatchPreferences {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: MatchPreferences = {};

  const preferredLocations = coerceList(v.preferredLocations);
  if (preferredLocations) out.preferredLocations = preferredLocations;

  const relocation = coerceEnum(v.relocation, RELOCATION);
  if (relocation) out.relocation = relocation;

  /* Two letters, upper-cased — an ISO country code, not a country name. */
  const auth = coerceList(v.workAuthorization);
  if (auth) {
    const codes = auth.map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
    if (codes.length) out.workAuthorization = codes;
  }

  const workModes = coerceList(v.workModes, WORK_MODES) as WorkMode[] | undefined;
  if (workModes) out.workModes = workModes;

  const employmentTypes = coerceList(v.employmentTypes, EMPLOYMENT_TYPES) as EmploymentType[] | undefined;
  if (employmentTypes) out.employmentTypes = employmentTypes;

  const preferredDomains = coerceList(v.preferredDomains);
  if (preferredDomains) out.preferredDomains = preferredDomains.map((d) => d.toLowerCase());

  const desiredTitles = coerceList(v.desiredTitles);
  if (desiredTitles) out.desiredTitles = desiredTitles;

  const years = coerceNumber(v.experienceYears, 0, 60);
  if (years !== undefined) out.experienceYears = years;

  const minSalary = coerceNumber(v.minSalary, 0, 1_000_000_000);
  if (minSalary !== undefined) out.minSalary = minSalary;

  const currency = str(v.salaryCurrency).toUpperCase();
  if (/^[A-Z]{3}$/.test(currency)) out.salaryCurrency = currency;

  const period = coerceEnum(v.salaryPeriod, SALARY_PERIODS);
  if (period) out.salaryPeriod = period;

  const availability = coerceEnum(v.availability, AVAILABILITY);
  if (availability) out.availability = availability;

  const notice = coerceNumber(v.noticePeriodDays, 0, 365);
  if (notice !== undefined) out.noticePeriodDays = notice;

  if (typeof v.willingToTravel === 'boolean') out.willingToTravel = v.willingToTravel;

  const languages = coerceList(v.languages);
  if (languages) out.languages = languages;

  const companySizes = coerceList(v.companySizes);
  if (companySizes) out.companySizes = companySizes;

  return out;
}

/**
 * A visibility record reduced to known keys and known values.
 *
 * A key that cannot be published is never recorded as public, whatever the
 * request says. That is the second lock on salary and notice period: even a
 * client that sets `minSalary: 'public'` gets a record that says private.
 */
export function coercePreferenceVisibility(input: unknown): PreferenceVisibility {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: PreferenceVisibility = {};
  for (const [key, value] of Object.entries(v)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;
    const visibility = str(value).toLowerCase();
    if (visibility !== 'public' && visibility !== 'private') continue;
    out[field.key] = visibility === 'public' && field.publishable ? 'public' : 'private';
  }
  return out;
}

/* ─── The public projection ───────────────────────────────────────────────── */

/**
 * What another person may see. An ALLOW-LIST, deliberately.
 *
 * It builds a new object from nothing and copies across only fields that are
 * BOTH publishable by this model AND explicitly marked public by their owner.
 * Everything else — unknown keys, unmarked keys, keys marked public that must
 * never be, values written by an older client — is simply never read, so no
 * future edit to the preference model can leak a value by forgetting to add a
 * redaction.
 */
export function publicMatchPreferences(
  preferences: MatchPreferences | undefined | null,
  visibility: PreferenceVisibility | undefined | null,
): MatchPreferences {
  /* Delegated to the client-safe projection so the API and the profile page
     run the SAME code. They used to be two implementations of one rule, which
     is how the About section ended up showing an owner answers they had
     switched off. */
  return visiblePreferences<MatchPreferences>(
    preferences, visibility as Record<string, string> | undefined | null,
  );
}

/** True when the owner has published at least one preference. */
export function hasPublicPreferences(
  preferences: MatchPreferences | undefined | null,
  visibility: PreferenceVisibility | undefined | null,
): boolean {
  return Object.keys(publicMatchPreferences(preferences, visibility)).length > 0;
}

/* ─── Feeding the matcher ─────────────────────────────────────────────────── */

/**
 * The shape lib/server/job-sources/eligibility.ts already understands.
 *
 * Its rules have been dormant for want of exactly this object. Nothing is
 * invented on the way across: a preference the member did not state stays
 * absent, which the evaluator reads as "no requirement" rather than as a
 * requirement of zero.
 */
export function toEligibilityPreferences(preferences: MatchPreferences | undefined | null) {
  const p = preferences ?? {};
  const out: {
    countries?: string[];
    cities?: string[];
    workModes?: WorkMode[];
    employmentTypes?: string[];
    domains?: string[];
    experienceYears?: number;
    minSalary?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
  } = {};

  if (p.workAuthorization?.length) out.countries = p.workAuthorization;
  /* A person open to relocating anywhere has not restricted their cities, and
     turning their current preference into a hard filter would hide exactly the
     roles they said they would move for. */
  if (p.preferredLocations?.length && p.relocation !== 'yes') {
    out.cities = p.preferredLocations.map((c) => c.toLowerCase());
  }
  if (p.workModes?.length) out.workModes = p.workModes;
  if (p.employmentTypes?.length) out.employmentTypes = p.employmentTypes;
  if (p.preferredDomains?.length) out.domains = p.preferredDomains;
  if (typeof p.experienceYears === 'number') out.experienceYears = p.experienceYears;
  /* A floor is only meaningful with both of its units. Sending a bare number
     would invite a comparison between figures in different currencies. */
  if (typeof p.minSalary === 'number' && p.salaryCurrency && p.salaryPeriod) {
    out.minSalary = p.minSalary;
    out.salaryCurrency = p.salaryCurrency;
    out.salaryPeriod = p.salaryPeriod;
  }
  return out;
}

/* ─── Wording ─────────────────────────────────────────────────────────────── */

const WORK_MODE_LABEL: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' };
const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract',
  internship: 'Internship', freelance: 'Freelance', temporary: 'Temporary',
};
const AVAILABILITY_LABEL: Record<string, string> = {
  immediately: 'Available immediately', within_30_days: 'Available within 30 days',
  within_90_days: 'Available within 90 days', not_looking: 'Not looking right now',
};
const RELOCATION_LABEL: Record<string, string> = {
  yes: 'Open to relocating', no: 'Not relocating', for_the_right_role: 'Would relocate for the right role',
};

/** One label per published preference, for the About section. */
export function describePublicPreferences(
  preferences: MatchPreferences | undefined | null,
  visibility: PreferenceVisibility | undefined | null,
): Array<{ key: string; label: string; value: string }> {
  const shown = publicMatchPreferences(preferences, visibility);
  const out: Array<{ key: string; label: string; value: string }> = [];
  const push = (key: PreferenceKey, value: string) => {
    if (!value) return;
    out.push({ key, label: FIELD_BY_KEY.get(key)?.publicLabel || key, value });
  };

  if (shown.preferredLocations?.length) push('preferredLocations', shown.preferredLocations.join(' · '));
  if (shown.relocation) push('relocation', RELOCATION_LABEL[shown.relocation] ?? shown.relocation);
  if (shown.workAuthorization?.length) push('workAuthorization', shown.workAuthorization.join(', '));
  if (shown.workModes?.length) push('workModes', shown.workModes.map((m) => WORK_MODE_LABEL[m] ?? m).join(' · '));
  if (shown.employmentTypes?.length) push('employmentTypes', shown.employmentTypes.map((t) => EMPLOYMENT_LABEL[t] ?? t).join(' · '));
  if (shown.preferredDomains?.length) push('preferredDomains', shown.preferredDomains.join(' · '));
  if (shown.desiredTitles?.length) push('desiredTitles', shown.desiredTitles.join(' · '));
  if (typeof shown.experienceYears === 'number') {
    push('experienceYears', `${shown.experienceYears} year${shown.experienceYears === 1 ? '' : 's'}`);
  }
  if (shown.availability) push('availability', AVAILABILITY_LABEL[shown.availability] ?? shown.availability);
  if (typeof shown.willingToTravel === 'boolean') push('willingToTravel', shown.willingToTravel ? 'Open to travel' : 'No travel');
  if (shown.languages?.length) push('languages', shown.languages.join(' · '));
  if (shown.companySizes?.length) push('companySizes', shown.companySizes.join(' · '));

  return out;
}

/** Which matching-relevant answers are still unanswered, for a nudge. */
export function missingMatchPreferences(preferences: MatchPreferences | undefined | null): PreferenceField[] {
  const p = preferences ?? {};
  return PREFERENCE_FIELDS.filter((field) => {
    const value = p[field.key];
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'string') return value.trim() === '';
    return false;
  });
}
