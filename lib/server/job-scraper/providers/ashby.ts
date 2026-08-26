/**
 * Ashby public Job Posting API provider.
 *
 *   GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
 *   docs: https://developers.ashbyhq.com/docs/public-job-posting-api
 *
 * Public, no auth/secret. Only LISTED postings are importable (isListed === true).
 * The board name comes from configuration (ASHBY_JOB_BOARDS), never hardcoded.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';

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
  if (!board) return [];
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
  const json = deps.fetchJson ? await deps.fetchJson(url) : await fetchJson(url);
  if (json == null) return [];
  return normalizeAshby(source, json);
}
