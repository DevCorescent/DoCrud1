import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { analyzeResumeFromText } from '@/lib/server/resume-ats';
import { createHiringApplication, getHiringJobs, getVisibleHiringApplicationsForUser, updateHiringApplicationStatus } from '@/lib/server/hiring';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    const applications = await getVisibleHiringApplicationsForUser(storedUser);
    return NextResponse.json(applications);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load applications.' }, { status: 500 });
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
    if (storedUser.accountType === 'business' || storedUser.role === 'client' || storedUser.role === 'member') {
      return NextResponse.json({ error: 'Company accounts cannot apply to jobs from this flow.' }, { status: 403 });
    }

    const payload = await request.json();
    const jobId = String(payload?.jobId || '').trim();
    const resumeText = String(payload?.resumeText || '').trim();
    const targetRole = String(payload?.targetRole || '').trim();
    const candidatePhone = String(payload?.candidatePhone || '').trim();

    if (!jobId || !resumeText) {
      return NextResponse.json({ error: 'Job and resume content are required.' }, { status: 400 });
    }

    const jobs = await getHiringJobs();
    const job = jobs.find((entry) => entry.id === jobId && entry.status === 'published');
    if (!job) {
      return NextResponse.json({ error: 'Job posting not found.' }, { status: 404 });
    }

    const analysis = await analyzeResumeFromText(resumeText, targetRole || job.title, payload?.resumeFileName || 'Candidate resume');
    if (analysis.atsScore < job.minimumAtsScore) {
      return NextResponse.json({ error: `This role requires a minimum ATS score of ${job.minimumAtsScore}. Your current score is ${analysis.atsScore}.` }, { status: 400 });
    }

    const application = await createHiringApplication({
      id: `application-${Date.now()}`,
      jobId: job.id,
      organizationId: job.organizationId,
      organizationName: job.organizationName,
      jobTitle: job.title,
      candidateUserId: storedUser.id,
      candidateName: storedUser.name,
      candidateEmail: storedUser.email,
      candidatePhone: candidatePhone || undefined,
      atsScore: analysis.atsScore,
      targetRole: targetRole || job.title,
      resumeText,
      resumeFileName: payload?.resumeFileName || undefined,
      analysisSummary: analysis.executiveSummary,
      analysisDetails: {
        executiveSummary: analysis.executiveSummary,
        recruiterImpression: analysis.recruiterImpression,
        strengths: analysis.strengths.slice(0, 4),
        improvementAreas: analysis.improvementAreas.slice(0, 4),
        missingSignals: analysis.missingSignals.slice(0, 4),
        roleMatches: analysis.roleMatches.slice(0, 3),
        companyMatches: analysis.companyMatches.slice(0, 3),
        sectionScores: analysis.sectionScores,
        applicationRiskLevel: analysis.applicationRiskLevel,
        roleAlignmentSummary: analysis.roleAlignmentSummary,
      },
      status: 'submitted',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ application, analysis }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to submit application.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
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
    if (storedUser.accountType !== 'business' && storedUser.role !== 'client' && storedUser.role !== 'member' && storedUser.role !== 'admin') {
      return NextResponse.json({ error: 'Only company workspaces can review applications.' }, { status: 403 });
    }

    const payload = await request.json();
    const updated = await updateHiringApplicationStatus(String(payload?.applicationId || ''), payload?.status);
    if (!updated) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update application.' }, { status: 400 });
  }
}
