/**
 * Location classification.
 *
 * Turns the free-text `location` a board wrote into the structured fields the
 * canonical model already declares - country, state, city - plus the work mode
 * when the location text itself states one.
 *
 * IT REUSES THE EXISTING INDIA PARSER. `indiaCity`, `indiaCitiesIn`,
 * `indiaCityState` and `isIndiaRelevant` in lib/server/job-scraper/india.ts are
 * the single city vocabulary; nothing here re-implements them. That vocabulary
 * is also what the Jobs feed's India filter chips match on, so a posting
 * classified here is findable by the filters that already exist.
 *
 * THE RAW STRING REMAINS AUTHORITATIVE. `location` is never rewritten by this
 * module; the structured fields are an ADDITION for later phases, never a
 * replacement.
 *
 * A MEASURED LIMITATION OF THE EXISTING FILTERS. `matchesIndiaFilter` buckets a
 * posting through `indiaBucket`, which calls `indiaCity` - and that returns
 * only the FIRST city it finds. So a posting located "Bengaluru / Hyderabad /
 * Pune" is bucketed as Bengaluru and does NOT appear under the Hyderabad or
 * Pune filter chips. That is pre-existing Jobs-feed behaviour, not something
 * introduced here, and it is deliberately left alone: changing it would change
 * which postings appear under a filter, which is outside this phase.
 *
 * `cities` below captures all of them, so the phase that fixes the filter has
 * the data it needs without re-parsing anything.
 *
 * WHAT IT REFUSES TO DO:
 *  - It never infers remote from a missing location. Missing means unknown.
 *  - It never picks one city out of several. See `city` below.
 *  - It never guesses a country from a city name alone unless that city is in
 *    the India canon, which is India-specific by construction.
 */
import {
  indiaCitiesIn, indiaCityState, indiaStates, isIndiaRelevant,
} from '@/lib/server/job-scraper/india';

export interface LocationClassification {
  /** ISO 3166-1 alpha-2, e.g. 'IN'. Absent when the text does not say. */
  country?: string;
  state?: string;
  /**
   * Set ONLY when the posting names exactly one city.
   *
   * A multi-location posting leaves this absent on purpose: writing one of
   * three cities here would state something the employer did not, and would
   * make the other two invisible to anything reading the structured field.
   * The raw `location` still names all of them, and `cities` below lists them
   * all — see the note above about what the existing filters do and do not do
   * with that.
   */
  city?: string;
  /** Every canonical city named, in canon order. Empty when none is recognised. */
  cities: string[];
  isIndia?: boolean;
  /** A work mode the LOCATION TEXT states, e.g. "Remote - India". */
  workModeHint?: 'remote' | 'hybrid' | 'onsite';
}

/**
 * Countries this module is willing to name, and the tokens that prove it.
 *
 * Deliberately small and explicit. A country is set only when the text says
 * so; there is no attempt to resolve "Cambridge" or "Springfield" to a
 * country, because those names exist in several and guessing would be worse
 * than leaving the field absent.
 */
const COUNTRY_TOKENS: Array<[string, RegExp]> = [
  ['IN', /\b(india|bharat)\b/i],
  ['US', /\b(usa|u\.s\.a\.|united states|u\.s\.)\b/i],
  ['GB', /\b(uk|u\.k\.|united kingdom|england|scotland|wales)\b/i],
  ['CA', /\bcanada\b/i],
  ['AU', /\baustralia\b/i],
  ['DE', /\bgermany\b/i],
  ['FR', /\bfrance\b/i],
  ['NL', /\b(netherlands|holland)\b/i],
  ['IE', /\bireland\b/i],
  ['SG', /\bsingapore\b/i],
  ['AE', /\b(uae|united arab emirates|dubai|abu dhabi)\b/i],
  ['JP', /\bjapan\b/i],
  ['PL', /\bpoland\b/i],
  ['ES', /\bspain\b/i],
  ['PT', /\bportugal\b/i],
  ['BR', /\bbrazil\b/i],
  ['MX', /\bmexico\b/i],
  ['ZA', /\bsouth africa\b/i],
  ['NZ', /\bnew zealand\b/i],
];

/**
 * Work-mode wording found in a location string.
 *
 * ORDER MATTERS. "Hybrid - Remote friendly" contains both words, and hybrid is
 * the more specific claim, so it is tested first. Onsite is last because
 * "office" appears inside plenty of hybrid descriptions.
 */
const MODE_PATTERNS: Array<['remote' | 'hybrid' | 'onsite', RegExp]> = [
  ['hybrid', /\bhybrid\b|\bpartially remote\b|\bflexible\b/i],
  ['remote', /\bremote\b|\bwork from home\b|\bwfh\b|\btelecommute\b|\bdistributed\b|\banywhere\b/i],
  ['onsite', /\bon[- ]?site\b|\bin[- ]?office\b|\bin[- ]?person\b|\boffice[- ]based\b/i],
];

/** Detect a state written out in the text, e.g. "Bengaluru, Karnataka". */
function explicitState(text: string): string {
  const lower = text.toLowerCase();
  for (const state of indiaStates()) {
    if (lower.includes(state.toLowerCase())) return state;
  }
  return '';
}

/**
 * Classify one location string.
 *
 * Pure and deterministic: no clock, no network, no randomness. The same string
 * always produces the same result.
 */
export function classifyLocation(rawLocation: string): LocationClassification {
  const text = String(rawLocation ?? '').trim();
  const out: LocationClassification = { cities: [] };
  if (!text) return out;

  /* Work mode stated by the location text itself. This is a HINT: the caller
     decides whether it outranks the source's own workMode field. */
  for (const [mode, pattern] of MODE_PATTERNS) {
    if (pattern.test(text)) { out.workModeHint = mode; break; }
  }

  const cities = indiaCitiesIn(text);
  out.cities = cities;

  /* An Indian city or the word India both establish the country. The city test
     is safe here precisely because CITY_CANON is an India-only list. */
  const india = isIndiaRelevant(text);
  if (india) {
    out.country = 'IN';
    out.isIndia = true;
  } else {
    for (const [code, pattern] of COUNTRY_TOKENS) {
      if (pattern.test(text)) { out.country = code; break; }
    }
    /* isIndia is only ever set to false when the country is KNOWN and is not
       India. An unrecognised location leaves it absent, because "we could not
       tell" and "definitely not India" are different facts. */
    if (out.country) out.isIndia = out.country === 'IN';
  }

  if (cities.length === 1) {
    out.city = cities[0];
    const state = indiaCityState(cities[0]);
    if (state) out.state = state;
  } else if (cities.length > 1) {
    /* Multi-location. No city is chosen. A state is still set when every named
       city shares one - "Mumbai / Pune" is unambiguously Maharashtra - because
       that is a fact about the posting rather than a choice between cities. */
    const states = Array.from(new Set(cities.map(indiaCityState).filter(Boolean)));
    if (states.length === 1) out.state = states[0];
  }

  /* A state written out explicitly wins over one inferred from a city: the
     employer said it, and it also covers postings that name a state but no
     city we recognise. */
  const stated = explicitState(text);
  if (stated) out.state = stated;

  return out;
}

/**
 * Reconcile the source's declared work mode with what the location text says.
 *
 * The SOURCE FIELD WINS whenever it is meaningful. A board that fills in its
 * own workMode is stating a fact; the location string is prose. The hint is
 * used only to fill a gap, which is the case the brief cares about - a posting
 * whose location reads "Remote - India" and whose workMode field is empty.
 *
 * `undefined` is returned when neither states anything. Callers must NOT treat
 * that as onsite: a missing work mode is unknown, and a missing location is
 * emphatically not evidence of remote.
 */
export function resolveWorkMode(
  sourceWorkMode: string | undefined,
  hint: LocationClassification['workModeHint'],
): 'remote' | 'hybrid' | 'onsite' | undefined {
  const declared = String(sourceWorkMode ?? '').trim().toLowerCase();
  if (declared === 'remote' || declared === 'hybrid' || declared === 'onsite') return declared;
  return hint;
}
