/**
 * Internal job scraper — runs entirely inside DoCrud. No Python, no external
 * service, no filesystem dependency. Produces the 13-column CSV that the
 * EXISTING importer (importJobsFromCsv) turns into HiringJobPosting records.
 *
 * Serverless-bounded: strict per-request timeout, max pages, max jobs, bounded
 * retries, sequential per-host with throttle. A very large crawl is a bounded
 * batch, not an endless request.
 */
import { CSV_HEADER, jobFingerprint } from '@/lib/server/job-import';
import { ScrapeDeps, ScrapeResult, ScrapeSource, RawJob } from './types';
import { extract } from './extractor';
import { fetchText as realFetchText, sleep, SCRAPER_UA } from './fetcher';
import { fetchRobots } from './robots';
import { parseHtml, selectAll } from './html';
import { htmlToText, splitList, deriveKeywords, safeUrl, clip, clipList } from './normalize';
import { fetchAshby } from './providers/ashby';
import { fetchLever } from './providers/lever';
import { scoreJob } from './score';
import { listSources } from './sources';
import { NormalizedJob, ProviderDeps, SourceRunStat } from './types';

const BUDGET_MS = 45_000;
const MAX_PAGES_CAP = 100;
const MAX_JOBS_CAP = 100;

function hostOf(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
}
function hostAllowed(url: string, allowed: string): boolean {
  const h = hostOf(url);
  const a = allowed.toLowerCase();
  return h === a || h.endsWith('.' + a);
}
function pathOf(url: string): string {
  try { const u = new URL(url); return u.pathname + u.search; } catch { return '/'; }
}
function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildRow(rj: RawJob): Record<string, string> {
  const skills = clipList((rj.preferredSkills || []).map(htmlToText));
  const title = clip(htmlToText(rj.title), 300);
  return {
    title,
    organizationName: clip(htmlToText(rj.organizationName), 300),
    location: clip(htmlToText(rj.location), 300),
    department: clip(htmlToText(rj.department), 200),
    employmentType: (rj.employmentType || '').trim(),   // raw — importer canonicalizes
    workMode: (rj.workMode || '').trim(),
    experienceLevel: (rj.experienceLevel || '').trim(),
    description: clip(htmlToText(rj.description), 20000),
    responsibilities: clipList((rj.responsibilities || []).map(htmlToText)).join('|'),
    requirements: clipList((rj.requirements || []).map(htmlToText)).join('|'),
    preferredSkills: skills.join('|'),
    targetRoleKeywords: clipList(
      (rj.targetRoleKeywords || []).length ? rj.targetRoleKeywords : deriveKeywords(title, skills),
    ).join('|'),
    applyUrl: safeUrl(rj.applyUrl),
  };
}

function toCsv(rows: Record<string, string>[]): string {
  const header = (CSV_HEADER as readonly string[]).join(',');
  const body = rows.map((r) => (CSV_HEADER as readonly string[]).map((c) => csvEscape(r[c] ?? '')).join(','));
  return [header, ...body].join('\n');
}

async function discover(source: ScrapeSource, fetchText: (u: string) => Promise<{ status: number; text: string } | null>): Promise<string[]> {
  if (source.sitemapUrl && hostAllowed(source.sitemapUrl, source.host)) {
    const res = await fetchText(source.sitemapUrl);
    if (res?.text) {
      return Array.from(res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
    }
  }
  if (source.listingUrl && hostAllowed(source.listingUrl, source.host)) {
    const res = await fetchText(source.listingUrl);
    if (res?.text) {
      const root = parseHtml(res.text);
      const nodes = source.jobLinkSelector ? selectAll(root, source.jobLinkSelector) : selectAll(root, 'a');
      const urls: string[] = [];
      for (const n of nodes) {
        const href = n.attrs.href;
        if (href) { try { urls.push(new URL(href, source.listingUrl).toString()); } catch { /* skip */ } }
      }
      return urls;
    }
  }
  return [];
}

export async function runScrape(
  source: ScrapeSource,
  opts: { limit?: number } = {},
  deps: ScrapeDeps = {},
): Promise<ScrapeResult> {
  const now = deps.now ?? (() => Date.now());
  const start = now();
  const limit = Math.max(1, Math.min(MAX_JOBS_CAP, Math.floor(opts.limit || 0) || 50));
  const maxPages = Math.max(1, Math.min(MAX_PAGES_CAP, source.maxPages ?? 20));
  const minInterval = Math.max(0, source.minIntervalMs ?? 1000);

  // Host-guarded fetch: NEVER request a host other than the source's allowlisted host.
  const rawFetch = deps.fetchText ?? ((u: string) => realFetchText(u, { timeoutMs: 10_000, retries: 2 }));
  const fetchText = async (u: string) => (hostAllowed(u, source.host) ? rawFetch(u) : null);

  // Robots for the source origin (once).
  let robotsAllows = deps.robotsAllows;
  if (!robotsAllows) {
    const origin = `https://${source.host}`;
    const robots = await fetchRobots(origin, SCRAPER_UA, fetchText);
    robotsAllows = async (u: string) => robots.allows(pathOf(u));
  }

  const urls = (await discover(source, fetchText))
    .filter((u) => hostAllowed(u, source.host))
    .slice(0, maxPages);

  const rows: Record<string, string>[] = [];
  const seen = new Set<string>();
  let scanned = 0, invalid = 0, duplicates = 0, lastAt = 0;

  for (const url of urls) {
    if (rows.length >= limit) break;
    if (now() - start > BUDGET_MS) break;               // serverless time budget
    if (!(await robotsAllows(url))) continue;            // respect robots

    const wait = minInterval - (now() - lastAt);
    if (wait > 0) await sleep(wait);
    lastAt = now();

    const res = await fetchText(url);
    if (!res || !res.text) { continue; }
    scanned++;

    const rj = extract(res.text, url, source.cssFallback);
    if (!rj) { invalid++; continue; }

    const row = buildRow(rj);
    if (!row.title || !row.organizationName) { invalid++; continue; }

    const fp = jobFingerprint(row.organizationName, row.title, row.location);
    if (seen.has(fp)) { duplicates++; continue; }
    seen.add(fp);
    rows.push(row);
  }

  return {
    runId: `internal-${start}`,
    status: 'completed',
    scanned,
    valid: rows.length,
    invalid,
    duplicates,
    csv: toCsv(rows),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Provider aggregation (Ashby / Lever official public APIs)
// ─────────────────────────────────────────────────────────────────────────

function normalizedRow(j: NormalizedJob): Record<string, string> {
  const skills = clipList((j.preferredSkills || []).map(htmlToText));
  const title = clip(j.title, 300);
  return {
    title,
    organizationName: clip(j.organizationName, 300),
    location: clip(j.location, 300),
    department: clip(j.department, 200),
    employmentType: (j.employmentType || '').trim(),
    workMode: (j.workMode || '').trim(),
    experienceLevel: (j.experienceLevel || '').trim(),
    description: clip(j.description, 20000),
    responsibilities: clipList(j.responsibilities || []).join('|'),
    requirements: clipList(j.requirements || []).join('|'),
    preferredSkills: skills.join('|'),
    targetRoleKeywords: clipList((j.targetRoleKeywords || []).length ? j.targetRoleKeywords : deriveKeywords(title, skills)).join('|'),
    applyUrl: safeUrl(j.applyUrl || j.jobUrl),
  };
}

async function fetchSource(source: ScrapeSource, deps: ProviderDeps): Promise<NormalizedJob[]> {
  if (source.provider === 'ashby') return fetchAshby(source, deps);
  if (source.provider === 'lever') return fetchLever(source, deps);
  return []; // 'jsonld' sources use runScrape(); the env registry builds only API sources
}

export interface ApprovedScrapeOptions { totalLimit?: number; deps?: ProviderDeps }

export interface ApprovedScrapeOutput {
  csv: string;
  fetched: number;    // total normalized jobs across sources
  active: number;     // active + valid (before dedupe)
  rejected: number;   // inactive / missing title-org / no valid URL
  failed: number;     // sources that errored
  duplicates: number; // within-batch fingerprint duplicates removed
  perSource: SourceRunStat[];
  jobs: NormalizedJob[];
}

/**
 * Run EVERY enabled approved source, filter to active+valid jobs, score, sort
 * best-first, and within-batch dedupe. Returns the 13-column CSV to hand to the
 * existing importer (which does the existing-job dedupe + system-field
 * generation). A failed source is recorded and never aborts the run.
 */
export async function runApprovedScrape(opts: ApprovedScrapeOptions = {}): Promise<ApprovedScrapeOutput> {
  const deps = opts.deps ?? {};
  const now = deps.now ? deps.now() : Date.now();
  const cap = Math.max(1, Math.min(500, opts.totalLimit ?? 200));

  const perSource: SourceRunStat[] = [];
  let fetched = 0, active = 0, rejected = 0, failed = 0, duplicates = 0;
  const collected: NormalizedJob[] = [];

  for (const source of listSources()) {
    const provider = source.provider ?? 'jsonld';
    try {
      const jobs = await fetchSource(source, deps);
      fetched += jobs.length;
      let a = 0;
      for (const j of jobs) {
        const url = safeUrl(j.applyUrl || j.jobUrl);
        if (!j.isActive || !j.title.trim() || !j.organizationName.trim() || !url) { rejected++; continue; }
        j.score = scoreJob(j, now);
        collected.push(j);
        a++;
      }
      active += a;
      perSource.push({ name: source.name, provider, fetched: jobs.length, active: a, failed: false });
    } catch {
      failed++;
      perSource.push({ name: source.name, provider, fetched: 0, active: 0, failed: true, error: 'fetch failed' });
    }
  }

  collected.sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const j of collected) {
    if (jobs.length >= cap) break;
    const fp = jobFingerprint(j.organizationName, j.title, j.location);
    if (seen.has(fp)) { duplicates++; continue; }
    seen.add(fp);
    jobs.push(j);
  }

  return { csv: toCsv(jobs.map(normalizedRow)), fetched, active, rejected, failed, duplicates, perSource, jobs };
}
