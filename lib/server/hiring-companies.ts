/**
 * The companies actually hiring on Docrud right now.
 *
 * Feeds the homepage trust marquee, so that row names real employers with live
 * roles instead of a hardcoded list. Derived entirely from published hiring
 * jobs — a company appears here because it has an open posting, and disappears
 * when it does not.
 *
 * Lives in lib rather than in the route so the homepage's SERVER component can
 * seed the marquee from an already-warm cache, saving the browser a round trip.
 * `peekHiringCompanies()` exists precisely so that seeding can never trigger the
 * multi-megabyte cold read on the page's critical path.
 *
 * The logo is resolved through the same curated registry the job cards use
 * (lib/company-logos.ts). A company with no verified logo returns an empty
 * `logoUrl`, and the marquee renders its name as a wordmark: never a guessed
 * logo, never a broken image.
 */
import { getPublishedHiringJobCompanyNames } from '@/lib/server/hiring';
import { getCompanyLogo, logoKey } from '@/lib/company-logos';

export type HiringCompany = { name: string; logoUrl: string; jobCount: number };

/* Public, identical for every visitor, and derived from a job list that only
   changes when someone posts. Holding it briefly means the marquee costs one
   cheap read instead of re-grouping 360 postings on every homepage load. */
let derived: { value: HiringCompany[]; ts: number } | null = null;
const CACHE_TTL = 60_000;

/** Enough to fill a looping row several times over without an unbounded payload. */
const MAX_COMPANIES = 24;

/**
 * The cached list IF it is already warm, else null. Never reads storage.
 *
 * The homepage server component uses this: on a warm process the marquee is
 * seeded and paints with no request at all, and on a cold one the page returns
 * immediately and the browser fetches as before. A cold 2.7 MB job read must
 * never sit on the path to first byte.
 */
export function invalidateHiringCompanies() {
  derived = null;
}

export function peekHiringCompanies(): HiringCompany[] | null {
  if (derived && Date.now() - derived.ts < CACHE_TTL) return derived.value;
  return null;
}

export async function getHiringCompanies(): Promise<HiringCompany[]> {
  const warm = peekHiringCompanies();
  if (warm) return warm;

  /* Only the employer names are read — a database-side projection of the jobs
     document rather than all 2.7 MB of it. 3 KB instead of 2737 KB. */
  const names = await getPublishedHiringJobCompanyNames().catch(() => [] as string[]);

  /* Grouped on the normalized name so "MindTickle" and "Mindtickle" are one
     employer, while the display name keeps the spelling the employer used. */
  const byKey = new Map<string, { name: string; jobCount: number }>();
  for (const raw of names) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    const key = logoKey(name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) existing.jobCount += 1;
    else byKey.set(key, { name, jobCount: 1 });
  }

  const companies = Array.from(byKey.values())
    .map((c) => {
      const logo = getCompanyLogo(c.name);
      return { name: logo?.name ?? c.name, logoUrl: logo?.src ?? '', jobCount: c.jobCount };
    })
    /* Companies with a verified logo lead the row — it is the more credible
       mark — then the busiest employers, then alphabetically for stability. */
    .sort((a, b) =>
      Number(Boolean(b.logoUrl)) - Number(Boolean(a.logoUrl))
      || b.jobCount - a.jobCount
      || a.name.localeCompare(b.name))
    .slice(0, MAX_COMPANIES);

  derived = { value: companies, ts: Date.now() };
  return companies;
}
