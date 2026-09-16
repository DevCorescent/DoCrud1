/**
 * The persisted India bucket — the Jobs page's India chips, stored once per
 * posting so a chip is an equality on an indexed field instead of a
 * `$switch` over every location alias evaluated on every document.
 *
 * ═══ THE SEMANTICS ARE P2B'S, NOT REDEFINED ═══
 *
 * Phase 2B reproduced the chips server-side with two approved departures from
 * the text-only client test: `india` / `remote-india` read the STORED country,
 * and the city chips read the location TEXT (first alias hit in CITY_CANON
 * order, `indiaCity`). This derivation encodes exactly that:
 *
 *   remote        = workMode is 'remote' OR the location text contains "remote"
 *   remote-india  = remote AND country === 'IN'
 *   <city>        = NOT remote AND first alias hit is that city (bengaluru,
 *                   hyderabad, pune, mumbai, chennai)
 *   delhi-ncr     = NOT remote AND first alias hit is a Delhi-NCR canonical
 *   india         = NOT remote, no city chip, country === 'IN'
 *   ''            = none of the above
 *
 * The `india` chip itself is NOT answered from this field — it is every row
 * with country 'IN', including remote and city rows — so the query layer
 * keeps `{ country: 'IN' }` for it and uses this field for the other four.
 *
 * `scripts/public-india-bucket.selftest.ts` pins this function against the
 * `$expr` form P2B shipped, on fixtures and on the real corpus, and
 * `scripts/db-backfill-india-bucket.ts` writes it with a completeness gate.
 */
import { indiaCity, delhiNcrCanonicals } from '@/lib/server/job-scraper/india';

export const INDIA_BUCKET_FIELD = '_indiaBucket';

/** The values the field can hold. `india` is a real value but never queried by it. */
export type PersistedIndiaBucket =
  | 'remote-india' | 'bengaluru' | 'hyderabad' | 'pune' | 'mumbai' | 'chennai' | 'delhi-ncr' | 'india' | '';

const CITY_CHIPS = new Set(['bengaluru', 'hyderabad', 'pune', 'mumbai', 'chennai']);
const NCR = new Set(delhiNcrCanonicals().map((c) => c.toLowerCase()));

const lc = (v: unknown) => String(v ?? '').toLowerCase().trim();

export function publicIndiaBucket(job: { location?: unknown; workMode?: unknown; country?: unknown }): PersistedIndiaBucket {
  const location = lc(job.location);
  const remote = lc(job.workMode) === 'remote' || location.includes('remote');
  const isIndia = job.country === 'IN';
  if (remote) return isIndia ? 'remote-india' : '';
  const city = indiaCity(location).toLowerCase();
  if (CITY_CHIPS.has(city)) return city as PersistedIndiaBucket;
  if (NCR.has(city)) return 'delhi-ncr';
  return isIndia ? 'india' : '';
}

/** Spread into a posting on every write, next to derivePublicSortKeys. */
export function derivePublicIndiaBucket(job: Record<string, unknown>): { [INDIA_BUCKET_FIELD]: PersistedIndiaBucket } {
  return { [INDIA_BUCKET_FIELD]: publicIndiaBucket(job) };
}

export function indiaBucketIsCurrent(doc: Record<string, unknown>): boolean {
  return doc[INDIA_BUCKET_FIELD] === publicIndiaBucket(doc);
}
