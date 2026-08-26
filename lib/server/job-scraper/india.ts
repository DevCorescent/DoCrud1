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
