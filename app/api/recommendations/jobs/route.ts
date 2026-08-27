/**
 * Recommended jobs for the viewer.
 *
 * Ranks the existing published hiring jobs against the viewer's EXISTING stored
 * profile using the deterministic scorer in lib/server/job-recommend.ts. The
 * profile is always the current SESSION's (resolveSessionUserId) — a client can
 * never request another user's recommendations. No new job system, no fabricated
 * postings; when there are no jobs it returns an empty list.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { getFeedConfig } from '@/lib/server/feed-config';
import { buildRecProfile, hasProfileSignals, isRecommended, recommendMatch, type RecJob } from '@/lib/server/job-recommend';
import { isValidApplyUrl } from '@/lib/jobs-ui';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const config = await getFeedConfig();
    if (!config.jobs.enabled) return NextResponse.json({ jobs: [] }, { headers: { 'Cache-Control': 'no-store' } });

    const jobs = await getPublishedHiringJobs().catch(() => [] as Awaited<ReturnType<typeof getPublishedHiringJobs>>);
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ jobs: [], total: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Viewer signals from the stored profile — never client-supplied.
    const session = await getAuthSession().catch(() => null);
    const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
    const fields = meId
      ? await getProfileFields(meId, ['headline', 'skills', 'location', 'experience', 'interests']).catch(() => null)
      : null;
    const profile = buildRecProfile((fields ?? {}) as Parameters<typeof buildRecProfile>[0]);
    const showMatch = hasProfileSignals(profile);
    const now = Date.now();

    const scored = (jobs as unknown as Array<Record<string, unknown>>).map((j) => {
      const recJob: RecJob = {
        id: String(j.id ?? ''),
        title: String(j.title ?? ''),
        organizationName: String(j.organizationName ?? ''),
        location: String(j.location ?? ''),
        employmentType: String(j.employmentType ?? ''),
        workMode: String(j.workMode ?? ''),
        experienceLevel: String(j.experienceLevel ?? ''),
        description: String(j.description ?? ''),
        preferredSkills: Array.isArray(j.preferredSkills) ? (j.preferredSkills as string[]) : [],
        targetRoleKeywords: Array.isArray(j.targetRoleKeywords) ? (j.targetRoleKeywords as string[]) : [],
        createdAt: String(j.createdAt ?? ''),
      };
      const match = recommendMatch(profile, recJob, now);
      const job: Record<string, unknown> = {
        id: recJob.id,
        title: recJob.title || 'Open role',
        organizationName: recJob.organizationName,
        location: recJob.location,
        employmentType: recJob.employmentType,
        workMode: recJob.workMode,
        preferredSkills: (recJob.preferredSkills ?? []).slice(0, 4),
        // The REAL original application URL (Ashby/Lever/Greenhouse) carried through
        // untouched — powers the "Apply Now" action + source attribution in the UI.
        applyUrl: isValidApplyUrl(String(j.applyUrl ?? '')) ? String(j.applyUrl) : '',
        createdAt: recJob.createdAt,
      };
      if (showMatch) { job.matchScore = match.score; job.matchReasons = match.reasons; }
      return { score: showMatch ? match.score : 0, recommended: showMatch && isRecommended(match), job };
    });

    scored.sort((a, b) => b.score - a.score || Date.parse(String(b.job.createdAt)) - Date.parse(String(a.job.createdAt)));
    /* THE RECOMMENDED SET: roles that genuinely overlap the viewer's profile
       (a shared skill or a matching role), not merely everything that scored
       above zero — "remote" and "posted recently" alone score 18 on every
       listing, which made the old count read like the whole job board. With no
       profile signals nothing can be recommended, and the count is honestly 0.

       `total` is that set's real size, BEFORE maxCards trims the carousel, so
       the homepage headline never shrinks to the size of a row. */
    const recommended = scored.filter((s) => s.recommended);
    const total = recommended.length;

    /* ?scope=recommended returns the whole recommended set instead of the
       carousel's worth — what /jobs?recommended=1 renders, so the page can
       never show fewer roles than the headline promised. */
    const scope = new URL(request.url).searchParams.get('scope');
    const payload = scope === 'recommended'
      ? recommended.map((s) => s.job)
      : scored.slice(0, config.jobs.maxCards).map((s) => s.job);

    return NextResponse.json({ jobs: payload, total }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[recommendations/jobs] GET error', error);
    return NextResponse.json({ jobs: [], total: 0 }, { status: 200 });
  }
}
