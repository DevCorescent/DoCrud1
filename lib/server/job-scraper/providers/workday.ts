/**
 * Workday public careers provider.
 *
 *   POST https://{tenant}.{shard}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 *   body: { limit, offset, searchText }
 *
 * PAGINATED, and the only provider here that is a POST — which is why
 * `fetchJsonPost` exists. Public and unauthenticated; the tenant, shard and
 * site all come from configuration (WORKDAY_BOARDS), never from a slug guess.
 *
 * TWO WORKDAY QUIRKS THIS HANDLES:
 *
 *  · `total` is only trustworthy on the FIRST page. Later pages have been
 *    observed to report a different figure, so the first-page value is captured
 *    once and every later page is measured against it. Trusting each page's own
 *    total would either stop early or loop.
 *
 *  · The list response does NOT reliably carry a description. Fetching one per
 *    job is an N+1 against a third party, so it is OFF by default and bounded
 *    when enabled — see `detailLimit`. A job with no description is stored
 *    without one rather than with an invented one.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJsonPost } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';

const PAGE_SIZE = 20;
/** Hard ceiling: 100 pages x 20 = 2000 postings from one board. */
const MAX_PAGES = 100;
/**
 * Detail requests per run, when enabled at all.
 *
 * Zero by default. A board of 500 postings would otherwise issue 500 extra
 * requests to someone else's servers on every run, which is precisely the
 * uncontrolled N+1 the brief forbids.
 */
const DEFAULT_DETAIL_LIMIT = 0;

const EMPLOYMENT: Record<string, string> = {
  'full time': 'full_time', fulltime: 'full_time', 'full-time': 'full_time',
  'part time': 'part_time', 'part-time': 'part_time',
  contract: 'contract', contractor: 'contract', intern: 'internship', internship: 'internship',
};

function baseUrl(w: NonNullable<ScrapeSource['workday']>): string {
  return `https://${w.tenant}.${w.shard}.myworkdayjobs.com/wday/cxs/${w.tenant}/${w.site}`;
}

/** Workday states location as a single free-text field; multi-site postings
 *  arrive as "2 Locations", which names no place and must not become one. */
function workdayLocation(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  /* "3 Locations" is a COUNT, not a location. Kept out of the location field
     entirely rather than stored as a place name a filter would match on. */
  if (/^\d+\s+locations?$/i.test(text)) return '';
  return normalizeIndiaLocation(text);
}

export function normalizeWorkday(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.jobPostings) ? (root.jobPostings as unknown[]) : [];
  const w = source.workday;
  const company = source.label || w?.tenant || '';

  return list.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = String(j.title ?? '').trim();
    const externalPath = String(j.externalPath ?? '').trim();
    const jobUrl = w && externalPath
      ? `https://${w.tenant}.${w.shard}.myworkdayjobs.com/${w.site}${externalPath}`
      : '';

    /* `postedOn` is prose ("Posted 3 Days Ago"), not a date. It is deliberately
       NOT parsed into a timestamp — a derived date would look authoritative
       while being a guess. Absent stays absent. */
    return {
      source: source.name,
      provider: 'workday',
      externalId: externalPath || String(j.bulletFields ?? '') || title,
      title,
      organizationName: company,
      location: workdayLocation(j.locationsText ?? j.location),
      department: '',
      employmentType: EMPLOYMENT[String(j.timeType ?? '').toLowerCase()] ?? '',
      workMode: /remote/i.test(String(j.locationsText ?? '')) ? 'remote' : '',
      experienceLevel: '',
      description: htmlToText(String(j.jobDescription ?? '')),
      responsibilities: [],
      requirements: [],
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: false,
      postedAt: '',
      jobUrl,
      applyUrl: jobUrl,
      isActive: Boolean(title && externalPath),
    } satisfies NormalizedJob;
  });
}

export async function fetchWorkday(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const w = source.workday;
  if (!w?.tenant || !w?.shard || !w?.site) return [];
  const post = deps.fetchJsonPost ?? fetchJsonPost;
  const url = `${baseUrl(w)}/jobs`;

  const all: NormalizedJob[] = [];
  const seenPaths = new Set<string>();
  /* Captured ONCE, from page one only. */
  let firstPageTotal: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = { limit: PAGE_SIZE, offset: page * PAGE_SIZE, searchText: '' };
    const json = await post(url, body);
    if (json == null) break;

    const root = (json ?? {}) as Record<string, unknown>;
    if (firstPageTotal === null) {
      const t = Number(root.total);
      firstPageTotal = Number.isFinite(t) && t >= 0 ? t : null;
    }

    const batch = normalizeWorkday(source, json);
    if (batch.length === 0) break;

    let added = 0;
    for (const job of batch) {
      /* externalPath is Workday's stable per-posting key; a repeat means the
         board is serving the same page again and the loop must stop. */
      if (job.externalId && seenPaths.has(job.externalId)) continue;
      if (job.externalId) seenPaths.add(job.externalId);
      all.push(job);
      added += 1;
    }
    if (added === 0) break;
    if (firstPageTotal !== null && all.length >= firstPageTotal) break;
    if (batch.length < PAGE_SIZE) break;
  }

  return maybeFetchDetails(source, all, deps);
}

/**
 * Optionally fill in descriptions, strictly bounded.
 *
 * Enabled only by an explicit `WORKDAY_DETAIL_LIMIT`, and capped regardless.
 * Jobs past the cap keep their (empty) description rather than being dropped.
 */
async function maybeFetchDetails(
  source: ScrapeSource,
  jobs: NormalizedJob[],
  deps: ProviderDeps,
): Promise<NormalizedJob[]> {
  const configured = Number(process.env.WORKDAY_DETAIL_LIMIT ?? DEFAULT_DETAIL_LIMIT);
  const limit = Number.isFinite(configured) ? Math.max(0, Math.min(200, configured)) : 0;
  if (limit === 0) return jobs;

  const w = source.workday;
  if (!w) return jobs;
  const get = deps.fetchJson;
  if (!get) return jobs;

  let used = 0;
  for (const job of jobs) {
    if (used >= limit) break;
    if (job.description || !job.externalId.startsWith('/')) continue;
    used += 1;
    const detail = await get(`${baseUrl(w)}/job${job.externalId}`);
    const info = ((detail ?? {}) as Record<string, unknown>).jobPostingInfo;
    const text = ((info ?? {}) as Record<string, unknown>).jobDescription;
    if (typeof text === 'string' && text.trim()) job.description = htmlToText(text);
  }
  return jobs;
}
