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
import { configError, fetchJsonOrThrow } from '../source-fetch';

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
  if (!company) configError('SmartRecruiters source has no company identifier.');

  const all: NormalizedJob[] = [];
  const seenIds = new Set<string>();
  let totalFound: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings`
      + `?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    /* Throws on failure, INCLUDING mid-pagination. A page-2 error used to
       `break` and return page 1 as if it were the whole board — a partial
       result presented as complete, which is the more dangerous half of this
       bug because it looks plausible. */
    const json = await fetchJsonOrThrow(url, deps);

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

/**
 * Turn SmartRecruiters' `jobAd.sections` into readable prose.
 *
 * The shape is an object of named sections, each `{ title, text }` with the
 * text carrying HTML:
 *
 *   { companyDescription: { title: "Company Description", text: "<p>…</p>" },
 *     jobDescription:     { title: "Job Description",     text: "<p>…</p>" }, … }
 *
 * This used to be `JSON.stringify(sections)` with HTML tags stripped afterwards,
 * which left the JSON STRUCTURE in the description — a posting began with
 * `{"companyDescription":{"title":"Company Description","text":" …` and every
 * brace, key and quote survived into what a member reads. Stripping tags from
 * stringified JSON removes markup but not the encoding it was wrapped in.
 *
 * Sections are emitted in the order the provider listed them, each preceded by
 * its own title, so the result reads the way the posting does on the source
 * site. Nothing is invented: a section without text contributes nothing.
 */
function sectionsToText(sections: unknown): string {
  if (!sections || typeof sections !== 'object') return '';
  const parts: string[] = [];
  for (const value of Object.values(sections as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const section = value as { title?: unknown; text?: unknown };
    const body = typeof section.text === 'string' ? htmlToText(section.text) : '';
    if (!body.trim()) continue;
    const title = typeof section.title === 'string' ? section.title.trim() : '';
    parts.push(title ? `${title}\n${body}` : body);
  }
  return parts.join('\n\n').trim();
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
  /* ═══ WHY NOT `deps.fetchJson` ═══

     This used to read `deps.fetchJson` and return early when it was absent.
     Production calls `getAdapter(sourceId, {})` — deps is EMPTY outside tests —
     so the backfill returned immediately every time and the configured
     DETAIL_LIMIT did nothing at all. Measured on the live corpus: SmartRecruiters
     had 0% description coverage across 3,797 stored postings and Workday 0%
     across 1,329, while Microsoft — whose detail fetch already went through
     `fetchJsonOrThrow(url, deps)` — had 100%. A flag that silently does nothing
     is worse than an absent feature, because the console shows it as enabled.

     `fetchJsonOrThrow` falls back to the real fetcher when deps supplies none,
     which is what every working path in this file already does. */
    const get = (url: string) => fetchJsonOrThrow(url, deps);

  let used = 0;
  for (const job of jobs) {
    if (used >= limit) break;
    if (job.description || !job.externalId) continue;
    used += 1;
    /* One posting's detail request must never fail the whole board: the
       backfill is best-effort enrichment, and a job with no description is
       stored without one rather than dropped. `fetchJsonOrThrow` throws, so the
       guard is what keeps that promise. */
    try {
      const detail = await get(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(job.externalId)}`,
      );
      const ad = ((detail ?? {}) as Record<string, unknown>).jobAd;
      const sections = ((ad ?? {}) as Record<string, unknown>).sections;
      const text = sectionsToText(sections);
      if (text) job.description = text;
    } catch { /* leave this posting's description empty */ }
  }
  return jobs;
}
