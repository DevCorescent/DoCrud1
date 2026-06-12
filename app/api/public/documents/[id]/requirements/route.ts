import { NextRequest, NextResponse } from 'next/server';
import { createAccessEvent, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';
import { SubmittedDocument } from '@/types/document';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await request.json() as {
      password?: string;
      submitterName?: string;
      submittedDocuments?: SubmittedDocument[];
    };

    if (!payload.password?.trim() || !payload.submitterName?.trim() || !Array.isArray(payload.submittedDocuments) || payload.submittedDocuments.length === 0) {
      return NextResponse.json({ error: 'Password, submitter name, and uploaded documents are required' }, { status: 400 });
    }

    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (entry.sharePassword !== payload.password.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Valid document password is required' }, { status: 403 });
    }
    if (!entry.requiredDocumentWorkflowEnabled) {
      return NextResponse.json({ error: 'Required-document workflow is not enabled for this document' }, { status: 400 });
    }

    const uploadedAt = new Date().toISOString();
    const submittedDocuments = payload.submittedDocuments.map((document, index) => ({
      id: document.id || `submission-${Date.now()}-${index}`,
      label: document.label,
      fileName: document.fileName,
      mimeType: document.mimeType,
      dataUrl: document.dataUrl,
      uploadedAt,
    }));

    const updated = await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      submittedDocuments,
      documentsSubmittedAt: uploadedAt,
      documentsSubmittedBy: payload.submitterName?.trim(),
      documentsVerificationStatus: 'pending',
      documentsVerifiedAt: undefined,
      documentsVerifiedBy: undefined,
      documentsVerificationNotes: undefined,
      accessEvents: [
        createAccessEvent({
          eventType: 'upload',
          createdAt: uploadedAt,
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
          actorName: payload.submitterName?.trim(),
        }),
        ...(current.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [...(current.automationNotes || []), 'Required documents submitted for verification'],
    }));

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to submit required documents' }, { status: 500 });
  }
}
