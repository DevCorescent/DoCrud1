/**
 * Greenhouse public Job Board API provider.
 *
 *   GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
 *   docs: https://developers.greenhouse.io/job-board.html
 *
 * Public, no auth/secret. Lists a company's currently-open postings. The board
 * token comes from configuration (GREENHOUSE_BOARDS), never hardcoded.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';
import { prettyCompany } from './ashby';

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
  if (!board) return [];
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
  const json = deps.fetchJson ? await deps.fetchJson(url) : await fetchJson(url);
  if (json == null) return [];
  return normalizeGreenhouse(source, json);
}
