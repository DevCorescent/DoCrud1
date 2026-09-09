/**
 * Counting and wording for matching preferences, shared by every surface that
 * summarises them.
 *
 * Client-safe and dependency-free on purpose: the profile-completion card, the
 * About-tab card and the editor's own footer all state "N answers · M shown",
 * and three implementations of that sentence is three chances for them to
 * disagree in front of the same person.
 *
 * ═══ "SHOWN" MEANS SHOWN ═══
 *
 * The count of published answers mirrors `publicMatchPreferences` on the
 * server, which skips a field that is marked public but holds no value. The
 * first version of this counted visibility marks alone, so a profile with
 * eleven fields switched on and three filled in announced "11 shown on your
 * profile" — while a visitor saw three. A number about privacy has to be the
 * number that is true.
 */

/**
 * Every answer the model knows about, in the order a profile lists them.
 *
 * This is what makes the projection below an ALLOW-LIST rather than a filter:
 * it iterates THESE keys, never the keys of whatever object it was handed, so a
 * field the model has never heard of cannot be published by putting it in a
 * stored profile and marking it public.
 */
export const PREFERENCE_KEYS = [
  'desiredTitles', 'preferredLocations', 'relocation', 'workModes',
  'employmentTypes', 'preferredDomains', 'experienceYears', 'availability',
  'workAuthorization', 'languages', 'companySizes', 'willingToTravel',
  'minSalary', 'salaryCurrency', 'salaryPeriod', 'noticePeriodDays',
] as const;

/** Answers the model refuses to publish, whatever a visibility record says. */
export const NEVER_PUBLISHED = new Set<string>([
  'minSalary', 'salaryCurrency', 'salaryPeriod', 'noticePeriodDays',
]);

/** The keys a profile may ever show. Derived, so the two lists cannot drift. */
export const PUBLISHABLE_KEYS: readonly string[] =
  PREFERENCE_KEYS.filter((k) => !NEVER_PUBLISHED.has(k));

/** True when an answer has actually been given. */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/** How many answers this person has stated. */
export function countAnswered(preferences: object | undefined | null): number {
  if (!preferences || typeof preferences !== 'object') return 0;
  return Object.values(preferences).filter(isAnswered).length;
}

/**
 * The answers a VISITOR would see — the projection itself, not just a count.
 *
 * An allow-list, exactly like the server's: it starts from nothing and copies
 * across only what is publishable AND marked public AND actually answered. It
 * lives here, client-safe, because two surfaces need it — the API when it
 * builds a response, and the profile page when it re-renders after a save
 * without waiting for a refetch. One implementation, so the page and the API
 * can never disagree about what is public.
 */
export function visiblePreferences<T extends object>(
  preferences: T | undefined | null,
  visibility: Record<string, string> | undefined | null,
): Partial<T> {
  if (!preferences || typeof preferences !== 'object') return {};
  const marks = (visibility && typeof visibility === 'object' ? visibility : {}) as Record<string, string>;
  const source = preferences as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  /* Iterating the KNOWN keys, never the object's own or the marks' own, is what
     stops a field the model does not recognise from being published by writing
     it into a profile and marking it public. */
  for (const key of PUBLISHABLE_KEYS) {
    if (marks[key] !== 'public') continue;
    if (!isAnswered(source[key])) continue;
    out[key] = source[key];
  }
  return out as Partial<T>;
}

/**
 * How many answers a visitor would actually SEE.
 *
 * Three conditions, all required — the same three the server applies:
 * publishable at all, marked public by its owner, and holding a value.
 */
export function countShown(
  preferences: object | undefined | null,
  visibility: Record<string, string> | undefined | null,
): number {
  if (!preferences || !visibility) return 0;
  return Object.keys(visiblePreferences(preferences, visibility)).length;
}

/**
 * The same fact, in as few words as it can be said.
 *
 * The row inside the completion card has an icon, a title, a percentage and an
 * Edit button competing for 390px, and the full sentence truncated to
 * "3 shown on your …" — which loses the only word that carried the meaning.
 */
export function summarisePreferencesShort(
  preferences: object | undefined | null,
  visibility: Record<string, string> | undefined | null,
): string {
  const answered = countAnswered(preferences);
  if (answered === 0) return 'Not set up yet';
  const shown = countShown(preferences, visibility);
  return `${answered} answer${answered === 1 ? '' : 's'} · ${shown === 0 ? 'none shown' : `${shown} shown`}`;
}

/** The one-line summary every surface prints, so they cannot drift apart. */
export function summarisePreferences(
  preferences: object | undefined | null,
  visibility: Record<string, string> | undefined | null,
): string {
  const answered = countAnswered(preferences);
  if (answered === 0) {
    return 'Not set up yet — tell us where and how you want to work to get better matches.';
  }
  const shown = countShown(preferences, visibility);
  const answers = `${answered} answer${answered === 1 ? '' : 's'} set`;
  return shown === 0
    ? `${answers} · none shown on your profile`
    : `${answers} · ${shown} shown on your profile`;
}
