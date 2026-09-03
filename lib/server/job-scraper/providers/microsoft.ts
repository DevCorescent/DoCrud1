/**
 * Microsoft Careers provider (Eightfold "pcsx" public search).
 *
 * ═══ WHAT WAS DISCOVERED, AND HOW ═══
 *
 * Microsoft Careers runs on Eightfold AI. The endpoints below were not guessed:
 * a browser was pointed at the public search page and the requests it made were
 * recorded. The SPA calls exactly two things to list and describe jobs:
 *
 *   GET https://apply.careers.microsoft.com/api/pcsx/search
 *         ?domain=<domain>&query=&location=&start=<n>&num=<n>
 *   GET https://apply.careers.microsoft.com/api/pcsx/position_details
 *         ?position_id=<id>&domain=<domain>&hl=en
 *
 * ═══ WHY THIS IS PERMITTED ═══
 *
 * https://apply.careers.microsoft.com/robots.txt reads:
 *
 *     User-agent: *
 *     Disallow: /
 *     Allow: /careers
 *     Allow: /api/apply
 *     Allow: /api/pcsx        ← these endpoints
 *     …
 *
 * A blanket Disallow with named exceptions, and `/api/pcsx` is one of them.
 * Both endpoints answer a plain unauthenticated GET: no cookie, no CSRF token,
 * no reCAPTCHA token, no session. Nothing here defeats a control — the site
 * loads reCAPTCHA for its APPLY flow, which this adapter never touches. If that
 * ever changes and these paths begin demanding a token, the correct response is
 * to stop calling them, not to satisfy it.
 *
 * ═══ THE PAGE SIZE IS THEIRS, NOT OURS ═══
 *
 * `num` is accepted and IGNORED: 10, 20, 50, 100 and 200 all return exactly 10
 * results. Ten per page is the server's number, so a full corpus of ~2,200 jobs
 * is ~222 search requests before a single description is read. That cost is the
 * reason this adapter is bounded per run — see MAX_PAGES — and the reason the
 * migration in the report is required rather than optional.
 *
 * ═══ WHAT IT REFUSES TO DO ═══
 *
 *  · No experience level. `efcustomTextRoletype` says "Individual Contributor",
 *    which is a role type, not a seniority band. The field is left empty and
 *    the shared `experienceFromTitle` decides downstream, from the title the
 *    employer actually wrote.
 *  · No normalization, identity or dedupe of its own. This file returns
 *    NormalizedJob[] and stops; normalizeSourceJob → jobIdentity → planIngest
 *    do the rest, exactly as for every other provider.
 *  · No URL it was handed. `publicUrl` comes back in the response body, so it
 *    is treated as untrusted: used only when it is on the one permitted host,
 *    and otherwise rebuilt from the numeric id.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';
import { configError, fetchJsonOrThrow } from '../source-fetch';

/** The ONLY host this adapter may contact. A literal, so no input can move it. */
export const MICROSOFT_HOST = 'apply.careers.microsoft.com';
const BASE = `https://${MICROSOFT_HOST}`;

/* ── Bounds ───────────────────────────────────────────────────────────────
   Every one is a ceiling, and every one is configurable DOWN as well as up so
   an operator can throttle this source without a deploy. */

/** Fixed by the server: `num` is ignored and 10 always come back. */
export const PAGE_SIZE = 10;

const num = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

/** Search pages per run. 10 pages ≈ 100 jobs ≈ 110 requests with details. */
export const maxPages = () => num(process.env.MICROSOFT_MAX_PAGES, 10, 1, 500);
/** Parallel DETAIL requests. Deliberately tiny: this is someone else's site. */
export const detailConcurrency = () => num(process.env.MICROSOFT_CONCURRENCY, 2, 1, 8);
/** Pause between search pages, so pagination is never a burst. */
export const minIntervalMs = () => num(process.env.MICROSOFT_MIN_INTERVAL_MS, 250, 0, 10_000);
/** Descriptions to fetch per run. 0 disables detail fetching entirely. */
export const detailLimit = () => num(process.env.MICROSOFT_DETAIL_LIMIT, 100, 0, 1_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Field mapping ────────────────────────────────────────────────────────*/

/** Eightfold's workLocationOption, read rather than inferred. */
const WORK_MODE: Record<string, string> = {
  onsite: 'onsite', on_site: 'onsite', office: 'onsite',
  remote: 'remote', hybrid: 'hybrid',
};

/** `efcustomTextEmploymentType` — "Full-Time", "Intern", … */
const EMPLOYMENT: Record<string, string> = {
  full_time: 'full_time', fulltime: 'full_time',
  part_time: 'part_time', parttime: 'part_time',
  contract: 'contract', contractor: 'contract', temporary: 'contract',
  intern: 'internship', internship: 'internship',
};

const first = (v: unknown): string =>
  (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();

/** Unix SECONDS to ISO. Absent or nonsensical stays absent — never "now". */
function tsToIso(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '';
  /* Their timestamps are seconds. Anything that would land outside a sane
     window is treated as unreadable rather than coerced into a date. */
  const ms = n * 1000;
  const year = new Date(ms).getUTCFullYear();
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return '';
  return new Date(ms).toISOString();
}

/**
 * A URL from the RESPONSE BODY is only usable if it is on the permitted host.
 * Anything else is discarded and rebuilt, so a compromised or changed upstream
 * cannot point our stored applyUrl at a host of its choosing.
 */
export function safeJobUrl(publicUrl: unknown, positionId: string): string {
  const raw = String(publicUrl ?? '').trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' && u.hostname.toLowerCase() === MICROSOFT_HOST) return u.toString();
    } catch { /* unparseable — fall through to the rebuilt form */ }
  }
  return positionId ? `${BASE}/careers/job/${encodeURIComponent(positionId)}` : '';
}

/**
 * One search result to a NormalizedJob.
 *
 * `externalId` is the MICROSOFT REQUISITION ID (`displayJobId`/`atsJobId`),
 * not the Eightfold row id and never the title: it is the identifier Microsoft
 * itself shows on the posting, so the same job keeps one identity even if
 * Eightfold reindexes it. The internal id is the fallback, and only that.
 */
export function normalizeMicrosoftPosition(
  source: ScrapeSource,
  entry: unknown,
  detail?: unknown,
): NormalizedJob | null {
  const j = (entry ?? {}) as Record<string, unknown>;
  const d = (detail ?? {}) as Record<string, unknown>;

  const title = String(j.name ?? d.name ?? '').trim();
  const positionId = String(j.id ?? d.id ?? '').trim();
  const requisition = String(j.displayJobId ?? j.atsJobId ?? d.displayJobId ?? d.atsJobId ?? '').trim();
  const externalId = requisition || positionId;
  /* No title or no id means we cannot identify it. Dropped, never invented. */
  if (!title || !externalId) return null;

  const locationRaw = String(
    d.location ?? (Array.isArray(j.locations) ? j.locations[0] : '') ?? '',
  ).trim();

  const employment = first(d.efcustomTextEmploymentType).toLowerCase().replace(/[\s-]+/g, '_');
  const description = htmlToText(String(d.jobDescription ?? ''));
  const url = safeJobUrl(d.publicUrl, positionId);

  return {
    source: source.name,
    provider: 'microsoft',
    externalId,
    title,
    organizationName: source.label || 'Microsoft',
    location: locationRaw ? normalizeIndiaLocation(locationRaw) : '',
    department: String(j.department ?? d.department ?? '').trim(),
    employmentType: EMPLOYMENT[employment] ?? '',
    workMode: WORK_MODE[String(j.workLocationOption ?? d.workLocationOption ?? '').toLowerCase()] ?? '',
    /* NEVER set. Microsoft states no seniority; experienceFromTitle decides
       downstream from the title, and an unreadable title yields none at all. */
    experienceLevel: '',
    description,
    responsibilities: [],
    requirements: [],
    preferredSkills: [],
    targetRoleKeywords: deriveKeywords(title, []),
    /* No salary is published on these endpoints, so none is claimed. */
    salaryPresent: false,
    postedAt: tsToIso(j.postedTs ?? d.postedTs) || tsToIso(j.creationTs ?? d.creationTs),
    jobUrl: url,
    applyUrl: url,
    isActive: true,
  };
}

/* ── Bounded concurrency ──────────────────────────────────────────────────*/

/**
 * Run `work` over `items` with at most `limit` in flight.
 *
 * A plain Promise.all over a page would open ten sockets to someone else's
 * infrastructure at once. This keeps it to `limit`, and a worker that throws
 * ends only its own item.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<Array<R | null>> {
  const out: Array<R | null> = new Array(items.length).fill(null);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= items.length) return;
      try { out[i] = await work(items[i], i); } catch { out[i] = null; }
    }
  });
  await Promise.all(lanes);
  return out;
}

/* ── The fetch ────────────────────────────────────────────────────────────*/

export interface MicrosoftFetchOptions {
  /** Page index to begin at. Lets a run resume where the last one stopped. */
  startPage?: number;
  /** Overrides for tests; production reads the environment. */
  maxPages?: number;
  concurrency?: number;
  intervalMs?: number;
  detailLimit?: number;
}

export interface MicrosoftFetchResult {
  jobs: NormalizedJob[];
  /** Page to resume at, or null when the corpus was exhausted. */
  nextPage: number | null;
  /** Search pages actually requested. */
  pagesFetched: number;
  /** The total the API reported, when it reported one. */
  total: number | null;
  /** Detail requests made, and how many came back usable. */
  detailsFetched: number;
  detailsFailed: number;
}

export async function fetchMicrosoftPaged(
  source: ScrapeSource,
  deps: ProviderDeps = {},
  opts: MicrosoftFetchOptions = {},
): Promise<MicrosoftFetchResult> {
  const domain = (source.board ?? '').trim();
  if (!domain) configError('Microsoft source has no Eightfold domain identifier.');

  const pageCap = opts.maxPages ?? maxPages();
  const concurrency = opts.concurrency ?? detailConcurrency();
  const interval = opts.intervalMs ?? minIntervalMs();
  const wantDetails = opts.detailLimit ?? detailLimit();
  const startPage = Math.max(0, Math.floor(opts.startPage ?? 0));

  const jobs: NormalizedJob[] = [];
  const seen = new Set<string>();
  /* Page fingerprints, so a server that repeats a page — or ignores `start` —
     is detected rather than paged over forever. */
  const pageSignatures = new Set<string>();
  let total: number | null = null;
  let pagesFetched = 0;
  let detailsFetched = 0;
  let detailsFailed = 0;
  let page = startPage;
  let exhausted = false;

  for (let i = 0; i < pageCap; i += 1) {
    if (i > 0 && interval > 0) await sleep(interval);

    const url = `${BASE}/api/pcsx/search`
      + `?domain=${encodeURIComponent(domain)}`
      + `&query=&location=&start=${page * PAGE_SIZE}&num=${PAGE_SIZE}`;

    /* Throws on failure, INCLUDING mid-pagination: half a board returned as if
       it were the whole board is the more dangerous failure, because it looks
       exactly like a company that shrank. */
    const json = await fetchJsonOrThrow(url, deps);
    pagesFetched += 1;

    const data = (((json ?? {}) as Record<string, unknown>).data ?? {}) as Record<string, unknown>;
    const positions = Array.isArray(data.positions) ? (data.positions as unknown[]) : [];

    if (total === null) {
      const c = Number(data.count);
      total = Number.isFinite(c) && c >= 0 ? c : null;
    }

    /* Past the end. The API answers an over-large `start` with an empty list
       rather than an error, which is the natural termination signal. */
    if (positions.length === 0) { exhausted = true; break; }

    const signature = positions
      .map((p) => String(((p ?? {}) as Record<string, unknown>).id ?? '')).join(',');
    if (pageSignatures.has(signature)) break;   // the page repeated
    pageSignatures.add(signature);

    const fresh: Array<{ raw: unknown; positionId: string }> = [];
    for (const p of positions) {
      const row = (p ?? {}) as Record<string, unknown>;
      const key = String(row.displayJobId ?? row.atsJobId ?? row.id ?? '').trim();
      if (!key || seen.has(key)) continue;      // duplicate id across pages
      seen.add(key);
      fresh.push({ raw: p, positionId: String(row.id ?? '').trim() });
    }

    /* Descriptions live only on the detail endpoint. Bounded, concurrent, and
       best effort: a job whose detail fails is still stored, without one. */
    const room = Math.max(0, wantDetails - detailsFetched);
    const withDetail = fresh.slice(0, room);
    const details = await mapWithConcurrency(withDetail, concurrency, async (item) => {
      if (!item.positionId) return null;
      const durl = `${BASE}/api/pcsx/position_details`
        + `?position_id=${encodeURIComponent(item.positionId)}`
        + `&domain=${encodeURIComponent(domain)}&hl=en`;
      const res = await fetchJsonOrThrow(durl, deps);
      return ((res ?? {}) as Record<string, unknown>).data ?? null;
    });
    for (let k = 0; k < withDetail.length; k += 1) {
      if (details[k]) detailsFetched += 1; else detailsFailed += 1;
    }

    let added = 0;
    for (let k = 0; k < fresh.length; k += 1) {
      const job = normalizeMicrosoftPosition(source, fresh[k].raw, k < withDetail.length ? details[k] : null);
      if (!job) continue;
      jobs.push(job);
      added += 1;
    }

    page += 1;
    /* Nothing new on a non-empty page means the provider is repeating itself. */
    if (added === 0 && fresh.length === 0) break;
    if (total !== null && page * PAGE_SIZE >= total) { exhausted = true; break; }
    if (positions.length < PAGE_SIZE) { exhausted = true; break; }
  }

  return {
    jobs,
    /* null means "start again from the top next run". A bounded run that has
       NOT exhausted the corpus hands back the page to resume at. */
    nextPage: exhausted ? null : page,
    pagesFetched,
    total,
    detailsFetched,
    detailsFailed,
  };
}

/** The shape the registry's provider adapter expects. */
export async function fetchMicrosoft(
  source: ScrapeSource,
  deps: ProviderDeps = {},
  opts: MicrosoftFetchOptions = {},
): Promise<NormalizedJob[]> {
  return (await fetchMicrosoftPaged(source, deps, opts)).jobs;
}
