import { NextRequest, NextResponse } from 'next/server';
import { documentTemplates } from '@/data/templates';
import { createAccessEvent, getHistoryEntries, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { renderDocumentTemplate } from '@/lib/template';
import { getCustomTemplatesFromRepository } from '@/lib/server/repositories';
import { getSignatureSettings } from '@/lib/server/settings';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';
import { buildDocSheetPreviewHtml, normalizeDocSheetWorkbook } from '@/lib/docsheet';
import { getAadhaarRuntimeConfig } from '@/lib/server/aadhaar';

export const dynamic = 'force-dynamic';

function getShareAccessError(entry: Awaited<ReturnType<typeof getHistoryEntries>>[number]) {
  if (entry.revokedAt) return 'This shared link has been revoked.';
  if (entry.shareExpiresAt && new Date(entry.shareExpiresAt).getTime() < Date.now()) return 'This shared link has expired.';
  const totalAccesses = (entry.openCount || 0) + (entry.downloadCount || 0);
  const maxAllowed = typeof entry.maxAccessCount === 'number'
    ? entry.maxAccessCount
    : (entry.shareAccessPolicy === 'one_time' ? 1 : null);
  if (maxAllowed && totalAccesses >= maxAllowed) {
    return maxAllowed === 1 ? 'This one-time link has already been used.' : 'This shared link has reached its allowed access limit.';
  }
  return null;
}

function resolveTemplatePageOptions(template: any) {
  if (!template?.isCustom) return {};
  const settings = template.renderSettings;
  if (!settings) return {};
  const pageSize = settings.pageSize === 'Custom' ? 'A4' : settings.pageSize;
  return {
    pageSize,
    pageWidthMm: settings.pageSize === 'Custom' ? settings.pageWidthMm : undefined,
    pageHeightMm: settings.pageSize === 'Custom' ? settings.pageHeightMm : undefined,
    pageMarginMm: typeof settings.pageMarginMm === 'number' ? settings.pageMarginMm : undefined,
    pageBackgroundCss: typeof settings.pageBackgroundCss === 'string' ? settings.pageBackgroundCss : undefined,
  };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const entry = await getHistoryEntryById(params.id);
    const aadhaarRuntime = await getAadhaarRuntimeConfig();

    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const customTemplates = await getCustomTemplatesFromRepository();
    const template = [...documentTemplates, ...customTemplates].find((item) => item.id === entry.templateId);
    const uploadedPdfPreviewUrl = entry.signedPdfDataUrl || entry.uploadedPdfDataUrl;
    const requiresPassword = entry.shareRequiresPassword !== false;
    const normalizePassword = (value?: string | null) => String(value || '').trim().toUpperCase();
    const password = normalizePassword(_request.nextUrl.searchParams.get('password'));
    const signingToken = _request.nextUrl.searchParams.get('token')?.trim() || '';

    let tokenSignerKey: string | null = null;
    let tokenValid = false;
    let tokenSignerEmail: string | null = null;
    let tokenSignerName: string | null = null;
    if (signingToken && entry.recipientSignerInvitesByKey && typeof entry.recipientSignerInvitesByKey === 'object') {
      for (const [signerKey, invite] of Object.entries(entry.recipientSignerInvitesByKey)) {
        if (!invite || typeof invite !== 'object') continue;
        if (String((invite as any).token || '') !== signingToken) continue;
        const expiresAt = String((invite as any).expiresAt || '');
        if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
          break;
        }
        tokenSignerKey = String(signerKey).slice(0, 64);
        const inviteEmail = (invite as any).signerEmail ? String((invite as any).signerEmail).trim().toLowerCase() : '';
        const inviteName = (invite as any).signerName ? String((invite as any).signerName).trim() : '';
        const directory = entry.recipientSignerDirectory?.[tokenSignerKey];
        tokenSignerEmail = inviteEmail || (directory?.signerEmail ? String(directory.signerEmail).trim().toLowerCase() : null);
        tokenSignerName = inviteName || (directory?.signerName ? String(directory.signerName).trim() : null);
        tokenValid = true;
        break;
      }
    }

    const passwordValid = tokenValid
      ? true
      : requiresPassword
        ? Boolean(password && normalizePassword(entry.sharePassword) === password)
        : true;
    const accessError = passwordValid ? getShareAccessError(entry) : null;

    if (passwordValid && accessError) {
      return NextResponse.json({ error: accessError, requiresPassword, passwordValidated: false }, { status: 410 });
    }

    if (passwordValid) {
      await updateHistoryEntry(entry.id, (current) => ({
        ...current,
        openCount: (current.openCount || 0) + 1,
        lastOpenedAt: new Date().toISOString(),
        accessEvents: [
          createAccessEvent({
            eventType: 'open',
            createdAt: new Date().toISOString(),
            ip: getRequestIp(_request),
            userAgent: getRequestUserAgent(_request),
            deviceLabel: getDeviceLabel(getRequestUserAgent(_request)),
          }),
          ...(current.accessEvents || []),
        ].slice(0, 50),
      }));
    }

    const signatureSettings = passwordValid ? await getSignatureSettings() : null;
    const adminSignature = passwordValid
      ? (signatureSettings?.signatures.find((item) => item.id === entry.signatureId) || null)
      : null;
    const recipientSignature = passwordValid && entry.recipientSignatureDataUrl
      ? {
          signerName: entry.recipientSignerName || 'Recipient',
          signatureDataUrl: entry.recipientSignatureDataUrl,
          signedAt: entry.recipientSignedAt,
          signedIp: entry.recipientSignedIp,
          signerPhotoDataUrl: entry.recipientPhotoDataUrl,
          signerPhotoCapturedAt: entry.recipientPhotoCapturedAt,
          signerPhotoCapturedIp: entry.recipientPhotoCapturedIp,
          signerPhotoCaptureMethod: entry.recipientPhotoCaptureMethod,
          aadhaarVerifiedAt: entry.recipientAadhaarVerifiedAt,
          aadhaarVerifiedIp: entry.recipientAadhaarVerifiedIp,
          aadhaarReferenceId: entry.recipientAadhaarReferenceId,
          aadhaarMaskedId: entry.recipientAadhaarMaskedId,
          aadhaarVerificationMode: entry.recipientAadhaarVerificationMode,
          aadhaarProviderLabel: entry.recipientAadhaarProviderLabel,
          signedLocationLabel: entry.recipientSignedLocationLabel,
          signedLatitude: entry.recipientSignedLatitude,
          signedLongitude: entry.recipientSignedLongitude,
          signedAccuracyMeters: entry.recipientSignedAccuracyMeters,
        }
      : null;
    const previewHtml = passwordValid
      ? (template
          ? renderDocumentTemplate(template, entry.data || {}, {
              referenceNumber: entry.referenceNumber,
              generatedAt: entry.generatedAt,
              generatedBy: entry.generatedBy,
              renderMode: template.isCustom ? 'plain' : 'platform',
              designPreset: entry.editorState?.designPreset,
              signature: adminSignature,
              recipientSignature,
              watermarkLabel: entry.editorState?.watermarkLabel,
              letterheadMode: entry.editorState?.letterheadMode,
              letterheadImageDataUrl: entry.editorState?.letterheadImageDataUrl,
              letterheadHtml: entry.editorState?.letterheadHtml,
              ...resolveTemplatePageOptions(template),
            })
          : entry.previewHtml)
      : undefined;

    return NextResponse.json({
      requiresPassword,
      passwordValidated: Boolean(passwordValid),
      shareAccessPolicy: entry.shareAccessPolicy || 'standard',
      shareExpiresAt: entry.shareExpiresAt,
      id: entry.id,
      shareId: entry.shareId,
      templateId: entry.templateId,
      templateName: entry.templateName,
      referenceNumber: entry.referenceNumber,
      generatedAt: entry.generatedAt,
      documentSourceType: entry.documentSourceType || 'generated',
      uploadedPdfFileName: passwordValid ? entry.uploadedPdfFileName : undefined,
      uploadedPdfPreviewUrl: passwordValid ? uploadedPdfPreviewUrl : undefined,
      previewHtml,
      templateFields: passwordValid ? template?.fields || [] : [],
      formAppearance: passwordValid ? template?.formAppearance : undefined,
      data: passwordValid ? entry.data : {},
      recipientAccess: passwordValid ? entry.recipientAccess : undefined,
      dataCollectionEnabled: passwordValid ? entry.dataCollectionEnabled : false,
      dataCollectionStatus: passwordValid ? entry.dataCollectionStatus : 'disabled',
      dataCollectionInstructions: passwordValid ? entry.dataCollectionInstructions : undefined,
      dataCollectionSubmittedAt: passwordValid ? entry.dataCollectionSubmittedAt : undefined,
      dataCollectionSubmittedBy: passwordValid ? entry.dataCollectionSubmittedBy : undefined,
      dataCollectionSubmissions: passwordValid ? entry.dataCollectionSubmissions || [] : [],
      dataCollectionReviewNotes: passwordValid ? entry.dataCollectionReviewNotes : undefined,
      dataCollectionReviewedAt: passwordValid ? entry.dataCollectionReviewedAt : undefined,
      dataCollectionReviewedBy: passwordValid ? entry.dataCollectionReviewedBy : undefined,
      requiredDocumentWorkflowEnabled: passwordValid ? entry.requiredDocumentWorkflowEnabled : false,
      requiredDocuments: passwordValid ? entry.requiredDocuments || [] : [],
      submittedDocuments: passwordValid ? entry.submittedDocuments || [] : [],
      documentsVerificationStatus: passwordValid ? entry.documentsVerificationStatus : undefined,
      documentsVerificationNotes: passwordValid ? entry.documentsVerificationNotes : undefined,
      recipientSignatureRequired: entry.recipientSignatureRequired,
      recipientSignaturePlacements: (() => {
        if (!passwordValid) return undefined;
        if (!tokenSignerKey) return entry.recipientSignaturePlacements;
        const placements = entry.recipientSignaturePlacements;
        if (!placements || placements.mode !== 'boxes' || !Array.isArray((placements as any).boxes)) return placements;
        const boxes = (placements as any).boxes.filter((b: any) => String(b?.signerKey || 'recipient').trim() === tokenSignerKey);
        return { ...(placements as any), boxes };
      })(),
      recipientAadhaarVerificationRequired: aadhaarRuntime.enabled,
      aadhaarVerificationConfigured: aadhaarRuntime.configured,
      aadhaarProviderLabel: aadhaarRuntime.providerLabel,
      aadhaarEnvironment: aadhaarRuntime.environment,
      recipientSignerName: passwordValid ? entry.recipientSignerName : undefined,
      recipientSignerEmail: passwordValid ? entry.recipientSignerEmail : undefined,
      recipientSigners: passwordValid ? (entry.recipientSigners || []) : [],
      recipientSignerConfigsByKey: (() => {
        if (!passwordValid) return undefined;
        const cfg = entry.recipientSignerConfigsByKey || {};
        return tokenSignerKey ? { [tokenSignerKey]: cfg[tokenSignerKey] || {} } : cfg;
      })(),
      signingSession: tokenValid ? { signerKey: tokenSignerKey, signerEmail: tokenSignerEmail, signerName: tokenSignerName } : undefined,
      recipientSignedAt: passwordValid ? entry.recipientSignedAt : undefined,
      recipientSignedIp: passwordValid ? entry.recipientSignedIp : undefined,
      recipientSignatureBoxSummary: passwordValid ? entry.recipientSignatureBoxSummary : undefined,
      recipientPhotoDataUrl: passwordValid ? entry.recipientPhotoDataUrl : undefined,
      recipientPhotoCapturedAt: passwordValid ? entry.recipientPhotoCapturedAt : undefined,
      recipientPhotoCapturedIp: passwordValid ? entry.recipientPhotoCapturedIp : undefined,
      recipientPhotoCaptureMethod: passwordValid ? entry.recipientPhotoCaptureMethod : undefined,
      recipientConsentedAt: passwordValid ? entry.recipientConsentedAt : undefined,
      recipientConsentText: passwordValid ? entry.recipientConsentText : undefined,
      signatureReceiptCompletionPageEnabled: passwordValid ? (entry.editorState?.signatureReceiptCompletionPageEnabled ?? true) : undefined,
      recipientAadhaarVerifiedAt: passwordValid ? entry.recipientAadhaarVerifiedAt : undefined,
      recipientAadhaarVerifiedIp: passwordValid ? entry.recipientAadhaarVerifiedIp : undefined,
      recipientAadhaarReferenceId: passwordValid ? entry.recipientAadhaarReferenceId : undefined,
      recipientAadhaarMaskedId: passwordValid ? entry.recipientAadhaarMaskedId : undefined,
      recipientAadhaarVerificationMode: passwordValid ? entry.recipientAadhaarVerificationMode : undefined,
      recipientAadhaarProviderLabel: passwordValid ? entry.recipientAadhaarProviderLabel : undefined,
      recipientSignatureSource: passwordValid ? entry.recipientSignatureSource : undefined,
      recipientSignedLocationLabel: passwordValid ? entry.recipientSignedLocationLabel : undefined,
      recipientSignedLatitude: passwordValid ? entry.recipientSignedLatitude : undefined,
      recipientSignedLongitude: passwordValid ? entry.recipientSignedLongitude : undefined,
      recipientSignedAccuracyMeters: passwordValid ? entry.recipientSignedAccuracyMeters : undefined,
      hasRecipientSignature: passwordValid ? Boolean(entry.recipientSignedAt) : false,
      collaborationComments: passwordValid ? entry.collaborationComments || [] : [],
      docsheetWorkbook: passwordValid ? entry.docsheetWorkbook : undefined,
      docsheetShareMode: passwordValid ? entry.docsheetShareMode || 'view' : undefined,
      docsheetSessionStatus: passwordValid ? entry.docsheetSessionStatus || 'active' : undefined,
      docsheetSharedWithEmail: passwordValid ? entry.docsheetSharedWithEmail : undefined,
      openCount: passwordValid ? (entry.openCount || 0) + 1 : entry.openCount || 0,
      downloadCount: entry.downloadCount || 0,
      editCount: entry.editCount || 0,
      accessEvents: passwordValid ? [
        {
          eventType: 'open',
          createdAt: new Date().toISOString(),
          ip: getRequestIp(_request),
          userAgent: getRequestUserAgent(_request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(_request)),
        },
        ...(entry.accessEvents || []),
      ].slice(0, 50) : [],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await request.json() as {
      data?: Record<string, string>;
      reviewerName?: string;
      password?: string;
      docsheetWorkbook?: unknown;
    };

    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const requiresPassword = entry.shareRequiresPassword !== false;
    if (requiresPassword && entry.sharePassword !== payload.password?.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Valid document password is required' }, { status: 403 });
    }
    const accessError = getShareAccessError(entry);
    if (accessError) {
      return NextResponse.json({ error: accessError }, { status: 410 });
    }
    if (entry.templateId !== 'docsheet-workbook' && entry.recipientAccess !== 'edit' && !entry.dataCollectionEnabled) {
      return NextResponse.json({ error: 'This shared document is not editable' }, { status: 403 });
    }

    if (entry.templateId === 'docsheet-workbook') {
      if ((entry.docsheetShareMode || 'view') !== 'edit') {
        return NextResponse.json({ error: 'This shared sheet is view-only.' }, { status: 403 });
      }

      const nextWorkbook = normalizeDocSheetWorkbook(payload.docsheetWorkbook || entry.docsheetWorkbook);
      const updatedSheet = await updateHistoryEntry(entry.id, (current) => ({
        ...current,
        docsheetWorkbook: nextWorkbook,
        previewHtml: buildDocSheetPreviewHtml(nextWorkbook),
        editCount: (current.editCount || 0) + 1,
        lastEditedAt: new Date().toISOString(),
        docsheetSessionStatus: current.shareExpiresAt && new Date(current.shareExpiresAt).getTime() < Date.now() ? 'expired' : 'active',
        accessEvents: [
          createAccessEvent({
            eventType: 'edit',
            createdAt: new Date().toISOString(),
            ip: getRequestIp(request),
            userAgent: getRequestUserAgent(request),
            deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
            actorName: payload.reviewerName?.trim() || 'Sheet collaborator',
          }),
          ...(current.accessEvents || []),
        ].slice(0, 50),
        automationNotes: [
          ...(current.automationNotes || []),
          `Editable DocSheet session updated${payload.reviewerName?.trim() ? ` by ${payload.reviewerName.trim()}` : ''}`,
        ],
      }));

      return NextResponse.json(updatedSheet);
    }

    const customTemplates = await getCustomTemplatesFromRepository();
    const template = [...documentTemplates, ...customTemplates].find((item) => item.id === entry.templateId);
    if (entry.documentSourceType === 'uploaded_pdf') {
      return NextResponse.json({ error: 'Uploaded PDF shares cannot be edited. Upload a new version from the workspace if changes are needed.' }, { status: 403 });
    }
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const adminSignatures = await getSignatureSettings();
    const adminSignature = adminSignatures.signatures.find((item) => item.id === entry.signatureId) || null;
    const maxSubmissions = entry.dataCollectionEnabled
      ? ((template.formAppearance?.allowSingleEditAfterSubmit !== false) ? 2 : 1)
      : Infinity;
    if (entry.dataCollectionEnabled && (entry.dataCollectionSubmissions?.length || 0) >= maxSubmissions) {
      return NextResponse.json({ error: 'This form is locked because the allowed submission window has been completed.' }, { status: 403 });
    }
    const nextData = Object.fromEntries(
      template.fields.map((field) => [field.name, String(payload.data?.[field.name] ?? entry.data?.[field.name] ?? '')])
    );
    const recipientSignature = entry.recipientSignatureDataUrl
      ? {
          signerName: entry.recipientSignerName || 'Recipient',
          signatureDataUrl: entry.recipientSignatureDataUrl,
          signatureSource: entry.recipientSignatureSource,
          signedAt: entry.recipientSignedAt,
          signedIp: entry.recipientSignedIp,
          signerPhotoDataUrl: entry.recipientPhotoDataUrl,
          signerPhotoCapturedAt: entry.recipientPhotoCapturedAt,
          signerPhotoCapturedIp: entry.recipientPhotoCapturedIp,
          signerPhotoCaptureMethod: entry.recipientPhotoCaptureMethod,
          aadhaarVerifiedAt: entry.recipientAadhaarVerifiedAt,
          aadhaarVerifiedIp: entry.recipientAadhaarVerifiedIp,
          aadhaarReferenceId: entry.recipientAadhaarReferenceId,
          aadhaarMaskedId: entry.recipientAadhaarMaskedId,
          aadhaarVerificationMode: entry.recipientAadhaarVerificationMode,
          aadhaarProviderLabel: entry.recipientAadhaarProviderLabel,
          signedLocationLabel: entry.recipientSignedLocationLabel,
          signedLatitude: entry.recipientSignedLatitude,
          signedLongitude: entry.recipientSignedLongitude,
          signedAccuracyMeters: entry.recipientSignedAccuracyMeters,
        }
      : null;
    const previewHtml = renderDocumentTemplate(template, nextData, {
      referenceNumber: entry.referenceNumber,
      generatedAt: entry.generatedAt,
      generatedBy: entry.generatedBy,
      renderMode: template.isCustom ? 'plain' : 'platform',
      designPreset: entry.editorState?.designPreset,
      signature: adminSignature,
      recipientSignature,
      watermarkLabel: entry.editorState?.watermarkLabel,
      letterheadMode: entry.editorState?.letterheadMode,
      letterheadImageDataUrl: entry.editorState?.letterheadImageDataUrl,
      letterheadHtml: entry.editorState?.letterheadHtml,
    });

    const submittedAt = new Date().toISOString();
    const submittedBy = payload.reviewerName?.trim() || 'Recipient';
    const updated = await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      data: nextData,
      previewHtml,
      dataCollectionStatus: current.dataCollectionEnabled ? 'submitted' : current.dataCollectionStatus,
      dataCollectionSubmittedAt: current.dataCollectionEnabled ? submittedAt : current.dataCollectionSubmittedAt,
      dataCollectionSubmittedBy: current.dataCollectionEnabled ? submittedBy : current.dataCollectionSubmittedBy,
      dataCollectionSubmissions: current.dataCollectionEnabled ? [
        {
          id: `submission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          submittedAt,
          submittedBy,
          data: nextData,
        },
        ...(current.dataCollectionSubmissions || []),
      ].slice(0, 100) : current.dataCollectionSubmissions,
      dataCollectionReviewNotes: current.dataCollectionEnabled ? undefined : current.dataCollectionReviewNotes,
      editCount: (current.editCount || 0) + 1,
      lastEditedAt: submittedAt,
      accessEvents: [
        createAccessEvent({
          eventType: 'edit',
          createdAt: submittedAt,
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
          actorName: submittedBy,
        }),
        ...(current.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [
        ...(current.automationNotes || []),
        ...(current.dataCollectionEnabled ? [`Data collection form submitted${submittedBy ? ` by ${submittedBy}` : ''}`] : []),
        `Recipient content update saved${submittedBy ? ` by ${submittedBy}` : ''}`,
      ],
    }));

    return NextResponse.json({
      ...updated,
      formAppearance: template.formAppearance,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
  }
}
