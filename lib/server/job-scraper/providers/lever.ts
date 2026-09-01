/**
 * Lever public postings provider.
 *
 *   GET https://api.lever.co/v0/postings/{company}?mode=json&limit=N&skip=M
 *   docs: https://hire.lever.co/developer/documentation
 *         https://github.com/lever/postings-api (skip / limit)
 *
 * PAGINATED. Lever documents offset paging via `skip` and `limit`; see
 * fetchLever below. Ashby and Greenhouse deliberately do not paginate — their
 * public board endpoints return the whole board in one response.
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

/**
 * Pagination, per Lever's own documented parameters.
 *
 *   skip  — "skip N from the start"
 *   limit — "only return at most N results"
 *
 * (https://github.com/lever/postings-api). Offset-based, so a page is
 * requested until a short page arrives. Without this, a board with more
 * postings than one default response returns silently loses the remainder,
 * and nothing downstream can tell that it happened.
 */
const LEVER_PAGE_SIZE = 100;
/**
 * Hard stop. Pagination bugs — a provider ignoring `skip`, or a board that
 * keeps returning full pages — must terminate, and 50 pages at 100 each is far
 * beyond any real board.
 */
const LEVER_MAX_PAGES = 50;

export async function fetchLever(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const company = (source.board ?? '').trim();
  if (!company) return [];
  const get = deps.fetchJson ?? fetchJson;

  const all: NormalizedJob[] = [];
  /* Provider ids already returned. A provider that ignores `skip` would serve
     page 1 forever; detecting a page that adds nothing new stops that dead
     rather than looping to the page cap every run. */
  const seenIds = new Set<string>();

  for (let page = 0; page < LEVER_MAX_PAGES; page += 1) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}`
      + `?mode=json&limit=${LEVER_PAGE_SIZE}&skip=${page * LEVER_PAGE_SIZE}`;
    const json = await get(url);
    if (json == null) break;

    const batch = normalizeLever(source, json);
    if (batch.length === 0) break;

    let added = 0;
    for (const job of batch) {
      /* An id-less posting cannot be de-duplicated across pages, so it is kept
         as-is rather than dropped — losing a real job to protect against a
         hypothetical repeat would be the worse trade. */
      const id = job.externalId;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      all.push(job);
      added += 1;
    }

    /* Nothing new on this page: the provider is repeating itself. */
    if (added === 0) break;
    /* A short page is the documented end of the list. */
    if (batch.length < LEVER_PAGE_SIZE) break;
  }

  return all;
}
