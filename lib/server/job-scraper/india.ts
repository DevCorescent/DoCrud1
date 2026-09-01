/**
 * India location awareness for scraped jobs.
 *
 * Recognizes common Indian city names + aliases so India-focused jobs can be
 * marked, scored and filtered. It only reads what the source data actually
 * contains — a job is India-relevant ONLY when its own location says so (never
 * invented).
 */

// alias (lowercased) -> canonical display
const CITY_CANON: Record<string, string> = {
  bangalore: 'Bengaluru', bengaluru: 'Bengaluru',
  hyderabad: 'Hyderabad',
  pune: 'Pune',
  mumbai: 'Mumbai', bombay: 'Mumbai',
  delhi: 'Delhi', 'new delhi': 'New Delhi',
  gurgaon: 'Gurugram', gurugram: 'Gurugram',
  noida: 'Noida', ghaziabad: 'Ghaziabad', faridabad: 'Faridabad',
  chennai: 'Chennai', madras: 'Chennai',
  kolkata: 'Kolkata', calcutta: 'Kolkata',
  ahmedabad: 'Ahmedabad',
  jaipur: 'Jaipur',
  kochi: 'Kochi', cochin: 'Kochi',
  indore: 'Indore',
  chandigarh: 'Chandigarh',
  thiruvananthapuram: 'Thiruvananthapuram', trivandrum: 'Thiruvananthapuram',
  coimbatore: 'Coimbatore', nagpur: 'Nagpur',
};

const DELHI_NCR = new Set(['delhi', 'new delhi', 'gurugram', 'gurgaon', 'noida', 'ghaziabad', 'faridabad']);

function lc(s: string): string { return (s || '').toLowerCase(); }

/** True when the location text actually indicates India. */
export function isIndiaRelevant(location: string): boolean {
  const s = lc(location);
  if (!s) return false;
  if (/\bindia\b/.test(s)) return true;
  return Object.keys(CITY_CANON).some((k) => s.includes(k));
}

/** Canonical Indian city name embedded in the text, or '' when none. */
export function indiaCity(location: string): string {
  const s = lc(location);
  for (const [alias, canon] of Object.entries(CITY_CANON)) {
    if (s.includes(alias)) return canon;
  }
  return '';
}

/** Normalize a location string, canonicalizing a recognized Indian city. */
export function normalizeIndiaLocation(location: string): string {
  const canon = indiaCity(location);
  return canon || (location || '').trim();
}

export type IndiaBucket = 'india' | 'bengaluru' | 'hyderabad' | 'pune' | 'mumbai' | 'delhi-ncr' | 'chennai' | 'remote-india' | '';

/** Bucket a job's location for the India location filter chips. */
export function indiaBucket(location: string, workMode?: string): IndiaBucket {
  const s = lc(location);
  const india = isIndiaRelevant(location);
  if ((workMode === 'remote' || /remote/.test(s)) && india) return 'remote-india';
  const city = indiaCity(location).toLowerCase();
  if (city === 'bengaluru') return 'bengaluru';
  if (city === 'hyderabad') return 'hyderabad';
  if (city === 'pune') return 'pune';
  if (city === 'mumbai') return 'mumbai';
  if (city === 'chennai') return 'chennai';
  if (DELHI_NCR.has(city)) return 'delhi-ncr';
  if (india) return 'india';
  return '';
}

/** Does a job's location satisfy a chosen India location filter? */
export function matchesIndiaFilter(location: string, workMode: string | undefined, filter: IndiaBucket): boolean {
  if (!filter) return true;
  if (filter === 'india') return isIndiaRelevant(location);
  if (filter === 'remote-india') return indiaBucket(location, workMode) === 'remote-india' || (isIndiaRelevant(location) && (workMode === 'remote' || /remote/.test(lc(location))));
  return indiaBucket(location, workMode) === filter;
}

/**
 * City suggestions for the job composer's location field.
 *
 * Reuses the SAME canon map the scraper matches against, so a location a
 * poster picks here is one the India filters already recognise. There is no
 * geocoding service in this project; rather than stub a fetch that returns
 * nothing, this offers the real list the platform actually understands and
 * leaves the field free-text for everywhere else.
 *
 * Canonical names only — the aliases ('bangalore', 'bombay') all resolve to the
 * same display name, so the list is deduplicated rather than showing both.
 */
export function indiaCitySuggestions(query: string, limit = 6): string[] {
  const canon = Array.from(new Set(Object.values(CITY_CANON))).sort();
  const q = lc(query).trim();
  if (!q) return canon.slice(0, limit);

  /* An alias match counts: typing "bangalore" must offer "Bengaluru". */
  const matches = canon.filter((city) => {
    if (lc(city).includes(q)) return true;
    return Object.entries(CITY_CANON).some(([alias, display]) => display === city && alias.includes(q));
  });
  /* Prefixes first — "che" should lead with Chennai, not Kochi. */
  matches.sort((a, b) => Number(lc(b).startsWith(q)) - Number(lc(a).startsWith(q)));
  return matches.slice(0, limit);
}

/**
 * Canonical city to Indian state.
 *
 * Added here rather than in a new module so there is exactly ONE list of
 * Indian cities in the codebase: CITY_CANON above decides what a city is
 * called, and this decides where it is. A second file would let the two drift,
 * and a city recognised by the filters but unknown to the classifier is
 * precisely the kind of silent gap that is hard to notice.
 *
 * Keys are the CANONICAL display names produced by `indiaCity`, never aliases.
 */
const CITY_STATE: Record<string, string> = {
  Bengaluru: 'Karnataka',
  Hyderabad: 'Telangana',
  Pune: 'Maharashtra',
  Mumbai: 'Maharashtra',
  Nagpur: 'Maharashtra',
  Delhi: 'Delhi',
  'New Delhi': 'Delhi',
  Gurugram: 'Haryana',
  Faridabad: 'Haryana',
  Noida: 'Uttar Pradesh',
  Ghaziabad: 'Uttar Pradesh',
  Chennai: 'Tamil Nadu',
  Coimbatore: 'Tamil Nadu',
  Kolkata: 'West Bengal',
  Ahmedabad: 'Gujarat',
  Jaipur: 'Rajasthan',
  Kochi: 'Kerala',
  Thiruvananthapuram: 'Kerala',
  Indore: 'Madhya Pradesh',
  Chandigarh: 'Chandigarh',
};

/** The state a canonical Indian city sits in, or '' when unknown. */
export function indiaCityState(canonicalCity: string): string {
  return CITY_STATE[(canonicalCity || '').trim()] || '';
}

/** Every Indian state this file can name. Used to read a state written explicitly. */
export function indiaStates(): string[] {
  return Array.from(new Set(Object.values(CITY_STATE))).sort();
}

/**
 * EVERY canonical Indian city named in a location string, in the order the
 * canon lists them.
 *
 * `indiaCity` returns only the first match, which is right for bucketing but
 * wrong for a posting like "Bengaluru / Hyderabad / Pune" — reducing that to
 * one city would discard two real locations. Callers that must not lose them
 * use this instead.
 */
export function indiaCitiesIn(location: string): string[] {
  let s = lc(location);
  if (!s) return [];

  /* LONGEST ALIAS FIRST, and each match is masked out of the string.
     Without this "New Delhi" matched both 'new delhi' AND 'delhi' and reported
     two cities, which made a single-city posting look multi-location and
     suppressed its city entirely. Masking the matched span is what stops a
     shorter alias re-matching inside a longer one it is contained in. */
  const aliases = Object.keys(CITY_CANON).sort((a, b) => b.length - a.length);
  const found = new Set<string>();
  for (const alias of aliases) {
    if (!s.includes(alias)) continue;
    found.add(CITY_CANON[alias]);
    s = s.split(alias).join(' '.repeat(alias.length));
  }
  if (found.size === 0) return [];

  /* Returned in canon order rather than match order, so the result depends
     only on WHICH cities are present, never on how they were written. */
  const seen = new Set<string>();
  return Object.values(CITY_CANON).filter((canon) => {
    if (seen.has(canon) || !found.has(canon)) return false;
    seen.add(canon);
    return true;
  });
}
