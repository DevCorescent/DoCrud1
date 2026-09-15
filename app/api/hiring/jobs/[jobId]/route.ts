/**
 * One job the caller's organization owns: read, update, close.
 *
 * DELETE CLOSES RATHER THAN DESTROYS whenever the job has applications. A
 * posting with applicants is the record those people applied to — deleting it
 * would orphan their applications and erase what they can see about their own
 * history. Only a job nobody has applied to is removed outright.
 */
import { writeHiringJobs } from '@/lib/server/hiring-write';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getHiringApplications, removeHiringJob,
  viewerOrganizationIds,
} from '@/lib/server/hiring';
import { employerJobPatch } from '@/lib/server/job-api/queries';
import { jobContentHash, normalizeJobTitle } from '@/lib/server/job-import';
import { statusCounts } from '@/lib/server/job-api/status';
import { selectJobDocById } from '@/lib/server/db/hiring-jobs-collection';

export const dynamic = 'force-dynamic';

async function ownedJob(email: string, jobId: string) {
  /* ═══ ONE JOB IS READ AS ONE JOB ═══

     This used to call `getHiringJobs()` and then `.find()` the single posting
     it wanted — loading the entire corpus to answer a question about one
     document. Measured against production:

       selectJobDocById   323 ms     0.01 MB
       getHiringJobs()  238,107 ms  19.32 MB   (7,106 docs)

     737x slower for an identical result, and the cost grows with every job
     ever scraped. The two reads were proven equivalent before this changed:
     six postings sampled across the corpus serialized byte-for-byte the same,
     and an unknown id still returns null, so the 404 below is untouched.

     The users store is still read alongside it — ownership is decided from the
     same records as before, by the same rule. */
  const [users, job] = await Promise.all([getStoredUsers(), selectJobDocById(jobId)]);
  const actor = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!actor) return { actor: null, job: null };
  const orgIds = await viewerOrganizationIds(actor);
  const owns = job && (actor.role === 'admin' || orgIds.includes(job.organizationId));
  return { actor, job: owns ? job : null };
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
  const { job } = await ownedJob(session.user.email, params.jobId);
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

  /* Phase 2.7E: writes ONE document. An edit never moves a posting, so no
     position is supplied and the stored `_order` is left alone. */
  const write = await writeHiringJobs([next as unknown as Record<string, unknown>]);
  if (!write.ok) {
    return NextResponse.json({ error: 'Could not save the job.' }, { status: 500 });
  }
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
