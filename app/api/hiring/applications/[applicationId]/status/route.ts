/**
 * Change one application's status.
 *
 * The whole recruitment funnel runs through here: REVIEWING, SHORTLISTED,
 * INTERVIEW, ASSIGNMENT, OFFER_PROPOSED, HIRED, REJECTED — plus the candidate's
 * own WITHDRAWN. Transition legality, role permissions and history are decided
 * by lib/server/job-api/status.ts; this route only authenticates, authorizes,
 * persists, and fires the rejection notice.
 *
 * AUTHORIZATION IS RE-DERIVED FROM THE STORED APPLICATION, never from the
 * request: knowing an application id proves nothing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getHiringApplications, saveHiringApplications, viewerOrganizationIds,
} from '@/lib/server/hiring';
import { parseStatus, transitionStatus } from '@/lib/server/job-api/status';
import { employerOwnsApplication, isApplicationCandidate } from '@/lib/server/job-api/resume-access';
import { sendRejectionEmail } from '@/lib/server/job-api/rejection-notice';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { applicationId: string } },
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
    if (!actor) return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const to = parseStatus((body as { status?: unknown })?.status);
    if (!to) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });

    const applications = await getHiringApplications();
    const application = applications.find((a) => a.id === params.applicationId) ?? null;

    const orgIds = await viewerOrganizationIds(actor);
    const isAdmin = actor.role === 'admin';
    const asEmployer = employerOwnsApplication(application, orgIds, isAdmin);
    const asCandidate = isApplicationCandidate(application, actor.id);

    /* A stranger gets 404, not 403: confirming that an id exists is itself a
       small leak, and they have no business knowing either way. */
    if (!application || (!asEmployer && !asCandidate)) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const result = transitionStatus({
      application,
      to,
      actorId: actor.id,
      actorRole: asEmployer ? 'employer' : 'candidate',
      now,
      note: typeof (body as { note?: unknown })?.note === 'string' ? (body as { note: string }).note : undefined,
    });

    if (!result.ok || !result.application) {
      const status = result.error === 'NOT_PERMITTED' ? 403 : 400;
      return NextResponse.json({ error: result.error ?? 'Invalid transition.' }, { status });
    }

    let next = result.application;
    let emailSent = false;
    let emailError: string | undefined;

    /* The email is attempted BEFORE the write only so its timestamp can be
       stored in the same save. A failure never blocks the status change — see
       the fallthrough below. */
    if (result.shouldSendRejectionEmail) {
      const notice = await sendRejectionEmail(next, now);
      emailSent = notice.emailSent;
      emailError = notice.emailError;
      if (notice.emailSent && notice.sentAt) {
        next = { ...next, rejectionEmailSentAt: notice.sentAt };
      }
    }

    await saveHiringApplications(applications.map((a) => (a.id === next.id ? next : a)));

    return NextResponse.json({
      ok: true,
      status: to,
      statusHistory: next.statusHistory ?? [],
      /* Reported, never fatal: the candidate IS rejected either way. */
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update status.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
