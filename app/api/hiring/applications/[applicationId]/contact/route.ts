/**
 * Open (or find) the conversation between an employer and their applicant.
 *
 * REUSES THE EXISTING MESSAGING SYSTEM — `getOrCreateConversation` in
 * lib/server/messages.ts. No second chat is created; this route only
 * establishes that the two people have a legitimate reason to talk and hands
 * back the conversation id the existing messages API already understands.
 *
 * WHY THE THREAD OPENS ACTIVE. Messaging normally puts a conversation between
 * non-mutual-followers into a REQUEST state. An applicant relationship is
 * stronger evidence than a follow: the candidate chose to apply to this
 * company. Making them accept a request before hearing back about their own
 * application would be an obstacle with no purpose.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getHiringApplications, getHiringJobs, viewerOrganizationIds } from '@/lib/server/hiring';
import { getOrCreateConversation } from '@/lib/server/messages';
import { employerOwnsApplication, isApplicationCandidate } from '@/lib/server/job-api/resume-access';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { applicationId: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = await getStoredUsers();
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const application = (await getHiringApplications()).find((a) => a.id === params.applicationId) ?? null;
  const orgIds = await viewerOrganizationIds(actor);
  const asEmployer = employerOwnsApplication(application, orgIds, actor.role === 'admin');
  const asCandidate = isApplicationCandidate(application, actor.id);

  /* THE authorization rule: only the two parties to this application. */
  if (!application || (!asEmployer && !asCandidate)) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  /* The other party is derived from the APPLICATION and its JOB, never
     supplied by the caller — otherwise this endpoint would open a chat with
     anyone whose id you could guess. */
  let toUserId: string | null = null;
  if (asEmployer) {
    toUserId = application.candidateUserId || null;
    if (!toUserId) return NextResponse.json({ error: 'Candidate not available.' }, { status: 404 });
  } else {
    /* Candidate side: the employer is whoever created the job. */
    const job = (await getHiringJobs()).find((j) => j.id === application.jobId);
    toUserId = job?.createdByUserId || null;
    if (!toUserId) return NextResponse.json({ error: 'Employer not available.' }, { status: 404 });
  }

  const { conversation, created } = await getOrCreateConversation(actor.id, toUserId, 'job');
  return NextResponse.json({
    ok: true, created,
    conversationId: conversation.id,
    status: conversation.status,
  });
}
