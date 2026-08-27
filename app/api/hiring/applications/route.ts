import { NextRequest, NextResponse } from 'next/server';
import { HiringJobApplication } from '@/types/document';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { analyzeResumeFromText } from '@/lib/server/resume-ats';
import { extractDocumentText } from '@/lib/server/document-parser';
import { getProfileData } from '@/lib/server/user-profiles';
import { r2KeyFromUrl } from '@/lib/server/r2';
import { canUserManageApplication, createHiringApplication, getHiringApplications, getPublishedHiringJobById, getVisibleHiringApplicationsForUser, updateHiringApplicationStatus } from '@/lib/server/hiring';

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

/**
 * Resolves the text the ATS gate scores, and the reference pinned onto the
 * application, from whichever resume the candidate chose.
 *
 * The text is derived SERVER-SIDE from the actual file in every file-backed
 * case. A browser could otherwise submit a strong body of text while attaching
 * a weak document, and the recruiter would receive a score that describes
 * something they were never sent.
 */
async function resolveResume(
  userId: string,
  payload: {
    resumeSource?: { kind?: string; resumeId?: string; url?: string; fileName?: string };
    resumeText?: string;
    resumeFileName?: string;
  },
): Promise<{ text: string; ref: HiringJobApplication['resumeRef'] } | { error: string }> {
  const kind = payload.resumeSource?.kind;

  if (kind === 'profile') {
    const profile = await getProfileData(userId);
    const entry = (profile?.resumeFiles ?? []).find((item) => item.id === payload.resumeSource?.resumeId);
    if (!entry?.url) return { error: 'That resume is no longer available on your profile.' };
    const text = await textFromStoredFile(entry.url, entry.fileName);
    if (!text) return { error: 'We could not read that resume. Upload it again for this application.' };
    return {
      text,
      ref: { source: 'profile', resumeId: entry.id, fileName: entry.fileName, url: entry.url },
    };
  }

  if (kind === 'upload') {
    const url = String(payload.resumeSource?.url || '');
    const fileName = String(payload.resumeSource?.fileName || 'resume');
    // Must be a URL our OWN bucket issued. isStorageUrl() only tests for an
    // http(s) prefix, which would let the browser make this endpoint fetch any
    // address it likes (SSRF); r2KeyFromUrl returns null for anything outside
    // R2_PUBLIC_URL.
    if (!ownStorageUrl(url)) return { error: 'Upload the resume again before submitting.' };
    const text = await textFromStoredFile(url, fileName);
    if (!text) return { error: 'We could not read that file. Try a PDF, Word or text resume.' };
    return { text, ref: { source: 'upload', fileName, url } };
  }

  // Pasted text — the original flow, unchanged.
  const text = String(payload.resumeText || '').trim();
  if (!text) return { error: 'Job and resume content are required.' };
  return { text, ref: { source: 'text', fileName: payload.resumeFileName || 'Pasted resume' } };
}

/** True only for a URL our own R2 bucket issued. */
function ownStorageUrl(url: string): boolean {
  return !!url && r2KeyFromUrl(url) !== null;
}

/** Reads a file back out of our own storage and returns its text ('' on failure). */
async function textFromStoredFile(url: string, fileName: string): Promise<string> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return '';
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get('content-type') || 'application/octet-stream';
    return (await extractDocumentText(fileName, mime, buffer)).trim();
  } catch {
    return '';
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
    const targetRole = String(payload?.targetRole || '').trim();
    const candidatePhone = String(payload?.candidatePhone || '').trim();
    const coverLetter = String(payload?.coverLetter || '').trim();

    if (!jobId) {
      return NextResponse.json({ error: 'Job and resume content are required.' }, { status: 400 });
    }

    // Resolves both native hiring jobs and Business Page jobs projected into the feed.
    const job = await getPublishedHiringJobById(jobId);
    if (!job || job.status !== 'published') {
      return NextResponse.json({ error: 'Job posting not found.' }, { status: 404 });
    }

    const resolved = await resolveResume(storedUser.id, payload);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const { text: resumeText, ref: resumeRef } = resolved;

    /* Attachments. Every URL must be one our own storage issued — the record is
       shown to the recruiter, so an arbitrary link here would let an applicant
       point a company's staff at anything. */
    const documents: NonNullable<HiringJobApplication['documents']> = [];
    for (const entry of Array.isArray(payload?.documents) ? payload.documents : []) {
      const url = String(entry?.url || '');
      if (!ownStorageUrl(url)) continue;
      documents.push({
        id: String(entry?.id || `doc-${documents.length + 1}`),
        label: String(entry?.label || 'Additional document').slice(0, 80),
        fileName: String(entry?.fileName || 'document').slice(0, 200),
        url,
        uploadedAt: new Date().toISOString(),
      });
    }

    /* Only documents this job actually asked for can block submission. A job
       that requested nothing must never appear to require anything. */
    const requested = (job.requiredDocuments ?? []).filter(Boolean);
    const missing = requested.filter(
      (label) => !documents.some((doc) => doc.label.toLowerCase() === label.toLowerCase()),
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `This role requires: ${missing.join(', ')}.` },
        { status: 400 },
      );
    }

    const analysis = await analyzeResumeFromText(resumeText, targetRole || job.title, resumeRef?.fileName || 'Candidate resume');
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
      resumeFileName: resumeRef?.fileName,
      resumeRef,
      documents: documents.length > 0 ? documents : undefined,
      coverLetter: coverLetter || undefined,
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
    const applicationId = String(payload?.applicationId || '');

    // Authorize against the application's owning org/page BEFORE mutating status —
    // a business may only review applications to its own hiring or Business Page jobs.
    const applications = await getHiringApplications();
    const target = applications.find((entry) => entry.id === applicationId);
    if (!target) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    if (!(await canUserManageApplication(storedUser, target))) {
      return NextResponse.json({ error: 'You are not authorized to review this application.' }, { status: 403 });
    }

    const updated = await updateHiringApplicationStatus(applicationId, payload?.status);
    if (!updated) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update application.' }, { status: 400 });
  }
}
