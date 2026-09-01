/**
 * BambooHR public careers provider.
 *
 *   GET https://{slug}.bamboohr.com/careers/list
 *
 * NOT PAGINATED — the endpoint returns the company's current list in one JSON
 * response. Like Personio, an unknown slug REDIRECTS to bamboohr.com rather
 * than 404ing, so this refuses to follow redirects: a marketing page is not an
 * empty job board, and reporting it as one would be a silent wrong answer.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchTextStrict } from '../fetcher';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';

/** BambooHR spreads location across sparse, often-null fields. */
function bambooLocation(raw: unknown): string {
  const l = (raw ?? {}) as Record<string, unknown>;
  const parts = [l.city, l.state, l.country]
    .map((p) => String(p ?? '').trim())
    .filter((p) => p && p.toLowerCase() !== 'null');
  if (!parts.length) return '';
  return normalizeIndiaLocation(parts.join(', '));
}

export function normalizeBambooHr(source: ScrapeSource, raw: unknown): NormalizedJob[] {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.result) ? (root.result as unknown[]) : [];
  const company = source.label || '';
  const slug = (source.board ?? '').trim();

  return list.map((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = String(((j.jobOpeningName ?? j.title) ?? '')).trim();
    const id = String(j.id ?? '').trim();
    const type = String(((j.employmentStatusLabel ?? j.employmentStatus) ?? '')).trim().toLowerCase();
    const remote = String(j.isRemote ?? '').toLowerCase() === 'yes' || j.isRemote === true;

    return {
      source: source.name,
      provider: 'bamboohr',
      externalId: id,
      title,
      organizationName: company,
      location: bambooLocation(j.location),
      department: String(j.departmentLabel ?? j.department ?? '').trim(),
      employmentType: type.includes('full') ? 'full_time'
        : type.includes('part') ? 'part_time'
          : type.includes('contract') ? 'contract'
            : type.includes('intern') ? 'internship' : '',
      workMode: remote ? 'remote' : '',
      experienceLevel: '',
      /* The list endpoint carries no description. Left EMPTY rather than
         filled with the title or a placeholder. */
      description: htmlToText(String(j.description ?? '')),
      responsibilities: [],
      requirements: [],
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: false,
      postedAt: '',
      jobUrl: id && slug ? `https://${slug}.bamboohr.com/careers/${encodeURIComponent(id)}` : '',
      applyUrl: id && slug ? `https://${slug}.bamboohr.com/careers/${encodeURIComponent(id)}` : '',
      isActive: Boolean(title && id),
    } satisfies NormalizedJob;
  });
}

export async function fetchBambooHr(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const slug = (source.board ?? '').trim();
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(slug)) return [];
  const get = deps.fetchTextStrict
    ?? ((url: string) => fetchTextStrict(url, { expectContentType: /json|text\/plain/i }));
  const res = await get(`https://${slug}.bamboohr.com/careers/list`);
  if (!res || res.status !== 200) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(res.text); } catch { return []; }
  return normalizeBambooHr(source, parsed);
}
