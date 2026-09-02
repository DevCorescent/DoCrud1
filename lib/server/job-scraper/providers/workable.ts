/**
 * Workable public widget provider.
 *
 *   GET https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true
 *
 * NOT PAGINATED — the widget returns the account's current board in one
 * response. `details=true` is used so descriptions arrive with the list rather
 * than costing one extra request per posting; that is exactly the N+1 the
 * per-job endpoints would create.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';
import { configError, fetchJsonOrThrow } from '../source-fetch';

const EMPLOYMENT: Record<string, string> = {
  full_time: 'full_time', fulltime: 'full_time', part_time: 'part_time',
  contract: 'contract', temporary: 'contract', internship: 'internship', intern: 'internship',
};

/** City/state/country, joined only from the parts that exist. */
function workableLocation(raw: unknown): string {
  const l = (raw ?? {}) as Record<string, unknown>;
  const parts = [l.city, l.region, l.country]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean);
  if (!parts.length) return '';
  return normalizeIndiaLocation(parts.join(', '));
}

export function normalizeWorkable(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.jobs) ? (root.jobs as unknown[]) : [];
  /* The account name is the company's own; fall back to the configured label
     rather than to the slug, which is an identifier and not a name. */
  const company = String(root.name ?? '').trim() || source.label || '';

  return list.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = String(j.title ?? '').trim();
    /* `telecommuting` is Workable's explicit remote flag. Read, never inferred. */
    const remote = j.telecommuting === true;

    return {
      source: source.name,
      provider: 'workable',
      externalId: String(j.shortcode ?? j.id ?? '').trim(),
      title,
      organizationName: company,
      location: workableLocation(j.location ?? j),
      department: String(j.department ?? '').trim(),
      employmentType: EMPLOYMENT[String(j.type ?? '').toLowerCase().replace(/[\s-]+/g, '_')] ?? '',
      workMode: remote ? 'remote' : '',
      experienceLevel: '',
      description: htmlToText(String(j.description ?? '')),
      responsibilities: [],
      requirements: [htmlToText(String(j.requirements ?? ''))].filter(Boolean),
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: false,
      postedAt: String(j.published_on ?? j.created_at ?? '').trim(),
      jobUrl: String(j.url ?? j.application_url ?? '').trim(),
      applyUrl: String(j.application_url ?? j.url ?? '').trim(),
      isActive: Boolean(title && String(j.shortcode ?? j.id ?? '').trim()),
    } satisfies NormalizedJob;
  });
}

export async function fetchWorkable(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const slug = (source.board ?? '').trim();
  if (!slug) configError('Workable source has no account slug.');
  const json = await fetchJsonOrThrow(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`, deps);
  return normalizeWorkable(source, json);
}
