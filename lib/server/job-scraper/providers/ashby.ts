/**
 * Ashby public Job Posting API provider.
 *
 *   GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
 *   docs: https://developers.ashbyhq.com/docs/public-job-posting-api
 *
 * NOT PAGINATED, deliberately. The public Job Posting API returns every
 * published posting for the board in a single response — there is no page,
 * cursor or offset parameter to follow. Adding one would be inventing an API
 * the provider does not expose, so this fetches once and normalizes the lot.
 * If Ashby ever introduces paging, this is the function to change.
 *
 * Public, no auth/secret. Only LISTED postings are importable (isListed === true).
 * The board name comes from configuration (ASHBY_JOB_BOARDS), never hardcoded.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { configError, fetchJsonOrThrow } from '../source-fetch';

const EMPLOYMENT: Record<string, string> = {
  fulltime: 'full_time', parttime: 'part_time', intern: 'internship', contract: 'contract', temporary: 'contract',
};

export function prettyCompany(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export function normalizeAshby(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const jobs = raw && typeof raw === 'object' && Array.isArray((raw as { jobs?: unknown }).jobs)
    ? ((raw as { jobs: unknown[] }).jobs)
    : [];
  const company = source.label || prettyCompany(source.board || '');
  return jobs.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = String(j.title ?? '').trim();
    const addr = (j.address ?? {}) as Record<string, unknown>;
    const postal = (addr.postalAddress ?? {}) as Record<string, unknown>;
    const location = String(j.location ?? postal.addressLocality ?? '').trim();
    const workplace = String(j.workplaceType ?? '').toLowerCase();
    const workMode = j.isRemote === true ? 'remote' : workplace.includes('hybrid') ? 'hybrid' : location ? 'onsite' : '';
    const publishedAt = j.publishedAt ? new Date(String(j.publishedAt)).toISOString() : '';
    const description = htmlToText(String(j.descriptionPlain ?? j.descriptionHtml ?? ''));
    return {
      source: source.name,
      provider: 'ashby',
      externalId: String(j.id ?? ''),
      title,
      organizationName: company,
      location,
      department: String(j.department ?? j.team ?? '').trim(),
      employmentType: EMPLOYMENT[String(j.employmentType ?? '').toLowerCase()] ?? '',
      workMode,
      experienceLevel: '',
      description,
      responsibilities: [],
      requirements: [],
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: Boolean(j.compensation ?? j.compensationTierSummary),
      postedAt: publishedAt,
      jobUrl: String(j.jobUrl ?? ''),
      applyUrl: String(j.applyUrl ?? j.jobUrl ?? ''),
      isActive: j.isListed === true,
    } satisfies NormalizedJob;
  });
}

export async function fetchAshby(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const board = (source.board ?? '').trim();
  if (!board) configError('Ashby source has no board slug.');
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
  /* Throws on 404/500/timeout/parse failure, so the runner records a FAILED
     source instead of an empty successful one. */
  const json = await fetchJsonOrThrow(url, deps);
  return normalizeAshby(source, json);
}
