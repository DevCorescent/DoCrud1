/**
 * The employer's posted jobs, with applicant statistics.
 *
 * Ranking, filtering, search and pagination all live in
 * lib/server/job-api/queries.ts; this route authenticates, scopes to the
 * caller's organizations, and serialises. Counts come from ONE pass over the
 * applications rather than a query per job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getHiringApplications, getHiringJobs, viewerOrganizationIds,
} from '@/lib/server/hiring';
import { employerJobs, type EmployerJobSort } from '@/lib/server/job-api/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  /* Three INDEPENDENT stores. They were awaited one after another, so the
     request cost the sum of three round trips instead of the slowest one.
     Nothing here depends on anything else here — the actor lookup is a find()
     over the users already in hand. */
  const [users, allJobs, allApplications] = await Promise.all([
    getStoredUsers(), getHiringJobs(), getHiringApplications(),
  ]);
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* Depends on the actor, so it cannot join the batch above. */
  const orgIds = await viewerOrganizationIds(actor);
  /* Scoped HERE, once. Everything downstream is presentation. */
  const owned = allJobs.filter((j) => orgIds.includes(j.organizationId));
  const ownedIds = new Set(owned.map((j) => j.id));
  const applications = allApplications.filter((a) => ownedIds.has(a.jobId));

  const q = request.nextUrl.searchParams;
  return NextResponse.json(employerJobs(owned, applications, {
    search: q.get('search') ?? undefined,
    status: q.get('status') ?? undefined,
    state: q.get('state') ?? undefined,
    sort: (q.get('sort') as EmployerJobSort | null) ?? undefined,
    page: q.get('page') ?? undefined,
    pageSize: q.get('pageSize') ?? undefined,
  }));
}
