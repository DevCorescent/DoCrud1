/**
 * Interview / assignment / offer on one application.
 *
 * One route, an `action` in the body, because all five operations share the
 * same authorization: find the application, work out whether the caller is the
 * employer or the candidate, and let the pure functions in
 * lib/server/job-api/stages.ts decide whether that role may do that thing.
 *
 * Actions: set_interview, set_assignment, submit_assignment, propose_offer,
 * respond_to_offer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getHiringApplications, saveHiringApplications, viewerOrganizationIds,
} from '@/lib/server/hiring';
import { employerOwnsApplication, isApplicationCandidate } from '@/lib/server/job-api/resume-access';
import {
  proposeOffer, respondToOffer, setAssignment, setInterview, stageView, submitAssignment,
  type StageResult,
} from '@/lib/server/job-api/stages';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { applicationId: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = await getStoredUsers();
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const applications = await getHiringApplications();
  const application = applications.find((a) => a.id === params.applicationId) ?? null;
  const orgIds = await viewerOrganizationIds(actor);
  const isAdmin = actor.role === 'admin';
  const asEmployer = employerOwnsApplication(application, orgIds, isAdmin);
  const asCandidate = isApplicationCandidate(application, actor.id);

  /* A caller with no relationship to this application is told the same thing
     as one using an id that does not exist. */
  if (!application || (!asEmployer && !asCandidate)) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const actorRole: 'employer' | 'candidate' = asEmployer ? 'employer' : 'candidate';
  const now = new Date().toISOString();
  const base = { application, actorRole, actorId: actor.id, now };

  let result: StageResult;
  switch (String(body.action ?? '')) {
    case 'set_interview': result = setInterview({ ...base, ...body }); break;
    case 'set_assignment': result = setAssignment({ ...base, ...body }); break;
    case 'submit_assignment': result = submitAssignment({ ...base, ...body }); break;
    case 'propose_offer': result = proposeOffer({ ...base, ...body }); break;
    case 'respond_to_offer': result = respondToOffer({ ...base, ...body }); break;
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  if (!result.ok || !result.application) {
    const status = result.error === 'NOT_PERMITTED' ? 403 : 400;
    return NextResponse.json({ error: result.error ?? 'Invalid request.' }, { status });
  }

  const next = result.application;
  await saveHiringApplications(applications.map((a) => (a.id === next.id ? next : a)));
  return NextResponse.json({ ok: true, stages: stageView(next, actorRole) });
}

export async function GET(_req: NextRequest, { params }: { params: { applicationId: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = await getStoredUsers();
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const application = (await getHiringApplications()).find((a) => a.id === params.applicationId) ?? null;
  const orgIds = await viewerOrganizationIds(actor);
  const asEmployer = employerOwnsApplication(application, orgIds, actor.role === 'admin');
  const asCandidate = isApplicationCandidate(application, actor.id);
  if (!application || (!asEmployer && !asCandidate)) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }
  /* The candidate's view omits the recruiter's private interview notes. */
  return NextResponse.json(stageView(application, asEmployer ? 'employer' : 'candidate'));
}
