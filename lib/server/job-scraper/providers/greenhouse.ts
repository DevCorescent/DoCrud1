/**
 * Greenhouse public Job Board API provider.
 *
 *   GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
 *   docs: https://developers.greenhouse.io/job-board.html
 *
 * NOT PAGINATED, deliberately. The public Job Board API returns the board's
 * complete job list in one response. (Greenhouse's paginated endpoints belong
 * to the authenticated Harvest API, which is a different product and needs a
 * key — out of scope for a public-source architecture.) Fetches once.
 *
 * Public, no auth/secret. Lists a company's currently-open postings. The board
 * token comes from configuration (GREENHOUSE_BOARDS), never hardcoded.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';
import { prettyCompany } from './ashby';
import { configError, fetchJsonOrThrow } from '../source-fetch';

export function normalizeGreenhouse(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const jobs = raw && typeof raw === 'object' && Array.isArray((raw as { jobs?: unknown }).jobs)
    ? ((raw as { jobs: unknown[] }).jobs)
    : [];
  const company = source.label || prettyCompany(source.board || '');
  return jobs.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const loc = (j.location ?? {}) as Record<string, unknown>;
    const location = normalizeIndiaLocation(String(loc.name ?? '').trim());
    const departments = Array.isArray(j.departments) ? (j.departments as Array<Record<string, unknown>>) : [];
    const title = String(j.title ?? '').trim();
    const workMode = /remote/i.test(String(loc.name ?? '')) ? 'remote' : '';
    return {
      source: source.name,
      provider: 'greenhouse',
      externalId: String(j.id ?? ''),
      title,
      organizationName: company,
      location,
      department: String(departments[0]?.name ?? '').trim(),
      employmentType: '',                         // GH board API doesn't expose this → importer default
      workMode,
      experienceLevel: '',
      description: htmlToText(String(j.content ?? '')),
      responsibilities: [],
      requirements: [],
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: false,
      postedAt: j.updated_at ? new Date(String(j.updated_at)).toISOString() : '',
      jobUrl: String(j.absolute_url ?? ''),
      applyUrl: String(j.absolute_url ?? ''),
      isActive: true,                             // public board lists only open jobs
    } satisfies NormalizedJob;
  });
}

export async function fetchGreenhouse(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const board = (source.board ?? '').trim();
  if (!board) configError('Greenhouse source has no board token.');
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
  /* Throws on 404/500/timeout/parse failure, so the runner records a FAILED
     source instead of an empty successful one. */
  const json = await fetchJsonOrThrow(url, deps);
  return normalizeGreenhouse(source, json);
}
