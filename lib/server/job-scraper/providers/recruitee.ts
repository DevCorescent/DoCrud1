/**
 * Recruitee public offers provider.
 *
 *   GET https://{slug}.recruitee.com/api/offers/
 *
 * NOT PAGINATED — the endpoint returns the company's current offers in one
 * response. The TRAILING SLASH is required; without it Recruitee redirects,
 * and a redirect is not a job board.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchJson } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';
import { configError, fetchJsonOrThrow } from '../source-fetch';

const EMPLOYMENT: Record<string, string> = {
  full_time: 'full_time', part_time: 'part_time', contract: 'contract',
  internship: 'internship', freelance: 'freelance', temporary: 'contract',
};

/**
 * Recruitee gives BOTH a flat `location` string and structured parts, and a
 * posting may list several `locations`. Every named place is preserved, joined
 * with " / " — the Phase 4 classifier reads all of them, and collapsing to one
 * city here would discard real locations before anything could use them.
 */
function recruiteeLocation(j: Record<string, unknown>): string {
  const many = Array.isArray(j.locations) ? (j.locations as unknown[]) : [];
  const named = many
    .map((entry) => {
      const l = (entry ?? {}) as Record<string, unknown>;
      const parts = [l.city, l.state_name ?? l.state_code, l.country]
        .map((p) => String(p ?? '').trim()).filter(Boolean);
      return parts.join(', ');
    })
    .filter(Boolean);

  if (named.length) {
    return named.map((n) => normalizeIndiaLocation(n)).join(' / ');
  }
  const flat = String(j.location ?? '').trim();
  if (flat) return normalizeIndiaLocation(flat);
  const parts = [j.city, j.state_name, j.country]
    .map((p) => String(p ?? '').trim()).filter(Boolean);
  return parts.length ? normalizeIndiaLocation(parts.join(', ')) : '';
}

export function normalizeRecruitee(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.offers) ? (root.offers as unknown[]) : [];
  const fallback = source.label || '';

  return list.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = String(j.title ?? '').trim();
    const remote = j.remote === true || /remote/i.test(String(j.location ?? ''));

    return {
      source: source.name,
      provider: 'recruitee',
      externalId: String(j.id ?? j.slug ?? '').trim(),
      title,
      organizationName: String(j.company_name ?? '').trim() || fallback,
      location: recruiteeLocation(j),
      department: String(j.department ?? '').trim(),
      employmentType: EMPLOYMENT[String(j.employment_type ?? '').toLowerCase()] ?? '',
      workMode: remote ? 'remote' : '',
      experienceLevel: '',
      /* Recruitee descriptions are HTML; the shared converter strips it. */
      description: htmlToText(String(j.description ?? '')),
      responsibilities: [],
      requirements: [htmlToText(String(j.requirements ?? ''))].filter(Boolean),
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: false,
      postedAt: String(j.published_at ?? j.created_at ?? '').trim(),
      jobUrl: String(j.careers_url ?? j.careers_apply_url ?? '').trim(),
      applyUrl: String(j.careers_apply_url ?? j.careers_url ?? '').trim(),
      isActive: Boolean(title && String(j.id ?? j.slug ?? '').trim()),
    } satisfies NormalizedJob;
  });
}

export async function fetchRecruitee(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const slug = (source.board ?? '').trim();
  /* Re-validated here as well as in the registry: this slug becomes a HOST. */
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(slug)) configError('Recruitee source has no valid company slug.');
  /* Trailing slash is required — see the file header. Throws on failure so a
     dead board is never recorded as an empty successful one. */
  const json = await fetchJsonOrThrow(`https://${slug}.recruitee.com/api/offers/`, deps);
  return normalizeRecruitee(source, json);
}
