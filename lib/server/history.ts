import { DocumentAccessEvent, DocumentHistory, EmailLogEntry } from '@/types/document';
import { DEFAULT_DOCUMENT_DESIGN_PRESET, isDocumentDesignPreset } from '@/lib/document-designs';
import { normalizeDocSheetWorkbook } from '@/lib/docsheet';
import { defaultBackgroundVerificationDocuments, deriveOnboardingProgress, deriveOnboardingStage, isOnboardingTemplate } from '@/lib/server/onboarding';
import { getHistoryEntriesFromRepository, saveHistoryEntriesToRepository } from '@/lib/server/repositories';
import { getDbPool } from '@/lib/server/database';
import {
  reconcileHistoryRows,
  deleteHistoryRow,
  selectAllHistoryRows,
  selectHistoryRowById,
  upsertHistoryRow,
} from '@/lib/server/db/history-rows';

type HistoryInput = Partial<DocumentHistory> & {
  documentType?: string;
};

export function generateReferenceNumber(templateName: string, generatedAt: string) {
  const prefix = templateName
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 4) || 'DOC';
  const date = generatedAt.slice(0, 10).replace(/-/g, '');
  const suffix = Date.now().toString().slice(-5);
  return `DCR-${prefix}-${date}-${suffix}`;
}

export function generateSharePassword() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function normalizeHistoryEntry(entry: HistoryInput): DocumentHistory {
  const generatedAt = entry.generatedAt || new Date().toISOString();
  const shareId = entry.shareId || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const shareRequiresPassword = entry.shareRequiresPassword !== false;
  const onboardingRequired = entry.onboardingRequired ?? isOnboardingTemplate(entry.templateId || entry.documentType, entry.category);
  const backgroundVerificationRequired = entry.backgroundVerificationRequired ?? onboardingRequired;
  const normalizedSubmittedDocuments = Array.isArray(entry.submittedDocuments) ? entry.submittedDocuments.map((document) => ({
    id: String(document.id || `submission-${Date.now()}`),
    label: String(document.label || 'Supporting Document'),
    fileName: String(document.fileName || 'document'),
    mimeType: String(document.mimeType || 'application/octet-stream'),
    dataUrl: String(document.dataUrl || ''),
    uploadedAt: String(document.uploadedAt || new Date().toISOString()),
  })) : [];
  const requiredDocuments = Array.isArray(entry.requiredDocuments) ? entry.requiredDocuments.map(String).filter(Boolean) : (backgroundVerificationRequired ? defaultBackgroundVerificationDocuments : []);
  const backgroundVerificationStatus =
    entry.backgroundVerificationStatus
    || (backgroundVerificationRequired ? (normalizedSubmittedDocuments.length ? 'submitted' : 'not_started') : 'not_started');
  const onboardingCredentials = entry.onboardingCredentials && typeof entry.onboardingCredentials === 'object'
    ? {
        email: String(entry.onboardingCredentials.email || entry.employeeEmail || entry.clientEmail || ''),
        temporaryPassword: String(entry.onboardingCredentials.temporaryPassword || ''),
        generatedAt: String(entry.onboardingCredentials.generatedAt || generatedAt),
        lastSharedAt: entry.onboardingCredentials.lastSharedAt ? String(entry.onboardingCredentials.lastSharedAt) : undefined,
      }
    : undefined;
  const employeeQuestions = Array.isArray(entry.employeeQuestions) ? entry.employeeQuestions.map((question, index) => ({
    id: String(question.id || `question-${Date.now()}-${index}`),
    question: String(question.question || ''),
    askedAt: String(question.askedAt || generatedAt),
    askedBy: String(question.askedBy || entry.employeeEmail || entry.clientEmail || 'employee'),
    reply: question.reply ? String(question.reply) : undefined,
    repliedAt: question.repliedAt ? String(question.repliedAt) : undefined,
    repliedBy: question.repliedBy ? String(question.repliedBy) : undefined,
    status: question.status === 'resolved' ? ('resolved' as const) : ('open' as const),
  })) : [];

  const normalizeRecipientSignaturePlacements = (raw: any): DocumentHistory['recipientSignaturePlacements'] => {
    if (!raw || typeof raw !== 'object') return undefined;
    if (raw.mode === 'boxes') {
      const boxes = Array.isArray(raw.boxes) ? raw.boxes : [];
      const normalizedBoxes = boxes
        .filter((b: any) => b && typeof b === 'object')
        .map((b: any, idx: number) => ({
          id: String(b.id || `sigbox-${Date.now()}-${idx}`),
          page: Math.max(1, Math.floor(Number(b.page) || 1)),
          xPct: Math.min(1, Math.max(0, Number(b.xPct) || 0)),
          yPct: Math.min(1, Math.max(0, Number(b.yPct) || 0)),
          widthPct: Math.min(1, Math.max(0, Number(b.widthPct) || 0)),
          heightPct: Math.min(1, Math.max(0, Number(b.heightPct) || 0)),
          label: b.label ? String(b.label).slice(0, 64) : undefined,
          signerKey: b.signerKey ? String(b.signerKey).slice(0, 64) : undefined,
          required: b.required === false ? false : true,
          pdfX: Number.isFinite(Number(b.pdfX)) ? Number(b.pdfX) : undefined,
          pdfY: Number.isFinite(Number(b.pdfY)) ? Number(b.pdfY) : undefined,
          pdfW: Number.isFinite(Number(b.pdfW)) ? Number(b.pdfW) : undefined,
          pdfH: Number.isFinite(Number(b.pdfH)) ? Number(b.pdfH) : undefined,
        }))
        .filter((b: any) => b.widthPct > 0 && b.heightPct > 0);
      return normalizedBoxes.length ? { mode: 'boxes', version: 1, boxes: normalizedBoxes } : undefined;
    }
    if (raw.mode === 'last' || raw.mode === 'all' || raw.mode === 'pages') {
      const pages = Array.isArray(raw.pages) ? raw.pages.map((p: any) => Math.max(1, Math.floor(Number(p) || 0))).filter(Boolean) : undefined;
      const position = raw.position;
      return {
        mode: raw.mode,
        pages: raw.mode === 'pages' ? (pages && pages.length ? pages : undefined) : undefined,
        position: position,
        sizePct: typeof raw.sizePct === 'number' ? raw.sizePct : undefined,
        marginPct: typeof raw.marginPct === 'number' ? raw.marginPct : undefined,
      } as any;
    }
    return undefined;
  };
  return {
    id: entry.id || Date.now().toString(),
    shareId,
    shareUrl: entry.shareUrl || `/documents/${shareId}`,
    referenceNumber: entry.referenceNumber || generateReferenceNumber(entry.templateName || entry.documentType || 'Document', generatedAt),
    documentSourceType: entry.documentSourceType === 'uploaded_pdf' ? 'uploaded_pdf' : 'generated',
    templateId: entry.templateId || entry.documentType || 'unknown-template',
    templateName: entry.templateName || entry.documentType || 'Untitled Document',
    category: entry.category || 'General',
    data: entry.data && typeof entry.data === 'object' ? Object.fromEntries(Object.entries(entry.data).map(([key, value]) => [key, String(value ?? '')])) : {},
    generatedBy: entry.generatedBy || 'unknown',
    generatedAt,
    previewHtml: entry.previewHtml,
    pdfUrl: entry.pdfUrl,
    uploadedPdfFileName: entry.uploadedPdfFileName ? String(entry.uploadedPdfFileName) : undefined,
    uploadedPdfMimeType: entry.uploadedPdfMimeType ? String(entry.uploadedPdfMimeType) : undefined,
    uploadedPdfDataUrl: entry.uploadedPdfDataUrl ? String(entry.uploadedPdfDataUrl) : undefined,
    signedPdfFileName: entry.signedPdfFileName ? String(entry.signedPdfFileName) : undefined,
    signedPdfDataUrl: entry.signedPdfDataUrl ? String(entry.signedPdfDataUrl) : undefined,
    emailSent: Boolean(entry.emailSent),
    emailTo: entry.emailTo,
    emailSubject: entry.emailSubject,
    emailSentAt: entry.emailSentAt,
    emailStatus: entry.emailStatus || (entry.emailSent ? 'sent' : 'pending'),
    emailError: entry.emailError,
    deliveryHistory: Array.isArray(entry.deliveryHistory) ? entry.deliveryHistory : [],
    automationNotes: Array.isArray(entry.automationNotes) ? entry.automationNotes.map(String) : [],
    signatureId: entry.signatureId,
    signatureName: entry.signatureName,
    signatureRole: entry.signatureRole,
    signatureSignedAt: entry.signatureSignedAt,
    signatureSignedIp: entry.signatureSignedIp,
    sharePassword: shareRequiresPassword ? (entry.sharePassword || generateSharePassword()) : undefined,
    shareRequiresPassword,
    shareAccessPolicy: entry.shareAccessPolicy === 'expiring' || entry.shareAccessPolicy === 'one_time' ? entry.shareAccessPolicy : 'standard',
    shareExpiresAt: entry.shareExpiresAt ? String(entry.shareExpiresAt) : undefined,
    maxAccessCount: typeof entry.maxAccessCount === 'number' ? entry.maxAccessCount : undefined,
    revokedAt: entry.revokedAt ? String(entry.revokedAt) : undefined,
    requiredDocumentWorkflowEnabled: entry.requiredDocumentWorkflowEnabled ?? backgroundVerificationRequired,
    requiredDocuments,
    submittedDocuments: normalizedSubmittedDocuments,
    documentsSubmittedAt: entry.documentsSubmittedAt,
    documentsSubmittedBy: entry.documentsSubmittedBy,
    documentsVerificationStatus: entry.documentsVerificationStatus || (entry.requiredDocumentWorkflowEnabled ? 'pending' : 'not_required'),
    documentsVerifiedAt: entry.documentsVerifiedAt,
    documentsVerifiedBy: entry.documentsVerifiedBy,
    documentsVerificationNotes: entry.documentsVerificationNotes,
    recipientSignatureRequired: entry.recipientSignatureRequired ?? true,
    recipientAccess: entry.recipientAccess || 'comment',
    recipientSignaturePlacements: normalizeRecipientSignaturePlacements((entry as any).recipientSignaturePlacements),
    dataCollectionEnabled: Boolean(entry.dataCollectionEnabled),
    dataCollectionStatus: entry.dataCollectionEnabled
      ? (entry.dataCollectionStatus === 'submitted' || entry.dataCollectionStatus === 'changes_requested' || entry.dataCollectionStatus === 'reviewed' || entry.dataCollectionStatus === 'finalized' ? entry.dataCollectionStatus : 'sent')
      : 'disabled',
    dataCollectionInstructions: entry.dataCollectionInstructions ? String(entry.dataCollectionInstructions) : undefined,
    dataCollectionSubmittedAt: entry.dataCollectionSubmittedAt ? String(entry.dataCollectionSubmittedAt) : undefined,
    dataCollectionSubmittedBy: entry.dataCollectionSubmittedBy ? String(entry.dataCollectionSubmittedBy) : undefined,
    dataCollectionSubmissions: Array.isArray(entry.dataCollectionSubmissions)
      ? entry.dataCollectionSubmissions.map((submission, index) => ({
          id: String(submission.id || `submission-${Date.now()}-${index}`),
          submittedAt: String(submission.submittedAt || new Date().toISOString()),
          submittedBy: String(submission.submittedBy || 'Recipient'),
          data: submission.data && typeof submission.data === 'object'
            ? Object.fromEntries(Object.entries(submission.data).map(([key, value]) => [key, String(value ?? '')]))
            : {},
        }))
      : [],
    dataCollectionReviewNotes: entry.dataCollectionReviewNotes ? String(entry.dataCollectionReviewNotes) : undefined,
    dataCollectionReviewedAt: entry.dataCollectionReviewedAt ? String(entry.dataCollectionReviewedAt) : undefined,
    dataCollectionReviewedBy: entry.dataCollectionReviewedBy ? String(entry.dataCollectionReviewedBy) : undefined,
    recipientSignerName: entry.recipientSignerName,
    recipientSignatureDataUrl: entry.recipientSignatureDataUrl,
    recipientSignatureSource: entry.recipientSignatureSource === 'uploaded' ? 'uploaded' : entry.recipientSignatureSource === 'drawn' ? 'drawn' : undefined,
    recipientSignedAt: entry.recipientSignedAt,
    recipientSignedIp: entry.recipientSignedIp,
    recipientPhotoDataUrl: entry.recipientPhotoDataUrl ? String(entry.recipientPhotoDataUrl) : undefined,
    recipientPhotoCapturedAt: entry.recipientPhotoCapturedAt ? String(entry.recipientPhotoCapturedAt) : undefined,
    recipientPhotoCapturedIp: entry.recipientPhotoCapturedIp ? String(entry.recipientPhotoCapturedIp) : undefined,
    recipientPhotoCaptureMethod: entry.recipientPhotoCaptureMethod === 'live_camera' ? 'live_camera' : undefined,
    recipientAadhaarVerificationRequired: entry.recipientAadhaarVerificationRequired ?? undefined,
    recipientAadhaarVerifiedAt: entry.recipientAadhaarVerifiedAt ? String(entry.recipientAadhaarVerifiedAt) : undefined,
    recipientAadhaarVerifiedIp: entry.recipientAadhaarVerifiedIp ? String(entry.recipientAadhaarVerifiedIp) : undefined,
    recipientAadhaarReferenceId: entry.recipientAadhaarReferenceId ? String(entry.recipientAadhaarReferenceId) : undefined,
    recipientAadhaarMaskedId: entry.recipientAadhaarMaskedId ? String(entry.recipientAadhaarMaskedId) : undefined,
    recipientAadhaarVerificationMode: entry.recipientAadhaarVerificationMode === 'otp' ? 'otp' : undefined,
    recipientAadhaarProviderLabel: entry.recipientAadhaarProviderLabel ? String(entry.recipientAadhaarProviderLabel) : undefined,
    pendingRecipientPhotoDataUrl: entry.pendingRecipientPhotoDataUrl ? String(entry.pendingRecipientPhotoDataUrl) : undefined,
    pendingRecipientPhotoCapturedAt: entry.pendingRecipientPhotoCapturedAt ? String(entry.pendingRecipientPhotoCapturedAt) : undefined,
    pendingRecipientPhotoCapturedIp: entry.pendingRecipientPhotoCapturedIp ? String(entry.pendingRecipientPhotoCapturedIp) : undefined,
    pendingRecipientPhotoCaptureToken: entry.pendingRecipientPhotoCaptureToken ? String(entry.pendingRecipientPhotoCaptureToken) : undefined,
    pendingRecipientAadhaarTransactionId: entry.pendingRecipientAadhaarTransactionId ? String(entry.pendingRecipientAadhaarTransactionId) : undefined,
    pendingRecipientAadhaarMaskedId: entry.pendingRecipientAadhaarMaskedId ? String(entry.pendingRecipientAadhaarMaskedId) : undefined,
    pendingRecipientAadhaarRequestedAt: entry.pendingRecipientAadhaarRequestedAt ? String(entry.pendingRecipientAadhaarRequestedAt) : undefined,
    recipientSignedLocationLabel: entry.recipientSignedLocationLabel,
    recipientSignedLatitude: typeof entry.recipientSignedLatitude === 'number' ? entry.recipientSignedLatitude : undefined,
    recipientSignedLongitude: typeof entry.recipientSignedLongitude === 'number' ? entry.recipientSignedLongitude : undefined,
    recipientSignedAccuracyMeters: typeof entry.recipientSignedAccuracyMeters === 'number' ? entry.recipientSignedAccuracyMeters : undefined,
    openCount: Number(entry.openCount || 0),
    downloadCount: Number(entry.downloadCount || 0),
    editCount: Number(entry.editCount || 0),
    lastOpenedAt: entry.lastOpenedAt,
    lastDownloadedAt: entry.lastDownloadedAt,
    lastEditedAt: entry.lastEditedAt,
    collaborationComments: Array.isArray(entry.collaborationComments) ? entry.collaborationComments.map((comment) => ({
      id: String(comment.id || `comment-${Date.now()}`),
      type: comment.type === 'review' ? 'review' : 'comment',
      message: String(comment.message || ''),
      authorName: String(comment.authorName || 'Anonymous'),
      createdAt: String(comment.createdAt || new Date().toISOString()),
      createdIp: comment.createdIp ? String(comment.createdIp) : undefined,
      replyMessage: comment.replyMessage ? String(comment.replyMessage) : undefined,
      repliedAt: comment.repliedAt ? String(comment.repliedAt) : undefined,
      repliedBy: comment.repliedBy ? String(comment.repliedBy) : undefined,
    })) : [],
    accessEvents: Array.isArray(entry.accessEvents) ? entry.accessEvents.map((event) => ({
      id: String(event.id || `evt-${Date.now()}`),
      eventType: normalizeEventType(event.eventType),
      createdAt: String(event.createdAt || new Date().toISOString()),
      ip: event.ip ? String(event.ip) : undefined,
      userAgent: event.userAgent ? String(event.userAgent) : undefined,
      deviceLabel: event.deviceLabel ? String(event.deviceLabel) : undefined,
      actorName: event.actorName ? String(event.actorName) : undefined,
    })) : [],
    recipientSignerEmail: entry.recipientSignerEmail ? String(entry.recipientSignerEmail).toLowerCase() : undefined,
    recipientSigners: Array.isArray(entry.recipientSigners)
      ? entry.recipientSigners
          .filter((item) => item && typeof item === 'object')
          .map((item: any, index: number) => ({
            signerKey: String(item.signerKey || `signer-${index + 1}`).slice(0, 64),
            signerName: String(item.signerName || 'Signer').slice(0, 96),
            signerEmail: item.signerEmail ? String(item.signerEmail).toLowerCase() : undefined,
            signingStatus: item.signingStatus === 'signed' ? 'signed' as const : 'pending' as const,
            signedAt: item.signedAt ? String(item.signedAt) : undefined,
            signedIp: item.signedIp ? String(item.signedIp) : undefined,
            signedLocationLabel: item.signedLocationLabel ? String(item.signedLocationLabel) : undefined,
            signedLatitude: typeof item.signedLatitude === 'number' ? item.signedLatitude : undefined,
            signedLongitude: typeof item.signedLongitude === 'number' ? item.signedLongitude : undefined,
            signedAccuracyMeters: typeof item.signedAccuracyMeters === 'number' ? item.signedAccuracyMeters : undefined,
            authenticationMethods: Array.isArray(item.authenticationMethods) ? item.authenticationMethods.map(String).slice(0, 20) : undefined,
            photoDataUrl: item.photoDataUrl ? String(item.photoDataUrl) : undefined,
            photoCapturedAt: item.photoCapturedAt ? String(item.photoCapturedAt) : undefined,
            photoCapturedIp: item.photoCapturedIp ? String(item.photoCapturedIp) : undefined,
            photoCaptureMethod: item.photoCaptureMethod === 'live_camera' ? 'live_camera' as const : undefined,
            consentedAt: item.consentedAt ? String(item.consentedAt) : undefined,
            consentText: item.consentText ? String(item.consentText).slice(0, 2400) : undefined,
            signatureSource: item.signatureSource === 'uploaded' ? 'uploaded' as const : item.signatureSource === 'drawn' ? 'drawn' as const : undefined,
            signatureDataUrl: item.signatureDataUrl ? String(item.signatureDataUrl) : undefined,
            signatureBoxSummary: item.signatureBoxSummary && typeof item.signatureBoxSummary === 'object'
              ? {
                  totalBoxes: Math.max(0, Number((item.signatureBoxSummary as any).totalBoxes || 0)),
                  requiredBoxes: Math.max(0, Number((item.signatureBoxSummary as any).requiredBoxes || 0)),
                  completedBoxes: Math.max(0, Number((item.signatureBoxSummary as any).completedBoxes || 0)),
                  missingRequiredBoxIds: Array.isArray((item.signatureBoxSummary as any).missingRequiredBoxIds)
                    ? (item.signatureBoxSummary as any).missingRequiredBoxIds.map(String).slice(0, 200)
                    : undefined,
                }
              : undefined,
          }))
      : [],
    recipientSignatureBoxesById: entry.recipientSignatureBoxesById && typeof entry.recipientSignatureBoxesById === 'object'
      ? Object.fromEntries(Object.entries(entry.recipientSignatureBoxesById as Record<string, any>).slice(0, 500).map(([k, v]) => [String(k).slice(0, 96), String(v || '')]))
      : undefined,
    pendingRecipientEvidenceBySignerKey: entry.pendingRecipientEvidenceBySignerKey && typeof entry.pendingRecipientEvidenceBySignerKey === 'object'
      ? Object.fromEntries(
          Object.entries(entry.pendingRecipientEvidenceBySignerKey as Record<string, any>)
            .slice(0, 50)
            .map(([signerKey, raw]) => [
              String(signerKey).slice(0, 64),
              {
                photoDataUrl: String(raw?.photoDataUrl || ''),
                capturedAt: String(raw?.capturedAt || new Date().toISOString()),
                capturedIp: String(raw?.capturedIp || 'unknown'),
                captureToken: String(raw?.captureToken || `photo-${Date.now()}`),
              },
            ]),
        )
      : undefined,
    recipientSignerConfigsByKey: entry.recipientSignerConfigsByKey && typeof entry.recipientSignerConfigsByKey === 'object'
      ? Object.fromEntries(
          Object.entries(entry.recipientSignerConfigsByKey as Record<string, any>)
            .slice(0, 50)
            .map(([signerKey, raw]) => [
              String(signerKey).slice(0, 64),
              {
                cameraCaptureEnabled: raw?.cameraCaptureEnabled === false ? false : true,
                signatureDrawEnabled: raw?.signatureDrawEnabled === false ? false : true,
                signatureUploadEnabled: raw?.signatureUploadEnabled === false ? false : true,
                signatureTypedEnabled: raw?.signatureTypedEnabled === true ? true : false,
                initialsEnabled: raw?.initialsEnabled === true ? true : false,
                emailOtpEnabled: raw?.emailOtpEnabled === true ? true : false,
                consentRequired: raw?.consentRequired === false ? false : true,
                captureIpDeviceLocationEnabled: raw?.captureIpDeviceLocationEnabled === false ? false : true,
              },
            ]),
        )
      : undefined,
    recipientSigningMode: entry.recipientSigningMode === 'sequential' ? 'sequential' : entry.recipientSigningMode === 'parallel' ? 'parallel' : undefined,
    recipientSignerDirectory: entry.recipientSignerDirectory && typeof entry.recipientSignerDirectory === 'object'
      ? Object.fromEntries(
          Object.entries(entry.recipientSignerDirectory as Record<string, any>)
            .slice(0, 50)
            .map(([signerKey, raw]) => [
              String(signerKey).slice(0, 64),
              {
                signerKey: String(raw?.signerKey || signerKey).slice(0, 64),
                signerName: String(raw?.signerName || 'Signer').slice(0, 96),
                signerEmail: raw?.signerEmail ? String(raw.signerEmail).toLowerCase() : undefined,
                signerRole: raw?.signerRole ? String(raw.signerRole).slice(0, 64) : undefined,
                signingOrder: typeof raw?.signingOrder === 'number' ? Math.max(1, Math.floor(raw.signingOrder)) : undefined,
              },
            ]),
        )
      : undefined,
    recipientSignerInvitesByKey: entry.recipientSignerInvitesByKey && typeof entry.recipientSignerInvitesByKey === 'object'
      ? Object.fromEntries(
          Object.entries(entry.recipientSignerInvitesByKey as Record<string, any>)
            .slice(0, 50)
            .map(([signerKey, raw]) => [
              String(signerKey).slice(0, 64),
              {
                token: String(raw?.token || '').slice(0, 256),
                createdAt: String(raw?.createdAt || new Date().toISOString()),
                expiresAt: String(raw?.expiresAt || new Date().toISOString()),
                sentAt: raw?.sentAt ? String(raw.sentAt) : undefined,
                lastSentAt: raw?.lastSentAt ? String(raw.lastSentAt) : undefined,
                sendCount: Math.max(0, Number(raw?.sendCount || 0)),
                lastReminderAt: raw?.lastReminderAt ? String(raw.lastReminderAt) : undefined,
                reminderCount: Math.max(0, Number(raw?.reminderCount || 0)),
              },
            ]),
        )
      : undefined,
    recipientReminderHistory: Array.isArray(entry.recipientReminderHistory)
      ? entry.recipientReminderHistory
          .slice(0, 200)
          .map((raw: any, index: number) => ({
            id: String(raw?.id || `rem-${Date.now()}-${index}`),
            sentAt: String(raw?.sentAt || new Date().toISOString()),
            sentBy: String(raw?.sentBy || entry.generatedBy || 'system'),
            signerKey: raw?.signerKey ? String(raw.signerKey).slice(0, 64) : undefined,
            toEmail: String(raw?.toEmail || '').toLowerCase(),
            status: raw?.status === 'sent' ? 'sent' as const : raw?.status === 'failed' ? 'failed' as const : 'queued' as const,
            error: raw?.error ? String(raw.error).slice(0, 400) : undefined,
          }))
      : [],
    recipientSignatureBoxSummary: entry.recipientSignatureBoxSummary && typeof entry.recipientSignatureBoxSummary === 'object'
      ? {
          totalBoxes: Math.max(0, Number((entry.recipientSignatureBoxSummary as any).totalBoxes || 0)),
          requiredBoxes: Math.max(0, Number((entry.recipientSignatureBoxSummary as any).requiredBoxes || 0)),
          completedBoxes: Math.max(0, Number((entry.recipientSignatureBoxSummary as any).completedBoxes || 0)),
          missingRequiredBoxIds: Array.isArray((entry.recipientSignatureBoxSummary as any).missingRequiredBoxIds)
            ? (entry.recipientSignatureBoxSummary as any).missingRequiredBoxIds.map(String).slice(0, 200)
            : undefined,
        }
      : undefined,
    recipientConsentedAt: entry.recipientConsentedAt ? String(entry.recipientConsentedAt) : undefined,
    recipientConsentText: entry.recipientConsentText ? String(entry.recipientConsentText).slice(0, 2400) : undefined,
    editorState: entry.editorState && typeof entry.editorState === 'object'
      ? {
          title: entry.editorState.title ? String(entry.editorState.title) : undefined,
          lifecycleStage: entry.editorState.lifecycleStage === 'internal_review' || entry.editorState.lifecycleStage === 'approved' || entry.editorState.lifecycleStage === 'published' || entry.editorState.lifecycleStage === 'archived' ? entry.editorState.lifecycleStage : 'draft',
          documentStatus: entry.editorState.documentStatus === 'on_hold' || entry.editorState.documentStatus === 'expired' || entry.editorState.documentStatus === 'superseded' ? entry.editorState.documentStatus : 'active',
          department: entry.editorState.department ? String(entry.editorState.department) : undefined,
          owner: entry.editorState.owner ? String(entry.editorState.owner) : undefined,
          reviewer: entry.editorState.reviewer ? String(entry.editorState.reviewer) : undefined,
          classification: entry.editorState.classification === 'public' || entry.editorState.classification === 'confidential' || entry.editorState.classification === 'restricted' ? entry.editorState.classification : 'internal',
          versionLabel: entry.editorState.versionLabel ? String(entry.editorState.versionLabel) : undefined,
          effectiveDate: entry.editorState.effectiveDate ? String(entry.editorState.effectiveDate) : undefined,
          expiryDate: entry.editorState.expiryDate ? String(entry.editorState.expiryDate) : undefined,
          tags: Array.isArray(entry.editorState.tags) ? entry.editorState.tags.map(String).filter(Boolean) : [],
          complianceNotes: entry.editorState.complianceNotes ? String(entry.editorState.complianceNotes) : undefined,
          internalSummary: entry.editorState.internalSummary ? String(entry.editorState.internalSummary) : undefined,
          clauseLibrary: Array.isArray(entry.editorState.clauseLibrary) ? entry.editorState.clauseLibrary.map(String).filter(Boolean) : [],
          layoutPreset: entry.editorState.layoutPreset === 'executive' || entry.editorState.layoutPreset === 'legal' || entry.editorState.layoutPreset === 'hr' || entry.editorState.layoutPreset === 'client-ready' ? entry.editorState.layoutPreset : 'formal',
          designPreset: isDocumentDesignPreset(entry.editorState.designPreset) ? entry.editorState.designPreset : DEFAULT_DOCUMENT_DESIGN_PRESET,
          watermarkLabel: entry.editorState.watermarkLabel ? String(entry.editorState.watermarkLabel) : undefined,
          signatureCertificateBrandingEnabled: entry.editorState.signatureCertificateBrandingEnabled === false ? false : true,
          signatureReceiptCompletionPageEnabled: entry.editorState.signatureReceiptCompletionPageEnabled === false ? false : true,
          letterheadMode: entry.editorState.letterheadMode === 'image' || entry.editorState.letterheadMode === 'html' ? entry.editorState.letterheadMode : 'default',
          letterheadImageDataUrl: entry.editorState.letterheadImageDataUrl ? String(entry.editorState.letterheadImageDataUrl) : undefined,
          letterheadHtml: entry.editorState.letterheadHtml ? String(entry.editorState.letterheadHtml) : undefined,
        }
      : {
          title: entry.templateName || entry.documentType || 'Untitled Document',
          lifecycleStage: 'draft',
          documentStatus: 'active',
          classification: 'internal',
          tags: [],
          clauseLibrary: [],
          layoutPreset: 'formal',
          designPreset: DEFAULT_DOCUMENT_DESIGN_PRESET,
          signatureCertificateBrandingEnabled: true,
          signatureReceiptCompletionPageEnabled: true,
          letterheadMode: 'default',
        },
    managedFiles: Array.isArray(entry.managedFiles) ? entry.managedFiles.map((file) => ({
      id: String(file.id || `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      name: String(file.name || 'untitled-file'),
      category: file.category === 'supporting' || file.category === 'policy' || file.category === 'media' || file.category === 'appendix' ? file.category : 'attachment',
      mimeType: String(file.mimeType || 'application/octet-stream'),
      dataUrl: String(file.dataUrl || ''),
      sizeInBytes: Number(file.sizeInBytes || 0),
      uploadedAt: String(file.uploadedAt || new Date().toISOString()),
      uploadedBy: String(file.uploadedBy || entry.generatedBy || 'system'),
      notes: file.notes ? String(file.notes) : undefined,
    })) : [],
    clientName: entry.clientName ? String(entry.clientName) : undefined,
    clientEmail: entry.clientEmail ? String(entry.clientEmail).toLowerCase() : undefined,
    clientOrganization: entry.clientOrganization ? String(entry.clientOrganization) : undefined,
    folderLabel: entry.folderLabel ? String(entry.folderLabel) : undefined,
    organizationId: entry.organizationId ? String(entry.organizationId) : undefined,
    organizationName: entry.organizationName ? String(entry.organizationName) : undefined,
    versionSnapshots: Array.isArray(entry.versionSnapshots) ? entry.versionSnapshots.map((snapshot, index) => ({
      id: String(snapshot.id || `version-${Date.now()}-${index}`),
      versionLabel: String(snapshot.versionLabel || `v${index + 1}`),
      createdAt: String(snapshot.createdAt || new Date().toISOString()),
      createdBy: String(snapshot.createdBy || entry.generatedBy || 'system'),
      summary: snapshot.summary ? String(snapshot.summary) : undefined,
      previewHtml: snapshot.previewHtml ? String(snapshot.previewHtml) : undefined,
    })) : [],
    employeeName: entry.employeeName ? String(entry.employeeName) : (entry.clientName ? String(entry.clientName) : undefined),
    employeeEmail: entry.employeeEmail ? String(entry.employeeEmail).toLowerCase() : (entry.clientEmail ? String(entry.clientEmail).toLowerCase() : undefined),
    employeeDepartment: entry.employeeDepartment ? String(entry.employeeDepartment) : undefined,
    employeeDesignation: entry.employeeDesignation ? String(entry.employeeDesignation) : undefined,
    employeeCode: entry.employeeCode ? String(entry.employeeCode) : undefined,
    onboardingRequired,
    backgroundVerificationRequired,
    backgroundVerificationStatus,
    backgroundVerificationNotes: entry.backgroundVerificationNotes ? String(entry.backgroundVerificationNotes) : undefined,
    backgroundVerificationVerifiedAt: entry.backgroundVerificationVerifiedAt ? String(entry.backgroundVerificationVerifiedAt) : undefined,
    backgroundVerificationVerifiedBy: entry.backgroundVerificationVerifiedBy ? String(entry.backgroundVerificationVerifiedBy) : undefined,
    backgroundVerificationProfile: entry.backgroundVerificationProfile && typeof entry.backgroundVerificationProfile === 'object'
      ? {
          ...entry.backgroundVerificationProfile,
          lastUpdatedAt: entry.backgroundVerificationProfile.lastUpdatedAt ? String(entry.backgroundVerificationProfile.lastUpdatedAt) : undefined,
        }
      : undefined,
    onboardingCredentials,
    employeeQuestions,
    onboardingStage: entry.onboardingStage || deriveOnboardingStage({
      ...entry,
      submittedDocuments: normalizedSubmittedDocuments,
      backgroundVerificationStatus,
      onboardingCredentials,
      recipientSignedAt: entry.recipientSignedAt,
    }),
    onboardingProgress: typeof entry.onboardingProgress === 'number' ? entry.onboardingProgress : deriveOnboardingProgress({
      ...entry,
      submittedDocuments: normalizedSubmittedDocuments,
      backgroundVerificationStatus,
      onboardingCredentials,
      recipientSignedAt: entry.recipientSignedAt,
    }),
    docsheetWorkbook: entry.docsheetWorkbook ? normalizeDocSheetWorkbook(entry.docsheetWorkbook) : undefined,
  };
}

function normalizeEventType(value: unknown): DocumentAccessEvent['eventType'] {
  switch (value) {
    case 'open':
    case 'download':
    case 'edit':
    case 'comment':
    case 'review':
    case 'sign':
    case 'upload':
    case 'verify':
    case 'camera_capture':
    case 'email':
      return value;
    default:
      return 'open';
  }
}

export function createAccessEvent(input: Omit<DocumentAccessEvent, 'id'>): DocumentAccessEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
  };
}

export async function getHistoryEntries() {
  if (getDbPool()) {
    const rows = await selectAllHistoryRows();
    return rows.map(normalizeHistoryEntry);
  }
  const history = await getHistoryEntriesFromRepository();
  return history.map(normalizeHistoryEntry);
}

/** Single-entry lookup by id or shareId — O(1) indexed in DB mode, avoids full-table scan. */
export async function getHistoryEntryById(idOrShareId: string): Promise<DocumentHistory | null> {
  if (getDbPool()) {
    const row = await selectHistoryRowById(idOrShareId);
    return row ? normalizeHistoryEntry(row) : null;
  }
  const entries = await getHistoryEntries();
  return entries.find((e) => e.id === idOrShareId || e.shareId === idOrShareId) ?? null;
}

export async function saveHistoryEntries(entries: DocumentHistory[]) {
  if (getDbPool()) {
    await reconcileHistoryRows(entries);
    return;
  }
  await saveHistoryEntriesToRepository(entries);
}

export async function appendHistoryEntry(entry: HistoryInput) {
  const normalized = normalizeHistoryEntry(entry);
  if (getDbPool()) {
    await upsertHistoryRow(normalized);
    return normalized;
  }
  const entries = await getHistoryEntries();
  entries.push(normalized);
  await saveHistoryEntries(entries);
  return normalized;
}

export async function updateHistoryEntry(id: string, updater: (entry: DocumentHistory) => DocumentHistory) {
  if (getDbPool()) {
    const existing = await selectHistoryRowById(id);
    if (!existing) return null;
    const next = normalizeHistoryEntry(updater(normalizeHistoryEntry(existing)));
    await upsertHistoryRow(next);
    return next;
  }
  const entries = await getHistoryEntries();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return null;
  }
  entries[index] = normalizeHistoryEntry(updater(entries[index]));
  await saveHistoryEntries(entries);
  return entries[index];
}

export async function deleteHistoryEntry(id: string) {
  if (getDbPool()) {
    return deleteHistoryRow(id);
  }
  const entries = await getHistoryEntries();
  const nextEntries = entries.filter((entry) => entry.id !== id);
  if (nextEntries.length === entries.length) {
    return false;
  }
  await saveHistoryEntries(nextEntries);
  return true;
}

export function createEmailLogEntry(input: Omit<EmailLogEntry, 'id'>): EmailLogEntry {
  return {
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
  };
}
