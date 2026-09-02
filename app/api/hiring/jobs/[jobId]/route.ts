/**
 * One job the caller's organization owns: read, update, close.
 *
 * DELETE CLOSES RATHER THAN DESTROYS whenever the job has applications. A
 * posting with applicants is the record those people applied to — deleting it
 * would orphan their applications and erase what they can see about their own
 * history. Only a job nobody has applied to is removed outright.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getHiringApplications, getHiringJobs, removeHiringJob, saveHiringJobs,
  viewerOrganizationIds,
} from '@/lib/server/hiring';
import { employerJobPatch } from '@/lib/server/job-api/queries';
import { jobContentHash, normalizeJobTitle } from '@/lib/server/job-import';
import { statusCounts } from '@/lib/server/job-api/status';

export const dynamic = 'force-dynamic';

async function ownedJob(email: string, jobId: string) {
  /* The users and jobs stores are independent; they were read one after the
     other. Ownership is still decided below from the same records. */
  const [users, jobs] = await Promise.all([getStoredUsers(), getHiringJobs()]);
  const actor = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!actor) return { actor: null, job: null, jobs: [] as Awaited<ReturnType<typeof getHiringJobs>> };
  const orgIds = await viewerOrganizationIds(actor);
  const job = jobs.find((j) => j.id === jobId) ?? null;
  const owns = job && (actor.role === 'admin' || orgIds.includes(job.organizationId));
  return { actor, job: owns ? job : null, jobs };
}

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  /* The applications read does not depend on the ownership outcome, so it runs
     alongside it rather than after. The 404 below is unchanged. */
  const [{ job }, allApplications] = await Promise.all([
    ownedJob(session.user.email, params.jobId),
    getHiringApplications(),
  ]);
  /* A job owned by someone else answers exactly as one that never existed. */
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  const applications = allApplications.filter((a) => a.jobId === job.id);
  return NextResponse.json({
    job,
    stats: { applicantCount: applications.length, counts: statusCounts(applications) },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { job, jobs } = await ownedJob(session.user.email, params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  /* An ALLOW-LIST. Ownership, provenance, identity and timestamps can never be
     reached by a request body, whatever it contains. */
  const patch = employerJobPatch(body as Record<string, unknown>);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const next = { ...job, ...patch, updatedAt: now };
  /* Content changed, so the dedup hash and normalized title move with it —
     otherwise an edited job would look unchanged to the ingestion pipeline. */
  next.normalizedTitle = normalizeJobTitle(String(next.title ?? ''));
  next.contentHash = jobContentHash({
    title: next.title, organizationName: next.organizationName, location: next.location,
    description: next.description, responsibilities: next.responsibilities,
    requirements: next.requirements, preferredSkills: next.preferredSkills,
  });

  await saveHiringJobs(jobs.map((j) => (j.id === job.id ? next : j)));
  return NextResponse.json({ ok: true, job: next });
}

export async function DELETE(request: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = await getStoredUsers();
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job } = await ownedJob(session.user.email, params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  const applications = (await getHiringApplications()).filter((a) => a.jobId === job.id);
  const wantsDelete = request.nextUrl.searchParams.get('mode') === 'delete';

  /* The guard that matters: applications make a job un-deletable. */
  const mode = wantsDelete && applications.length === 0 ? 'delete' : 'unpublish';
  const result = await removeHiringJob(actor, job.id, mode);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    mode,
    ...(wantsDelete && applications.length > 0
      ? { note: `Closed rather than deleted: ${applications.length} application(s) are attached and are preserved.` }
      : {}),
  });
}
