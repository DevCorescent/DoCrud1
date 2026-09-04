/**
 * Real jobs for the onboarding preview.
 *
 * ═══ WHERE THE DATA COMES FROM ═══
 *
 * /api/jobs/public — the existing public job feed. It reads no session, returns
 * active postings only (`isJobActive` is its single definition of active), and
 * exposes fields through an allow-list, so nothing private can leak through it.
 * No new endpoint was added and no authorization was weakened.
 *
 * ═══ WHY THERE IS NO MATCH SCORE ═══
 *
 * The design source printed a big number computed as
 * `(skills.length || 1) * 3137 + 1862`. That is fiction and is not carried over.
 *
 * A real score is not available on this pre-auth screen either, for three
 * separate reasons, each sufficient on its own:
 *
 *   1. /api/recommendations/jobs returns 401 without a session. Correct, and
 *      not to be worked around.
 *   2. `publicJobView` does not expose `targetRoleKeywords`, so the role half
 *      of the scorer's input cannot be seen from the client at all.
 *   3. `preferredSkills` is empty across the corpus — 500 jobs sampled over
 *      four pages plus a domain-filtered query, zero carried one. The skill
 *      half of the input is absent too.
 *
 * With both overlap inputs missing, `recommendMatch` would score only its
 * baseline signals, which its own documentation warns about: "remote plus
 * posted recently alone already scores 18 on every open role, which is why an
 * unfiltered count read like the whole job board." Every job would score alike,
 * and the number would mean nothing while looking like it meant something.
 *
 * So these are honestly presented as open roles in a chosen direction, not as
 * personalised matches, and the count is the API's own `total`. Personalised
 * recommendation belongs after authentication, where the real endpoint lives.
 */

import { getCompanyJobDisplayCount } from '@/lib/company-explorer';
import type { RoleOption } from '@/lib/onboarding-roles';

/** Only fields /api/jobs/public actually returns. Nothing is derived. */
export type JobPreview = {
  id: string;
  title: string;
  organizationName?: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  postedAt?: string;
};

export type JobPreviewResult = {
  jobs: JobPreview[];
  /** The API's own count for this query. Never invented, never persisted. */
  total: number;
};

/**
 * The count to DISPLAY: rounded DOWN to the nearest five, then "+".
 *
 * Down, never up: the screen must never promise more open roles than exist.
 * 23 shows as 20+, 44 as 40+, 25 as 25+, and 0 as 0+. The arithmetic is
 * Docrud's existing rule (getCompanyJobDisplayCount), not a second copy of it,
 * and `total` itself is left untouched — this is presentation only.
 */
export function formatRecommendedJobCount(actual: number): string {
  return `${getCompanyJobDisplayCount(actual).toLocaleString('en-US')}+`;
}

/**
 * The step reports a count, not a list, so one row is all the feed needs to
 * return — `total` is the same either way and the response stays tiny.
 */
export const JOB_PREVIEW_LIMIT = 1;

/**
 * The query for a chosen direction.
 *
 * A direction picked from the chips is a JobDomain, so it filters by `domain`.
 * Free text the person typed instead is passed to `search`, which is what that
 * parameter is for. Neither invents a filter the API does not already support.
 */
export function jobQueryForRoles(
  roles: readonly string[],
  customRoles: readonly string[],
  options: readonly RoleOption[],
): string {
  const params = new URLSearchParams({
    pageSize: String(JOB_PREVIEW_LIMIT),
    sort: 'newest',
  });
  /* The feed filters by one domain at a time, so the first chosen direction
     decides the filter and the rest are honoured by the wording on screen
     rather than by a second query. A typed role has no domain, so it goes to
     `search`, which is what that parameter is for. Neither invents a filter the
     API does not already support. */
  const domain = roles.find(id => options.some(option => option.id === id));
  if (domain) params.set('domain', domain);
  else if (customRoles[0]?.trim()) params.set('search', customRoles[0].trim());
  return params.toString();
}

/**
 * Fetches the preview. Throws on a failed response so the caller can show a
 * real error — a failure must never be presented as "no jobs found".
 */
export async function fetchJobPreview(query: string): Promise<JobPreviewResult> {
  const res = await fetch(`/api/jobs/public?${query}`);
  if (!res.ok) throw new Error(`Job feed responded ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) throw new Error('Job feed returned no item list');

  return {
    jobs: (data.items as JobPreview[]).map(item => ({
      id: item.id,
      title: item.title,
      organizationName: item.organizationName,
      location: item.location,
      workMode: item.workMode,
      employmentType: item.employmentType,
      postedAt: item.postedAt,
    })),
    total: Number(data.total) || 0,
  };
}
