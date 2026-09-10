/**
 * Matching a person against a stated requirement, using what they told us.
 *
 * ═══ WHAT THIS ADDS ═══
 *
 * Search used to read a person's headline, skills, bio, interests and city.
 * That is their history. It ignored the answers they gave in "How you want to
 * be matched" — the roles they are aiming for, the cities they will work in,
 * whether they will relocate, the work modes and employment types they want,
 * their domains, their years, and whether they are available at all.
 *
 * Those answers are the only part of a profile that is about the FUTURE, which
 * is exactly what somebody hiring is asking about. A person whose title today
 * is "Support Engineer" and whose stated goal is "React Developer" was invisible
 * to "I need a React developer"; now they are not.
 *
 * ═══ NOTHING IS INFERRED ═══
 *
 * Every signal here comes from an answer the person gave. An unanswered field
 * contributes nothing — not a default, not a guess. `preferenceSignals` returns
 * zero points and no reasons for an empty preference set, so a member who has
 * not filled the form in is ranked exactly as they were before it existed,
 * never penalised for silence.
 *
 * The one thing that can push a person DOWN is saying "not looking" — and even
 * that is a factor, not a filter. They stay findable; they simply stop being
 * offered first to someone who is hiring.
 *
 * ═══ WHY A FACTOR AND NOT A WEIGHT ═══
 *
 * The weighted mix in intelligent-search.ts is shared by people, businesses,
 * jobs, services and posts. Adding a person-only term to it would re-normalise
 * every other kind of result against people. A multiplier scales a person
 * within their own kind, which is what these signals are actually about — the
 * same reason the location constraint is already a factor there.
 */

import { PROFILE_INDEX_THRESHOLD } from '@/lib/profile-score';
import type { MatchPreferences } from '@/lib/server/match-preferences';
import type { QueryUnderstanding } from '@/lib/search-understanding';

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();

/** Loose containment both ways: "react" matches "react developer" and back. */
function touches(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/* ─── Reading the query for things only preferences can answer ──────────────
   The understanding model extracts roles, skills, domains, locations and a
   seniority band. It has no notion of work mode or employment type, because
   until now nothing could match one. These are read straight off the cleaned
   query rather than added to the shared model, so this stays the only file
   that has to know about them. */

const MODE_WORDS: Record<'remote' | 'hybrid' | 'onsite', string[]> = {
  remote: ['remote', 'work from home', 'wfh', 'anywhere'],
  hybrid: ['hybrid'],
  onsite: ['onsite', 'on-site', 'on site', 'in office', 'in-office'],
};

const TYPE_WORDS: Record<string, string[]> = {
  full_time: ['full time', 'full-time', 'fulltime', 'permanent'],
  part_time: ['part time', 'part-time'],
  contract: ['contract', 'contractor', 'contractual'],
  internship: ['intern', 'internship'],
  freelance: ['freelance', 'freelancer', 'gig'],
  temporary: ['temporary', 'temp'],
};

/** Years a seniority word is asking for, as a range. */
const BAND_YEARS: Record<string, [number, number]> = {
  fresher: [0, 1],
  junior: [0, 3],
  mid: [2, 7],
  senior: [5, 40],
};

function askedModes(cleaned: string): Array<'remote' | 'hybrid' | 'onsite'> {
  return (Object.keys(MODE_WORDS) as Array<'remote' | 'hybrid' | 'onsite'>)
    .filter((m) => MODE_WORDS[m].some((w) => cleaned.includes(w)));
}

function askedTypes(cleaned: string): string[] {
  return Object.keys(TYPE_WORDS).filter((t) => TYPE_WORDS[t].some((w) => cleaned.includes(w)));
}

export interface PreferenceSignals {
  /** 0–24. What the person's own answers say about this requirement. */
  points: number;
  /** Short phrases for the result's reason line, in the order they matter. */
  reasons: string[];
  /**
   * They stated they will work where the query is asking, even though they do
   * not live there. The caller uses this to keep them out of the hard location
   * exclusion — a stated willingness is a better answer than an address.
   */
  locationAccepted: boolean;
  /** They said they are not looking for work. */
  notLooking: boolean;
  /** The multiplier to apply to their score. */
  factor: number;
}

const EMPTY: PreferenceSignals = {
  points: 0, reasons: [], locationAccepted: false, notLooking: false, factor: 1,
};

/**
 * What a person's stated preferences say about this particular requirement.
 *
 * Pure: same inputs, same answer, no storage and no clock.
 */
export function preferenceSignals(
  prefs: MatchPreferences | null | undefined,
  u: QueryUnderstanding,
): PreferenceSignals {
  if (!prefs || typeof prefs !== 'object') return EMPTY;

  const cleaned = norm(u.cleaned || u.raw);
  const reasons: string[] = [];
  let points = 0;
  let locationAccepted = false;

  /* ── The role they are aiming for ──
     The strongest single signal in the set, because it is the one thing a
     profile cannot show any other way: what they want to be doing next.

     Answers are COMPARED lower-cased and SHOWN as written, here and below: a
     reason line is read by a person, and quoting their own answer back at them
     as "open to bengaluru" reads as a database field rather than as something
     somebody said. */
  const titles = (prefs.desiredTitles ?? []).filter((t) => norm(t));
  if (titles.length) {
    const wanted = [...u.roles.map(norm), ...u.skills.map(norm)].filter(Boolean);
    const hit = titles.find((t) => wanted.some((w) => touches(norm(t), w)) || touches(cleaned, norm(t)));
    if (hit) {
      points += 8;
      reasons.push(`wants ${hit.trim()} work`);
    }
  }

  /* ── Where they will work ──
     Their stated cities, not their address. Somebody in Pune who has written
     "Bengaluru" is a real answer to "in Bengaluru"; the ranking used to drop
     them for having the wrong address. */
  const cities = (prefs.preferredLocations ?? []).filter((c) => norm(c));
  const asked = u.locations.map(norm).filter(Boolean);
  if (cities.length && asked.length) {
    const hit = cities.find((c) => asked.some((a) => touches(norm(c), a)));
    if (hit) {
      points += 6;
      locationAccepted = true;
      reasons.push(`open to ${hit.trim()}`);
    }
  }

  /* ── Relocation ──
     Weaker than naming the city, and deliberately so: "for the right role" is
     a maybe, and it should read as one. It still lifts the hard exclusion,
     because a maybe is a great deal more than a no. */
  if (asked.length && !locationAccepted && (prefs.relocation === 'yes' || prefs.relocation === 'for_the_right_role')) {
    points += 3;
    locationAccepted = true;
    reasons.push(prefs.relocation === 'yes' ? 'will relocate' : 'may relocate');
  }

  /* ── Work mode ── */
  const modes = (prefs.workModes ?? []).map(norm);
  const wantedModes = askedModes(cleaned);
  if (modes.length && wantedModes.length) {
    const hit = wantedModes.find((m) => modes.includes(m));
    if (hit) {
      points += 4;
      reasons.push(`wants ${hit === 'onsite' ? 'on-site' : hit} work`);
    }
  }

  /* ── Employment type ── */
  const types = (prefs.employmentTypes ?? []).map(norm);
  const wantedTypes = askedTypes(cleaned);
  if (types.length && wantedTypes.length) {
    const hit = wantedTypes.find((t) => types.includes(t));
    if (hit) {
      points += 3;
      reasons.push(`open to ${hit.replace('_', '-')}`);
    }
  }

  /* ── Domain ──
     Both sides are taxonomy ids, so this is an exact comparison rather than a
     text match. */
  const domains = (prefs.preferredDomains ?? []).map(norm);
  if (domains.length && u.domains.length) {
    const hit = u.domains.find((d) => domains.includes(norm(d)));
    if (hit) {
      points += 3;
      reasons.push(`works in ${hit}`);
    }
  }

  /* ── Years ──
     Only when the query asked for a level. A stated number inside the band the
     phrasing implies; nothing is derived from job titles, which is the same
     line the eligibility engine holds. */
  const years = typeof prefs.experienceYears === 'number' ? prefs.experienceYears : null;
  if (years !== null && u.experience && BAND_YEARS[u.experience]) {
    const [lo, hi] = BAND_YEARS[u.experience];
    if (years >= lo && years <= hi) {
      points += 3;
      reasons.push(`${years} yrs experience`);
    }
  }

  /* ── Availability ──
     Only meaningful when somebody is looking to hire. "Not looking" is not a
     match for a hiring query, and saying so is the point of the answer. */
  const hiring = u.intent === 'find_provider';
  const notLooking = prefs.availability === 'not_looking';
  if (hiring && !notLooking) {
    if (prefs.availability === 'immediately') {
      points += 3;
      reasons.push('available now');
    } else if (prefs.availability === 'within_30_days') {
      points += 2;
      reasons.push('available in 30 days');
    }
  }

  points = Math.min(points, 24);

  /* Up to +24%, or −12% for someone who has said they are not looking while
     the person searching is hiring. */
  const factor = notLooking && hiring ? 0.88 : 1 + points / 100;

  return { points, reasons, locationAccepted, notLooking, factor };
}

/**
 * How much of a person's profile there is to match on.
 *
 * A profile at or above PROFILE_INDEX_THRESHOLD has every section the ranking
 * reads, so it gets the full lift; below that the lift tapers. Nothing here
 * excludes anyone — an incomplete profile ranks lower, it does not disappear,
 * because the person searching would rather see a thin real profile than
 * nothing at all.
 */
export function completenessFactor(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  if (s >= PROFILE_INDEX_THRESHOLD) return 1.12;
  if (s >= 80) return 1.06;
  if (s >= 60) return 1.02;
  if (s >= 30) return 1;
  /* Almost nothing filled in. Still findable, still last. */
  return 0.94;
}
