import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getHiringJobsPostedByUser, getVisibleHiringApplicationsForUser,
  getVisibleHiringJobsForUser, removeHiringJob, upsertHiringJob,
} from '@/lib/server/hiring';
import { canUserAccessFeature } from '@/lib/server/saas';
import { enforceRateLimits, getClientIp, RATE_POLICIES } from '@/lib/server/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((entry) => entry.email.toLowerCase() === session.user.email!.toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    /* ?scope=mine — only the postings this user created, each with its live
       application count. The counts come from ONE already-scoped applications
       read tallied in memory, not a query per job, so the list stays a single
       round trip however many jobs there are. */
    if (request.nextUrl.searchParams.get('scope') === 'mine') {
      const [jobs, applications] = await Promise.all([
        getHiringJobsPostedByUser(storedUser),
        getVisibleHiringApplicationsForUser(storedUser),
      ]);
      const counts = new Map<string, number>();
      for (const application of applications) {
        counts.set(application.jobId, (counts.get(application.jobId) ?? 0) + 1);
      }
      return NextResponse.json({
        jobs: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          organizationName: job.organizationName,
          location: job.location ?? '',
          employmentType: job.employmentType ?? '',
          workMode: job.workMode ?? '',
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          applicationCount: counts.get(job.id) ?? 0,
        })),
      });
    }

    const jobs = await getVisibleHiringJobsForUser(storedUser);
    return NextResponse.json(jobs);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load jobs.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((entry) => entry.email.toLowerCase() === session.user.email!.toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }
    /* WHO MAY POST
       ------------
       Workspaces (business / client / member) keep the EXACT gate they had,
       including the hiring_desk plan entitlement — nothing is weakened for
       them. Individuals are now also allowed, which is the point of the
       marketplace composer at /jobs/post: a person posting one role should not
       need a company workspace.

       The plan entitlement is deliberately NOT applied to individuals, because
       `hiring_desk` describes the workspace product they do not have. That is a
       commercial decision as much as a technical one — see the note in the
       feature report if posting should be metered for individuals too. */
    const isWorkspacePoster = storedUser.accountType === 'business'
      || storedUser.role === 'client'
      || storedUser.role === 'member'
      || storedUser.role === 'admin';

    if (isWorkspacePoster && storedUser.role !== 'admin') {
      const allowed = await canUserAccessFeature(storedUser, 'hiring_desk');
      if (!allowed) {
        return NextResponse.json({ error: 'Your current plan does not include the hiring desk.' }, { status: 403 });
      }
    }

    const payload = await request.json();
    if (!payload?.title?.trim() || !payload?.description?.trim()) {
      return NextResponse.json({ error: 'Job title and description are required.' }, { status: 400 });
    }

    /* CREATES are rate limited; edits are not. Repeatedly saving a job you
       already own is not an abuse vector, and counting edits would punish
       someone correcting a typo. Admins are exempt, mirroring the entitlement
       check above. Uses the project's existing Mongo-backed limiter, so the
       counter is correct across serverless instances. */
    if (!payload.id && storedUser.role !== 'admin') {
      const limited = await enforceRateLimits([
        { key: `job-post:account:${storedUser.id}`, policy: RATE_POLICIES.jobPostAccount },
        { key: `job-post:ip:${getClientIp(request)}`, policy: RATE_POLICIES.jobPostIp },
      ]);
      if (limited) return limited;
    }

    /* Ownership fields in the body are ignored: upsertHiringJob derives owner,
       creator and organization from `storedUser`, which came from the session.
       It also refuses to overwrite a job this user does not own. */
    const job = await upsertHiringJob(storedUser, payload);
    return NextResponse.json(job, { status: payload.id ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save job posting.';
    // The ownership refusal is a 403, not a validation error.
    const status = message === 'You can only manage jobs you posted.' ? 403
      : message === 'Job not found.' ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Unpublish (`?mode=unpublish`, the default) or permanently delete
 * (`?mode=delete`) a job the session user owns.
 *
 * Ownership is verified server-side against the stored record, so changing the
 * id in the request reaches someone else's job and gets a 403.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((entry) => entry.email.toLowerCase() === session.user.email!.toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    const id = request.nextUrl.searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'A job id is required.' }, { status: 400 });

    const mode = request.nextUrl.searchParams.get('mode') === 'delete' ? 'delete' : 'unpublish';
    const result = await removeHiringJob(storedUser, id, mode);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ ok: true, id, mode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove job posting.' },
      { status: 500 },
    );
  }
}
