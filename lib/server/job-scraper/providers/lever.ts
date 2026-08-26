/**
 * Lever public postings provider.
 *
 *   GET https://api.lever.co/v0/postings/{company}?mode=json
 *   docs: https://hire.lever.co/developer/documentation
 *
 * Public, no auth/secret. Returns only publicly published postings. The company
 * slug comes from configuration (LEVER_COMPANIES), never hardcoded.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, splitList, deriveKeywords } from '../normalize';
import { prettyCompany } from './ashby';

const EMPLOYMENT: Record<string, string> = {
  'full-time': 'full_time', fulltime: 'full_time', 'part-time': 'part_time', parttime: 'part_time',
  contract: 'contract', internship: 'internship', temporary: 'contract',
};
const WORK_MODE: Record<string, string> = {
  remote: 'remote', 'on-site': 'onsite', onsite: 'onsite', hybrid: 'hybrid',
};

export function normalizeLever(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const jobs = Array.isArray(raw) ? (raw as unknown[]) : [];
  const company = source.label || prettyCompany(source.board || '');
  return jobs.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const cat = (j.categories ?? {}) as Record<string, unknown>;
    const title = String(j.text ?? '').trim();

    const resp: string[] = [];
    const req: string[] = [];
    for (const l of Array.isArray(j.lists) ? (j.lists as unknown[]) : []) {
      const list = (l ?? {}) as Record<string, unknown>;
      const items = splitList(String(list.content ?? ''));
      if (/responsib|what you|role/i.test(String(list.text ?? ''))) resp.push(...items);
      else req.push(...items);
    }

    const salary = (j.salaryRange ?? {}) as Record<string, unknown>;
    const createdAt = typeof j.createdAt === 'number' ? new Date(j.createdAt).toISOString() : '';

    return {
      source: source.name,
      provider: 'lever',
      externalId: String(j.id ?? ''),
      title,
      organizationName: company,
      location: String(cat.location ?? '').trim(),
      department: String(cat.department ?? cat.team ?? '').trim(),
      employmentType: EMPLOYMENT[String(cat.commitment ?? '').toLowerCase()] ?? '',
      workMode: WORK_MODE[String(j.workplaceType ?? '').toLowerCase()] ?? '',
      experienceLevel: '',
      description: htmlToText(String(j.descriptionPlain ?? j.description ?? '')),
      responsibilities: resp,
      requirements: req,
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: Boolean(salary.min ?? salary.max),
      postedAt: createdAt,
      jobUrl: String(j.hostedUrl ?? ''),
      applyUrl: String(j.applyUrl ?? j.hostedUrl ?? ''),
      isActive: Boolean(j.hostedUrl), // public postings API returns only listed jobs
    } satisfies NormalizedJob;
  });
}

export async function fetchLever(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const company = (source.board ?? '').trim();
  if (!company) return [];
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;
  const json = deps.fetchJson ? await deps.fetchJson(url) : await fetchJson(url);
  if (json == null) return [];
  return normalizeLever(source, json);
}
