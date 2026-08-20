/**
 * Recommended jobs for the viewer.
 *
 * Ranks the existing published hiring jobs against the viewer's stored profile
 * using Superadmin-configured weights. No new job system and no fabricated
 * postings — when there are no published jobs this returns an empty list and
 * the feed simply does not reserve a slot.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { getFeedConfig } from '@/lib/server/feed-config';

export const dynamic = 'force-dynamic';

function tokens(s: unknown): string[] {
  return String(s ?? '').toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2);
}

export async function GET() {
  try {
    const config = await getFeedConfig();
    if (!config.jobs.enabled) return NextResponse.json({ jobs: [] }, { headers: { 'Cache-Control': 'no-store' } });

    const jobs = await getPublishedHiringJobs().catch(() => [] as Awaited<ReturnType<typeof getPublishedHiringJobs>>);
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ jobs: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    /* Viewer signals from the stored profile — never client-supplied. */
    let domain: string[] = [];
    let skills: string[] = [];
    let location = '';
    const session = await getAuthSession().catch(() => null);
    const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
    if (meId) {
      const p = await getProfileFields(meId, ['headline', 'skills', 'location']).catch(() => null);
      domain = tokens((p as { headline?: unknown } | null)?.headline);
      skills = (Array.isArray((p as { skills?: unknown } | null)?.skills)
        ? ((p as { skills: unknown[] }).skills) : []).map((s) => String(s).toLowerCase());
      location = String((p as { location?: unknown } | null)?.location ?? '').toLowerCase();
    }

    const w = config.jobs;
    const now = Date.now();

    const scored = (jobs as unknown as Array<Record<string, unknown>>).map((j) => {
      const title = String(j.title ?? '');
      const hay = `${title} ${String(j.description ?? '')} ${String(j.employmentType ?? '')}`.toLowerCase();
      const jobLoc = String(j.location ?? '').toLowerCase();

      const domainHits = domain.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      const skillHits = skills.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      const locHit = location && jobLoc && jobLoc.includes(location) ? 1 : 0;
      const ageDays = Math.max(0, (now - Date.parse(String(j.createdAt ?? '')) || 0) / 86_400_000);
      const recency = Number.isFinite(ageDays) ? Math.max(0, 30 - Math.min(30, ageDays)) / 30 : 0;

      const score = domainHits * w.domainWeight + skillHits * w.skillWeight + locHit * w.locationWeight + recency * w.recencyWeight;
      return {
        score,
        job: {
          id: String(j.id ?? ''),
          title: title || 'Open role',
          organizationName: String(j.organizationName ?? ''),
          location: String(j.location ?? ''),
          employmentType: String(j.employmentType ?? ''),
          createdAt: String(j.createdAt ?? ''),
        },
      };
    });

    scored.sort((a, b) => b.score - a.score || Date.parse(b.job.createdAt) - Date.parse(a.job.createdAt));
    return NextResponse.json(
      { jobs: scored.slice(0, w.maxCards).map((s) => s.job) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[recommendations/jobs] GET error', error);
    return NextResponse.json({ jobs: [] }, { status: 200 });
  }
}
