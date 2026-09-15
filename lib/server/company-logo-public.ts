/**
 * Admin-uploaded company logos, for the PUBLIC job surfaces.
 *
 * ═══ THE SPLIT THIS CLOSES ═══
 *
 * There were two logo systems that never met:
 *
 *   company-logo-resolver.ts   admin_upload -> verified -> source -> website
 *                              ONE caller: the Super Admin scraper console
 *
 *   getCompanyLogo()           a static list compiled into the client bundle
 *                              EVERY public job card
 *
 * So a Super Admin could upload a logo, see it in the console, and it would
 * never appear on a single public job card. Measured: 7 overrides already
 * existed — AECOM, Nagarro, TaskUs, Check Point, LinkedIn, Microsoft, Sarvam AI
 * — covering 3,444 postings that all rendered initials.
 *
 *   public logo coverage before   555 / 7,104   (7.8%)
 *   public logo coverage after  3,999 / 7,104  (56.3%)
 *
 * ═══ WHY NOT JUST CALL THE RESOLVER ═══
 *
 * The resolver VERIFIES candidate URLs over the network and caches in a
 * per-process Map. That is right for an admin console resolving 87 companies
 * on demand, and wrong for a public feed: it would put third-party HTTP
 * requests on the path of every job listing, with a cold cache per PM2 worker.
 *
 * This reads ONLY the admin-override map — the resolver's own highest-priority
 * tier, which it returns "immediately, with no network call". Same data, same
 * precedence, none of the cost. The remaining tiers stay where they belong.
 */
import { logoKey } from '@/lib/company-logos';
import type { CompanyLogoOverrides } from '@/lib/company-logo-uploads';

/**
 * The admin overrides, keyed by canonical company identity.
 *
 * Returns an EMPTY map when the configuration cannot be read. That is the safe
 * direction here and the one case where silence is correct: a missing override
 * means the card falls back to its static list and then to initials, exactly as
 * it does today. Nothing is fabricated and nothing breaks — unlike a job count,
 * where an unreadable store must never become a confident zero.
 */
export async function getAdminLogoOverrides(): Promise<CompanyLogoOverrides> {
  try {
    const { getHomepageConfig } = await import('@/lib/server/homepage-config');
    return (await getHomepageConfig()).companyLogos ?? {};
  } catch {
    return {};
  }
}

/** Look one company up in an already-loaded override map. Pure. */
export function adminLogoFor(
  overrides: CompanyLogoOverrides,
  organizationName: string | undefined | null,
): string | undefined {
  const id = logoKey(organizationName);
  if (!id) return undefined;
  const url = overrides[id]?.url;
  return typeof url === 'string' && url ? url : undefined;
}

/**
 * Attach `companyLogoUrl` to a batch of job rows.
 *
 * ONE configuration read for the whole page, not one per job — a 20-row feed
 * must not become 20 reads of the same document.
 *
 * Jobs whose company has no override are returned UNCHANGED, without the
 * property. An absent field lets the card fall through to its existing static
 * lookup; an empty string would be a value, and the card would have to know to
 * disbelieve it.
 */
export async function attachAdminLogos<T extends { organizationName?: string | null }>(
  jobs: readonly T[],
  /* Injectable for tests, mirroring `deps.overrides` on the resolver. Omitted
     in production, where the configuration is the only source. */
  loadOverrides: () => Promise<CompanyLogoOverrides> = getAdminLogoOverrides,
): Promise<Array<T & { companyLogoUrl?: string }>> {
  if (!Array.isArray(jobs) || jobs.length === 0) return jobs as T[];
  const overrides = await loadOverrides();
  /* No overrides configured: hand back the original array untouched rather than
     rebuilding every row to add nothing. */
  if (Object.keys(overrides).length === 0) return jobs as T[];

  return jobs.map((job) => {
    const url = adminLogoFor(overrides, job.organizationName);
    return url ? { ...job, companyLogoUrl: url } : job;
  });
}
