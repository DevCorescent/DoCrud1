/**
 * Applicants for one job the caller's organization owns.
 *
 * Ranked by ATS score descending with a deterministic candidate-id tie-break,
 * paginated, and filterable. The ATS score is READ from each stored
 * application — Phase 6 produced it at submit time — and is never recomputed
 * here: recomputing per request would be slow and could disagree with the
 * score the candidate was shown.
 *
 * NO RESUME IS FETCHED. Rows carry `hasResume` and a filename; the bytes are
 * only ever served by the dedicated resume endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getHiringApplications, getHiringJobs, viewerOrganizationIds,
} from '@/lib/server/hiring';
import { rankApplicants } from '@/lib/server/job-api/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const users = await getStoredUsers();
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgIds = await viewerOrganizationIds(actor);
  const jobs = await getHiringJobs();
  const job = jobs.find((j) => j.id === params.jobId);

  /* Ownership is checked against the JOB, so another employer asking for this
     job id gets the same answer as someone asking for one that never existed. */
  const owns = Boolean(job) && (actor.role === 'admin' || orgIds.includes(job!.organizationId));
  if (!job || !owns) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const applications = (await getHiringApplications()).filter((a) => a.jobId === job.id);
  const q = request.nextUrl.searchParams;
  const page = rankApplicants(applications, {
    search: q.get('search') ?? undefined,
    status: q.get('status') ?? undefined,
    minAts: q.get('minAts') ?? undefined,
    maxAts: q.get('maxAts') ?? undefined,
    sort: (q.get('sort') as 'ats' | 'newest' | 'oldest' | 'name' | null) ?? undefined,
    page: q.get('page') ?? undefined,
    pageSize: q.get('pageSize') ?? undefined,
  });

  return NextResponse.json(page);
}
