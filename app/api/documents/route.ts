import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createAccessEvent, getHistoryEntries, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { DataCollectionStatus, DocumentHistory, ManagedFile } from '@/types/document';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

function sanitizeDocumentForSuperAdmin(entry: DocumentHistory): DocumentHistory {
  if (!entry.organizationId) {
    return entry;
  }

  return {
    ...entry,
    data: {},
    previewHtml: undefined,
    pdfUrl: undefined,
    uploadedPdfDataUrl: undefined,
    signedPdfDataUrl: undefined,
    emailTo: undefined,
    emailSubject: undefined,
    emailError: undefined,
    deliveryHistory: [],
    automationNotes: [],
    shareUrl: undefined,
    sharePassword: undefined,
    submittedDocuments: [],
    documentsSubmittedBy: undefined,
    documentsVerificationNotes: undefined,
    dataCollectionInstructions: undefined,
    dataCollectionReviewNotes: undefined,
    recipientSignerName: undefined,
    recipientSignatureDataUrl: undefined,
    recipientSignedIp: undefined,
    recipientSignedLocationLabel: undefined,
    recipientSignedLatitude: undefined,
    recipientSignedLongitude: undefined,
    recipientSignedAccuracyMeters: undefined,
    collaborationComments: [],
    accessEvents: [],
    managedFiles: [],
    clientEmail: undefined,
    employeeEmail: undefined,
    onboardingCredentials: undefined,
    employeeQuestions: [],
    superAdminLocked: true,
    superAdminUnlockScope: 'tenant_document',
    superAdminUnlockHint: entry.organizationName || entry.clientOrganization || entry.generatedBy,
    superAdminUnlockMessage: 'This tenant-owned document is hidden from super admin until the tenant shares the generated access password.',
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const accessPassword = request.nextUrl.searchParams.get('accessPassword')?.trim().toUpperCase();
    const entries = await getHistoryEntries();

    return NextResponse.json(entries.map((entry) => {
      if (!entry.organizationId) {
        return entry;
      }

      if (accessPassword && entry.sharePassword === accessPassword) {
        return {
          ...entry,
          superAdminLocked: false,
          superAdminUnlockScope: 'tenant_document',
          superAdminUnlockHint: entry.organizationName || entry.clientOrganization || entry.generatedBy,
        };
      }

      return sanitizeDocumentForSuperAdmin(entry);
    }));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as {
      id?: string;
      documentsVerificationStatus?: 'verified' | 'rejected';
      documentsVerificationNotes?: string;
      data?: Record<string, string>;
      previewHtml?: string;
      requiredDocuments?: string[];
      requiredDocumentWorkflowEnabled?: boolean;
      recipientAccess?: 'view' | 'comment' | 'edit';
      dataCollectionEnabled?: boolean;
      dataCollectionStatus?: DataCollectionStatus;
      dataCollectionInstructions?: string;
      dataCollectionReviewNotes?: string;
      recipientSignatureRequired?: boolean;
      sharePassword?: string;
      revokedAt?: string;
      managedFiles?: ManagedFile[];
      editorState?: Record<string, unknown>;
      automationNotes?: string[];
      clientName?: string;
      clientEmail?: string;
      clientOrganization?: string;
      folderLabel?: string;
      organizationId?: string;
      organizationName?: string;
      adminAccessPassword?: string;
    };
    if (!payload.id) {
      return NextResponse.json({ error: 'Document id is required' }, { status: 400 });
    }

    const existing = await getHistoryEntryById(payload.id);
    if (!existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (existing.organizationId && existing.sharePassword !== payload.adminAccessPassword?.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Tenant access password is required before super admin can open or edit this document' }, { status: 403 });
    }
    if (payload.documentsVerificationStatus) {
      if (!existing.requiredDocumentWorkflowEnabled) {
        return NextResponse.json({ error: 'Required-document workflow is not enabled for this document' }, { status: 400 });
      }
      if (payload.documentsVerificationStatus === 'verified' && !existing.submittedDocuments?.length) {
        return NextResponse.json({ error: 'Recipient documents must be submitted before verification' }, { status: 400 });
      }

      const verifiedAt = new Date().toISOString();
      const updated = await updateHistoryEntry(payload.id, (entry) => ({
        ...entry,
        documentsVerificationStatus: payload.documentsVerificationStatus,
        documentsVerificationNotes: payload.documentsVerificationNotes?.trim() || undefined,
        documentsVerifiedAt: verifiedAt,
        documentsVerifiedBy: session?.user?.email || 'admin',
        accessEvents: [
          createAccessEvent({
            eventType: 'verify',
            createdAt: verifiedAt,
            actorName: session?.user?.email || 'admin',
          }),
          ...(entry.accessEvents || []),
        ].slice(0, 50),
        automationNotes: [
          ...(entry.automationNotes || []),
          `Required documents ${payload.documentsVerificationStatus} by ${session?.user?.email || 'admin'}`,
        ],
      }));

      return NextResponse.json(updated);
    }

    const updatedAt = new Date().toISOString();
    const updated = await updateHistoryEntry(payload.id, (entry) => ({
      ...entry,
      data: payload.data && typeof payload.data === 'object' ? Object.fromEntries(Object.entries(payload.data).map(([key, value]) => [key, String(value ?? '')])) : entry.data,
      previewHtml: typeof payload.previewHtml === 'string' ? payload.previewHtml : entry.previewHtml,
      requiredDocuments: Array.isArray(payload.requiredDocuments) ? payload.requiredDocuments.map(String).filter(Boolean) : entry.requiredDocuments,
      requiredDocumentWorkflowEnabled: typeof payload.requiredDocumentWorkflowEnabled === 'boolean' ? payload.requiredDocumentWorkflowEnabled : entry.requiredDocumentWorkflowEnabled,
      recipientAccess: payload.recipientAccess || entry.recipientAccess,
      dataCollectionEnabled: typeof payload.dataCollectionEnabled === 'boolean' ? payload.dataCollectionEnabled : entry.dataCollectionEnabled,
      dataCollectionStatus: payload.dataCollectionStatus
        || (payload.dataCollectionEnabled === false ? 'disabled' : undefined)
        || (payload.data && entry.dataCollectionEnabled ? 'reviewed' : entry.dataCollectionStatus),
      dataCollectionInstructions: payload.dataCollectionInstructions?.trim() || entry.dataCollectionInstructions,
      dataCollectionReviewNotes: typeof payload.dataCollectionReviewNotes === 'string' ? payload.dataCollectionReviewNotes.trim() || undefined : entry.dataCollectionReviewNotes,
      dataCollectionReviewedAt: payload.dataCollectionStatus === 'changes_requested' || payload.dataCollectionStatus === 'reviewed' || payload.dataCollectionStatus === 'finalized'
        ? updatedAt
        : entry.dataCollectionReviewedAt,
      dataCollectionReviewedBy: payload.dataCollectionStatus === 'changes_requested' || payload.dataCollectionStatus === 'reviewed' || payload.dataCollectionStatus === 'finalized'
        ? (session?.user?.email || 'admin')
        : entry.dataCollectionReviewedBy,
      recipientSignatureRequired: typeof payload.recipientSignatureRequired === 'boolean' ? payload.recipientSignatureRequired : entry.recipientSignatureRequired,
      sharePassword: payload.sharePassword?.trim() ? payload.sharePassword.trim().toUpperCase() : entry.sharePassword,
      revokedAt: typeof payload.revokedAt === 'string' ? payload.revokedAt : entry.revokedAt,
      managedFiles: Array.isArray(payload.managedFiles) ? payload.managedFiles : entry.managedFiles,
      editorState: payload.editorState && typeof payload.editorState === 'object' ? { ...entry.editorState, ...payload.editorState } : entry.editorState,
      clientName: payload.clientName?.trim() || entry.clientName,
      clientEmail: payload.clientEmail?.trim().toLowerCase() || entry.clientEmail,
      clientOrganization: payload.clientOrganization?.trim() || entry.clientOrganization,
      folderLabel: payload.folderLabel?.trim() || entry.folderLabel,
      organizationId: payload.organizationId?.trim() || entry.organizationId,
      organizationName: payload.organizationName?.trim() || entry.organizationName,
      versionSnapshots: [
        {
          id: `version-${Date.now()}`,
          versionLabel: payload.editorState?.versionLabel ? String(payload.editorState.versionLabel) : entry.editorState?.versionLabel || `v${(entry.versionSnapshots || []).length + 1}`,
          createdAt: updatedAt,
          createdBy: session?.user?.email || 'admin',
          summary: 'Enterprise editor update',
          previewHtml: typeof payload.previewHtml === 'string' ? payload.previewHtml : entry.previewHtml,
        },
        ...(entry.versionSnapshots || []),
      ].slice(0, 20),
      lastEditedAt: updatedAt,
      editCount: (entry.editCount || 0) + 1,
      accessEvents: [
        createAccessEvent({
          eventType: 'edit',
          createdAt: updatedAt,
          actorName: session?.user?.email || 'admin',
        }),
        ...(entry.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [
        ...(entry.automationNotes || []),
        ...(Array.isArray(payload.automationNotes) ? payload.automationNotes.map(String) : []),
        ...(payload.dataCollectionStatus ? [`Data collection status updated to ${payload.dataCollectionStatus}`] : []),
        `Enterprise editor update saved by ${session?.user?.email || 'admin'}`,
      ],
    }));

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update document verification' }, { status: 500 });
  }
}
