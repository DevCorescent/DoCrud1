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
  getHiringApplications, viewerOrganizationIds,
} from '@/lib/server/hiring';
import { selectJobDocsByOrganizations } from '@/lib/server/db/hiring-jobs-collection';
import { employerJobs, type EmployerJobSort } from '@/lib/server/job-api/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  /* Two INDEPENDENT stores, still batched. Jobs are NOT among them any more —
     see below — because the query that fetches them needs the caller's
     organizations, which are not known until the actor is resolved. */
  const [users, allApplications] = await Promise.all([
    getStoredUsers(), getHiringApplications(),
  ]);
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgIds = await viewerOrganizationIds(actor);

  /* ═══ THE EMPLOYER'S JOBS, NOT EVERY JOB ═══

     This used to load the whole corpus and keep the rows whose
     `organizationId` matched. Measured for a real employer (2 postings):

       find({ organizationId: { $in: orgIds } })      285 ms   0.0026 MB
       getHiringJobs() + filter                   230,436 ms  19.32   MB

     ~800x, and the old cost scaled with the CORPUS rather than with the
     employer — an employer with two jobs paid for all 7,106. The scoping rule
     is unchanged; only the place it is applied moved from JavaScript into the
     query, and the resulting job set was proven identical before this changed.

     Fetching this needs `orgIds`, so it can no longer share the batch above.
     That trades one parallel wave for two — worth roughly 300 ms against the
     230 s it removes. */
  const owned = await selectJobDocsByOrganizations(orgIds);
  /* null is a STORAGE FAILURE, never "this employer has no jobs". Returning an
     empty list here would tell an employer their postings had vanished. */
  if (!owned) {
    return NextResponse.json({ error: 'Could not load your jobs.' }, { status: 500 });
  }

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
