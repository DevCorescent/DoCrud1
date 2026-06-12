import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createAccessEvent, getHistoryEntries, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';
import { deriveOnboardingProgress, deriveOnboardingStage } from '@/lib/server/onboarding';
import { SubmittedDocument } from '@/types/document';

export const dynamic = 'force-dynamic';

function isEmployee(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'employee';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isEmployee(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userEmail = (session?.user?.email || '').toLowerCase();
    const entries = getDbPool()
      ? await selectHistoryRowsForUser({ role: 'employee', email: userEmail, orgId: null })
      : await getHistoryEntries();
    return NextResponse.json(
      entries.filter((entry) => entry.employeeEmail?.toLowerCase() === userEmail && entry.onboardingRequired),
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load employee onboarding records' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isEmployee(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as {
      id?: string;
      backgroundVerificationProfile?: Record<string, unknown>;
      submittedDocuments?: SubmittedDocument[];
      question?: string;
    };
    if (!payload.id) {
      return NextResponse.json({ error: 'Document id is required' }, { status: 400 });
    }

    const current = await getHistoryEntryById(payload.id);
    if (!current) {
      return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 });
    }
    if (current.employeeEmail?.toLowerCase() !== (session?.user?.email || '').toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const uploadedDocuments = Array.isArray(payload.submittedDocuments) && payload.submittedDocuments.length > 0
      ? payload.submittedDocuments.map((document, index) => ({
          id: document.id || `submission-${Date.now()}-${index}`,
          label: document.label,
          fileName: document.fileName,
          mimeType: document.mimeType,
          dataUrl: document.dataUrl,
          uploadedAt: now,
        }))
      : current.submittedDocuments || [];

    const updated = await updateHistoryEntry(payload.id, (entry) => {
      const nextQuestions = payload.question?.trim()
        ? [
            {
              id: `question-${Date.now()}`,
              question: payload.question.trim(),
              askedAt: now,
              askedBy: session?.user?.email || 'employee',
              status: 'open' as const,
            },
            ...(entry.employeeQuestions || []),
          ]
        : entry.employeeQuestions || [];
      const backgroundVerificationProfile = payload.backgroundVerificationProfile
        ? {
            ...(entry.backgroundVerificationProfile || {}),
            ...payload.backgroundVerificationProfile,
            lastUpdatedAt: now,
          }
        : entry.backgroundVerificationProfile;
      const backgroundVerificationStatus = uploadedDocuments.length > 0
        ? 'submitted'
        : backgroundVerificationProfile
          ? 'in_progress'
          : entry.backgroundVerificationStatus || 'not_started';
      const next = {
        ...entry,
        backgroundVerificationProfile,
        submittedDocuments: uploadedDocuments,
        documentsSubmittedAt: uploadedDocuments.length > 0 ? now : entry.documentsSubmittedAt,
        documentsSubmittedBy: uploadedDocuments.length > 0 ? (session?.user?.email || entry.documentsSubmittedBy) : entry.documentsSubmittedBy,
        documentsVerificationStatus: uploadedDocuments.length > 0 ? 'pending' : entry.documentsVerificationStatus,
        backgroundVerificationStatus,
        employeeQuestions: nextQuestions,
        accessEvents: [
          createAccessEvent({
            eventType: uploadedDocuments.length > 0 ? 'upload' : 'edit',
            createdAt: now,
            actorName: session?.user?.email || 'employee',
          }),
          ...(entry.accessEvents || []),
        ].slice(0, 50),
        automationNotes: [
          ...(entry.automationNotes || []),
          ...(payload.question?.trim() ? ['Employee asked an onboarding question'] : []),
          ...(uploadedDocuments.length > 0 ? ['Background verification documents submitted by employee'] : []),
          ...(payload.backgroundVerificationProfile ? ['Background verification profile updated by employee'] : []),
        ],
      };
      return {
        ...next,
        onboardingStage: deriveOnboardingStage(next),
        onboardingProgress: deriveOnboardingProgress(next),
      };
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update employee onboarding' }, { status: 500 });
  }
}
