/**
 * SmartRecruiters public postings provider.
 *
 *   GET https://api.smartrecruiters.com/v1/companies/{identifier}/postings?limit=&offset=
 *   response: { totalFound, content: [...] }
 *
 * PAGINATED via offset/limit. Public and unauthenticated. The company
 * identifier comes from configuration (SMARTRECRUITERS_COMPANIES).
 *
 * The list endpoint carries NO description — only the per-posting detail
 * endpoint does. Fetching one per job is an N+1 against a third party, so it is
 * off by default and bounded when enabled. A posting with no description is
 * stored without one; nothing is invented to fill the gap.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const DEFAULT_DETAIL_LIMIT = 0;

const EMPLOYMENT: Record<string, string> = {
  full_time: 'full_time', permanent: 'full_time', part_time: 'part_time',
  contractor: 'contract', temporary: 'contract', intern: 'internship', internship: 'internship',
};

/** SmartRecruiters states location as parts; joined only where they exist. */
function srLocation(raw: unknown): string {
  const l = (raw ?? {}) as Record<string, unknown>;
  const parts = [l.city, l.region, l.country]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean);
  if (!parts.length) return '';
  return normalizeIndiaLocation(parts.join(', '));
}

export function normalizeSmartRecruiters(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.content) ? (root.content as unknown[]) : [];
  const fallbackCompany = source.label || source.board || '';

  return list.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = String(j.name ?? '').trim();
    const loc = (j.location ?? {}) as Record<string, unknown>;
    const company = String(((j.company ?? {}) as Record<string, unknown>).name ?? '').trim()
      || fallbackCompany;
    const dept = String(((j.department ?? {}) as Record<string, unknown>).label ?? '').trim();
    const typeId = String(((j.typeOfEmployment ?? {}) as Record<string, unknown>).label ?? '')
      .toLowerCase().replace(/[\s-]+/g, '_');

    /* `remote` is an explicit boolean here, so it is read rather than guessed
       from the location text. Absent means unknown, not onsite. */
    const remote = loc.remote === true;

    return {
      source: source.name,
      provider: 'smartrecruiters',
      externalId: String(j.id ?? '').trim(),
      title,
      organizationName: company,
      location: srLocation(loc),
      department: dept,
      employmentType: EMPLOYMENT[typeId] ?? '',
      workMode: remote ? 'remote' : '',
      experienceLevel: '',
      description: htmlToText(String(j.jobAd ?? '')),
      responsibilities: [],
      requirements: [],
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: false,
      /* `releasedDate` is a real ISO timestamp when present; absent stays absent. */
      postedAt: String(j.releasedDate ?? '').trim(),
      jobUrl: String(j.ref ?? j.applyUrl ?? '').trim(),
      applyUrl: String(j.applyUrl ?? j.ref ?? '').trim(),
      isActive: Boolean(title && String(j.id ?? '').trim()),
    } satisfies NormalizedJob;
  });
}

export async function fetchSmartRecruiters(
  source: ScrapeSource,
  deps: ProviderDeps = {},
): Promise<NormalizedJob[]> {
  const company = (source.board ?? '').trim();
  if (!company) return [];
  const get = deps.fetchJson ?? fetchJson;

  const all: NormalizedJob[] = [];
  const seenIds = new Set<string>();
  let totalFound: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings`
      + `?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const json = await get(url);
    if (json == null) break;

    if (totalFound === null) {
      const t = Number(((json ?? {}) as Record<string, unknown>).totalFound);
      totalFound = Number.isFinite(t) && t >= 0 ? t : null;
    }

    const batch = normalizeSmartRecruiters(source, json);
    if (batch.length === 0) break;

    let added = 0;
    for (const job of batch) {
      if (job.externalId && seenIds.has(job.externalId)) continue;
      if (job.externalId) seenIds.add(job.externalId);
      all.push(job);
      added += 1;
    }
    /* A page that adds nothing new means the provider is repeating itself. */
    if (added === 0) break;
    if (totalFound !== null && all.length >= totalFound) break;
    if (batch.length < PAGE_SIZE) break;
  }

  return maybeFetchDetails(company, all, deps);
}

/** Bounded description backfill. Off unless SMARTRECRUITERS_DETAIL_LIMIT is set. */
async function maybeFetchDetails(
  company: string,
  jobs: NormalizedJob[],
  deps: ProviderDeps,
): Promise<NormalizedJob[]> {
  const configured = Number(process.env.SMARTRECRUITERS_DETAIL_LIMIT ?? DEFAULT_DETAIL_LIMIT);
  const limit = Number.isFinite(configured) ? Math.max(0, Math.min(200, configured)) : 0;
  if (limit === 0) return jobs;
  const get = deps.fetchJson;
  if (!get) return jobs;

  let used = 0;
  for (const job of jobs) {
    if (used >= limit) break;
    if (job.description || !job.externalId) continue;
    used += 1;
    const detail = await get(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(job.externalId)}`,
    );
    const ad = ((detail ?? {}) as Record<string, unknown>).jobAd;
    const sections = ((ad ?? {}) as Record<string, unknown>).sections;
    const text = JSON.stringify(sections ?? '');
    if (text && text !== '""') job.description = htmlToText(text.replace(/<[^>]+>/g, ' '));
  }
  return jobs;
}
