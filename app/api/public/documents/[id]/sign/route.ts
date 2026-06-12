import { NextRequest, NextResponse } from 'next/server';
import { createAccessEvent, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getCustomTemplatesFromRepository } from '@/lib/server/repositories';
import { getSignatureSettings } from '@/lib/server/settings';
import { renderDocumentTemplate } from '@/lib/template';
import { documentTemplates } from '@/data/templates';
import { RecipientSignatureRecord } from '@/types/document';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';
import { applyRecipientSignatureBoxSignaturesToPdfDataUrl } from '@/lib/server/shared-uploaded-pdf';
import { getAadhaarRuntimeConfig } from '@/lib/server/aadhaar';
import nodemailer from 'nodemailer';
import { appendEmailOutboxEvent, buildTrackingPixel, createOutboundEmailId, rewriteLinksForTracking, updateEmailOutboxEvent } from '@/lib/server/email-outbox';
import { isValidEmail } from '@/lib/server/security';
import { getMailSettings } from '@/lib/server/settings';
import { buildEmailChrome } from '@/lib/server/email-chrome';
import { buildSignedReceiptEmail } from '@/lib/server/signed-receipt-email';
import { assertDocumentSigningOtpVerified } from '@/lib/server/otp-sessions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await request.json() as {
      password?: string;
      token?: string;
      signerKey?: string;
      signerName?: string;
      signerEmail?: string;
      signatureDataUrl?: string;
      signaturesByBoxId?: Record<string, string>;
      signatureSource?: 'drawn' | 'uploaded';
      receiptEmail?: string;
      otpSessionId?: string;
      attestationAccepted?: boolean;
      attestationText?: string;
      evidenceCaptureToken?: string;
      location?: {
        latitude?: number;
        longitude?: number;
        accuracyMeters?: number;
        label?: string;
        capturedAt?: string;
      };
    };

    if (!payload.signerName?.trim()) {
      return NextResponse.json({ error: 'Signer name is required' }, { status: 400 });
    }

    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (!entry.recipientSignatureRequired) {
      return NextResponse.json({ error: 'Recipient signature is not required for this document' }, { status: 400 });
    }
    if (entry.requiredDocumentWorkflowEnabled && entry.documentsVerificationStatus !== 'verified') {
      return NextResponse.json({ error: 'Required documents must be verified by admin before signing' }, { status: 403 });
    }
    if (entry.recipientSignedAt) {
      return NextResponse.json({ error: 'This document has already been fully signed.' }, { status: 409 });
    }
    const normalizePassword = (value?: string | null) => String(value || '').trim().toUpperCase();
    const signingToken = String(payload.token || '').trim();
    let tokenSignerKey: string | null = null;
    let tokenValid = false;
    let tokenInvite: any | null = null;
    if (signingToken && entry.recipientSignerInvitesByKey && typeof entry.recipientSignerInvitesByKey === 'object') {
      for (const [signerKey, invite] of Object.entries(entry.recipientSignerInvitesByKey)) {
        if (!invite || typeof invite !== 'object') continue;
        if (String((invite as any).token || '') !== signingToken) continue;
        const expiresAt = String((invite as any).expiresAt || '');
        if (expiresAt && new Date(expiresAt).getTime() < Date.now()) break;
        tokenSignerKey = String(signerKey).slice(0, 64);
        tokenInvite = invite as any;
        tokenValid = true;
        break;
      }
    }
    if (!tokenValid) {
      if (!normalizePassword(entry.sharePassword)) {
        return NextResponse.json({ error: 'Signing password is not configured for this document' }, { status: 409 });
      }
      if (!payload.password?.trim()) {
        return NextResponse.json({ error: 'Signing password is required' }, { status: 400 });
      }
      if (normalizePassword(entry.sharePassword) !== normalizePassword(payload.password)) {
        return NextResponse.json({ error: 'Invalid signing password' }, { status: 403 });
      }
    }

    const isUploadedPdf = entry.documentSourceType === 'uploaded_pdf';
    const representativeSignatureDataUrl = payload.signatureDataUrl?.startsWith('data:image/')
      ? payload.signatureDataUrl
      : (payload.signaturesByBoxId
          ? Object.values(payload.signaturesByBoxId).find((v) => typeof v === 'string' && v.startsWith('data:image/')) || ''
          : '');
    if (!isUploadedPdf && !representativeSignatureDataUrl) {
      return NextResponse.json({ error: 'Signature is required' }, { status: 400 });
    }

    const aadhaarRuntime = await getAadhaarRuntimeConfig();
    if (aadhaarRuntime.enabled) {
      if (!entry.recipientAadhaarVerifiedAt || !entry.recipientAadhaarVerifiedIp) {
        return NextResponse.json({ error: 'Aadhaar verification is mandatory before signing this document.' }, { status: 403 });
      }
      if (entry.recipientAadhaarVerifiedIp !== getRequestIp(request)) {
        return NextResponse.json({ error: 'Aadhaar verification must be completed again from this device/network before signing.' }, { status: 409 });
      }
    }
    const normalizedSignerKey = tokenSignerKey || (String(payload.signerKey || 'recipient').trim().slice(0, 64) || 'recipient');

    const directoryEmail = entry.recipientSignerDirectory?.[normalizedSignerKey]?.signerEmail
      ? String(entry.recipientSignerDirectory[normalizedSignerKey]!.signerEmail || '').trim().toLowerCase()
      : '';
    const inviteEmail = tokenValid && tokenInvite?.signerEmail
      ? String(tokenInvite.signerEmail || '').trim().toLowerCase()
      : '';
    const expectedSignerEmail = inviteEmail || directoryEmail;
    const resolvedSignerEmail = String(expectedSignerEmail || '').trim().toLowerCase();
    if (resolvedSignerEmail && !isValidEmail(resolvedSignerEmail)) {
      return NextResponse.json({ error: 'Signer email is not configured correctly for this signing slot.' }, { status: 409 });
    }

    if (entry.recipientSigningMode === 'sequential') {
      const directory = entry.recipientSignerDirectory || {};
      const getOrder = (key: string) => {
        const order = directory?.[key]?.signingOrder;
        return typeof order === 'number' ? order : 9999;
      };
      const placements = entry.recipientSignaturePlacements;
      const boxes = placements && (placements as any).mode === 'boxes' && Array.isArray((placements as any).boxes)
        ? (placements as any).boxes
        : [];
      const all: string[] = boxes.length
        ? (Array.from(new Set(
            boxes
              .filter((b: any) => (b as any).required !== false)
              .map((b: any) => String((b as any)?.signerKey || 'recipient').trim() || 'recipient'),
          )) as string[])
        : [];
      const signed = new Set((entry.recipientSigners || []).filter((s: any) => s.signingStatus === 'signed').map((s: any) => String(s.signerKey)));
      const pending = all.filter((key) => !signed.has(key));
      const nextKey = pending.sort((a, b) => getOrder(a) - getOrder(b))[0];
      if (nextKey && nextKey !== normalizedSignerKey) {
        return NextResponse.json({ error: 'This signing session is sequential. It is not this signer’s turn to sign yet.' }, { status: 409 });
      }
    }

      const signerConfig = (entry.recipientSignerConfigsByKey && typeof entry.recipientSignerConfigsByKey === 'object')
      ? entry.recipientSignerConfigsByKey[normalizedSignerKey]
      : undefined;
    const cameraCaptureEnabled = signerConfig?.cameraCaptureEnabled !== false;
    const consentRequired = signerConfig?.consentRequired !== false;
    const captureIpDeviceLocationEnabled = signerConfig?.captureIpDeviceLocationEnabled !== false;
    const emailOtpEnabled = signerConfig?.emailOtpEnabled === true;

    if (consentRequired && payload.attestationAccepted !== true) {
      return NextResponse.json({ error: 'You must accept the signing attestation before signing.' }, { status: 400 });
    }

    if (emailOtpEnabled) {
      const otpSessionId = String(payload.otpSessionId || '').trim();
      if (!resolvedSignerEmail) {
        return NextResponse.json({ error: 'Signer email is not configured for OTP verification.' }, { status: 409 });
      }
      await assertDocumentSigningOtpVerified(otpSessionId, resolvedSignerEmail, { historyId: entry.id, signerKey: normalizedSignerKey });
    }

    if (cameraCaptureEnabled && !payload.evidenceCaptureToken?.trim()) {
      return NextResponse.json({ error: 'A live signer photo must be captured before signing.' }, { status: 400 });
    }

    if (captureIpDeviceLocationEnabled) {
      if (
        typeof payload.location?.latitude !== 'number'
        || typeof payload.location?.longitude !== 'number'
        || Number.isNaN(payload.location.latitude)
        || Number.isNaN(payload.location.longitude)
        || !payload.location?.capturedAt
      ) {
        return NextResponse.json({ error: 'Live location access is mandatory before signing this document' }, { status: 400 });
      }
    }

    const evidence = entry.pendingRecipientEvidenceBySignerKey?.[normalizedSignerKey];
    const evidenceToken = evidence?.captureToken || entry.pendingRecipientPhotoCaptureToken;
    const evidenceCapturedAt = evidence?.capturedAt || entry.pendingRecipientPhotoCapturedAt;
    const evidenceCapturedIp = evidence?.capturedIp || entry.pendingRecipientPhotoCapturedIp;
    const evidencePhotoDataUrl = evidence?.photoDataUrl || entry.pendingRecipientPhotoDataUrl;
    const signingIp = getRequestIp(request);

    if (cameraCaptureEnabled) {
      if (!evidenceToken || evidenceToken !== payload.evidenceCaptureToken?.trim()) {
        return NextResponse.json({ error: 'Live signer photo evidence is missing or expired. Please capture a fresh photo before signing.' }, { status: 409 });
      }
      if (!evidencePhotoDataUrl || !evidenceCapturedAt) {
        return NextResponse.json({ error: 'Live signer photo evidence is incomplete. Please capture a fresh photo before signing.' }, { status: 409 });
      }
      if (Date.now() - new Date(evidenceCapturedAt).getTime() > 15 * 60 * 1000) {
        await updateHistoryEntry(entry.id, (current) => ({
          ...current,
          pendingRecipientEvidenceBySignerKey: current.pendingRecipientEvidenceBySignerKey
            ? Object.fromEntries(Object.entries(current.pendingRecipientEvidenceBySignerKey).filter(([key]) => key !== normalizedSignerKey))
            : current.pendingRecipientEvidenceBySignerKey,
          pendingRecipientPhotoDataUrl: undefined,
          pendingRecipientPhotoCapturedAt: undefined,
          pendingRecipientPhotoCapturedIp: undefined,
          pendingRecipientPhotoCaptureToken: undefined,
          automationNotes: [...(current.automationNotes || []), 'Live signer photo evidence expired before final submission'],
        }));
        return NextResponse.json({ error: 'Live signer photo evidence expired. Please capture a fresh photo before signing.' }, { status: 409 });
      }

      if (!evidenceCapturedIp || evidenceCapturedIp !== signingIp) {
        await updateHistoryEntry(entry.id, (current) => ({
          ...current,
          pendingRecipientEvidenceBySignerKey: current.pendingRecipientEvidenceBySignerKey
            ? Object.fromEntries(Object.entries(current.pendingRecipientEvidenceBySignerKey).filter(([key]) => key !== normalizedSignerKey))
            : current.pendingRecipientEvidenceBySignerKey,
          pendingRecipientPhotoDataUrl: undefined,
          pendingRecipientPhotoCapturedAt: undefined,
          pendingRecipientPhotoCapturedIp: undefined,
          pendingRecipientPhotoCaptureToken: undefined,
          automationNotes: [...(current.automationNotes || []), 'Signature attempt blocked because capture IP did not match signing IP'],
        }));
        return NextResponse.json({
          error: 'IP mismatch detected between live photo capture and signing attempt. For security, submission is locked until you capture a fresh live photo from this device and network.',
        }, { status: 409 });
      }
    }

    const recipientSignature: RecipientSignatureRecord = {
      signerName: payload.signerName.trim(),
      signatureDataUrl: representativeSignatureDataUrl,
      signatureSource: payload.signatureSource === 'uploaded' ? 'uploaded' : 'drawn',
      signedAt: new Date().toISOString(),
      signedIp: signingIp,
      signerPhotoDataUrl: cameraCaptureEnabled ? evidencePhotoDataUrl : undefined,
      signerPhotoCapturedAt: cameraCaptureEnabled ? evidenceCapturedAt : undefined,
      signerPhotoCapturedIp: cameraCaptureEnabled ? evidenceCapturedIp : undefined,
      signerPhotoCaptureMethod: cameraCaptureEnabled ? 'live_camera' : undefined,
      aadhaarVerifiedAt: entry.recipientAadhaarVerifiedAt,
      aadhaarVerifiedIp: entry.recipientAadhaarVerifiedIp,
      aadhaarReferenceId: entry.recipientAadhaarReferenceId,
      aadhaarMaskedId: entry.recipientAadhaarMaskedId,
      aadhaarVerificationMode: entry.recipientAadhaarVerificationMode,
      aadhaarProviderLabel: entry.recipientAadhaarProviderLabel,
      signedLocationLabel: captureIpDeviceLocationEnabled
        ? (payload.location?.label?.trim() || `${payload.location!.latitude!.toFixed(6)}, ${payload.location!.longitude!.toFixed(6)}`)
        : undefined,
      signedLatitude: captureIpDeviceLocationEnabled ? payload.location!.latitude : undefined,
      signedLongitude: captureIpDeviceLocationEnabled ? payload.location!.longitude : undefined,
      signedAccuracyMeters: captureIpDeviceLocationEnabled ? payload.location?.accuracyMeters : undefined,
    };

    const customTemplates = entry.documentSourceType === 'uploaded_pdf' ? [] : await getCustomTemplatesFromRepository();
    const template = entry.documentSourceType === 'uploaded_pdf'
      ? null
      : [...documentTemplates, ...customTemplates].find((item) => item.id === entry.templateId) || null;

    let previewHtml = entry.previewHtml;
    let signedPdfDataUrl = entry.signedPdfDataUrl;
    let signedPdfFileName = entry.signedPdfFileName;
    let recipientSignatureBoxSummary: {
      totalBoxes: number;
      requiredBoxes: number;
      completedBoxes: number;
      missingRequiredBoxIds?: string[];
    } | undefined;
    let nextRecipientSigners = Array.isArray(entry.recipientSigners) ? entry.recipientSigners : [];
    let nextRecipientSignatureBoxesById: Record<string, string> | undefined;
    let envelopeSignedNow = false;

    if (entry.documentSourceType === 'uploaded_pdf') {
      if (!entry.uploadedPdfDataUrl) {
        return NextResponse.json({ error: 'Original uploaded PDF is missing' }, { status: 400 });
      }

      const placements = entry.recipientSignaturePlacements;
      if (!placements || placements.mode !== 'boxes' || !Array.isArray(placements.boxes) || placements.boxes.length === 0) {
        return NextResponse.json({ error: 'No signature boxes were configured for this document. Ask the sender to place signature boxes first.' }, { status: 400 });
      }
      const signaturesByBoxId = payload.signaturesByBoxId && typeof payload.signaturesByBoxId === 'object' ? payload.signaturesByBoxId : null;
      if (!signaturesByBoxId) {
        return NextResponse.json({ error: 'Missing signatures for signature boxes.' }, { status: 400 });
      }

      const resolveSignerKey = (b: any) => String(b?.signerKey || 'recipient').trim().slice(0, 64) || 'recipient';
      const boxesForSigner = placements.boxes.filter((b: any) => resolveSignerKey(b) === normalizedSignerKey);
      if (boxesForSigner.length === 0) {
        return NextResponse.json({ error: 'No signature boxes are assigned to this signer.' }, { status: 400 });
      }
      const requiredBoxesForSigner = boxesForSigner.filter((b: any) => (b as any).required !== false);
      if (requiredBoxesForSigner.length === 0) {
        return NextResponse.json({ error: 'No required signature boxes are assigned to this signer.' }, { status: 400 });
      }
      const allowedBoxIds = new Set(boxesForSigner.map((b: any) => String(b.id)));
      const filteredSignaturesByBoxId = Object.fromEntries(
        Object.entries(signaturesByBoxId).filter(([boxId, value]) => allowedBoxIds.has(String(boxId)) && typeof value === 'string')
      ) as Record<string, string>;
      const missing = requiredBoxesForSigner.filter((b: any) => !filteredSignaturesByBoxId[b.id]?.startsWith('data:image/')).map((b: any) => b.id);
      if (missing.length) {
        return NextResponse.json({ error: 'All required signature boxes must be signed before submitting.' }, { status: 400 });
      }

      if (nextRecipientSigners.some((s: any) => s.signerKey === normalizedSignerKey && s.signingStatus === 'signed')) {
        return NextResponse.json({ error: 'This signer has already completed their signature.' }, { status: 409 });
      }

      const existingBoxesById = entry.recipientSignatureBoxesById && typeof entry.recipientSignatureBoxesById === 'object'
        ? entry.recipientSignatureBoxesById
        : {};
      nextRecipientSignatureBoxesById = { ...existingBoxesById, ...filteredSignaturesByBoxId };

      const allRequiredBoxes = placements.boxes.filter((b: any) => (b as any).required !== false);
      const allSignerKeys = Array.from(new Set(allRequiredBoxes.map((b: any) => resolveSignerKey(b))));

      const signerSummary = {
        totalBoxes: boxesForSigner.length,
        requiredBoxes: requiredBoxesForSigner.length,
        completedBoxes: boxesForSigner.filter((b: any) => nextRecipientSignatureBoxesById?.[b.id]?.startsWith('data:image/')).length,
        missingRequiredBoxIds: requiredBoxesForSigner.filter((b: any) => !nextRecipientSignatureBoxesById?.[b.id]?.startsWith('data:image/')).map((b: any) => b.id) || undefined,
      };

      recipientSignatureBoxSummary = {
        totalBoxes: placements.boxes.length,
        requiredBoxes: allRequiredBoxes.length,
        completedBoxes: Object.values(nextRecipientSignatureBoxesById).filter((v) => typeof v === 'string' && v.startsWith('data:image/')).length,
      };

      const stampedPdfDataUrl = await applyRecipientSignatureBoxSignaturesToPdfDataUrl(
        entry.uploadedPdfDataUrl,
        nextRecipientSignatureBoxesById,
        { mode: 'boxes', boxes: placements.boxes },
      );

      signedPdfDataUrl = stampedPdfDataUrl;
      signedPdfFileName = (entry.uploadedPdfFileName || entry.templateName || 'shared-document').replace(/\.pdf$/i, '') + '-signed.pdf';

      const signerEmail = resolvedSignerEmail || undefined;
      nextRecipientSigners = [
        ...nextRecipientSigners.filter((s: any) => s.signerKey !== normalizedSignerKey),
        {
          signerKey: normalizedSignerKey,
          signerName: recipientSignature.signerName,
          signerEmail,
          signingStatus: 'signed',
          signedAt: recipientSignature.signedAt,
          signedIp: recipientSignature.signedIp,
          signedLocationLabel: recipientSignature.signedLocationLabel,
          signedLatitude: recipientSignature.signedLatitude,
          signedLongitude: recipientSignature.signedLongitude,
          signedAccuracyMeters: recipientSignature.signedAccuracyMeters,
          authenticationMethods: [
            normalizePassword(entry.sharePassword) ? 'Access password' : null,
            cameraCaptureEnabled ? (evidencePhotoDataUrl ? 'Live photo evidence' : 'Live photo evidence (missing)') : 'Live photo evidence (disabled)',
            captureIpDeviceLocationEnabled ? (recipientSignature.signedLatitude && recipientSignature.signedLongitude ? 'Live location capture' : 'Live location capture (missing)') : 'Live location capture (disabled)',
            recipientSignature.aadhaarVerifiedAt ? 'Aadhaar OTP verification' : null,
            consentRequired ? 'Consent confirmation' : 'Consent confirmation (not required)',
          ].filter(Boolean) as string[],
          photoDataUrl: cameraCaptureEnabled ? evidencePhotoDataUrl : undefined,
          photoCapturedAt: cameraCaptureEnabled ? evidenceCapturedAt : undefined,
          photoCapturedIp: cameraCaptureEnabled ? evidenceCapturedIp : undefined,
          photoCaptureMethod: cameraCaptureEnabled ? 'live_camera' : undefined,
          consentedAt: consentRequired ? recipientSignature.signedAt : undefined,
          consentText: consentRequired ? (String(payload.attestationText || '').trim() || undefined) : undefined,
          signatureSource: recipientSignature.signatureSource,
          signatureDataUrl: representativeSignatureDataUrl,
          signatureBoxSummary: signerSummary,
        },
      ];

      envelopeSignedNow = allSignerKeys.every((key) => nextRecipientSigners.some((s: any) => s.signerKey === key && s.signingStatus === 'signed'));
    } else {
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const adminSignatures = await getSignatureSettings();
      const adminSignature = adminSignatures.signatures.find((item) => item.id === entry.signatureId) || null;
      previewHtml = renderDocumentTemplate(template, entry.data, {
        referenceNumber: entry.referenceNumber,
        generatedAt: entry.generatedAt,
        generatedBy: entry.generatedBy,
        renderMode: template.isCustom ? 'plain' : 'platform',
        designPreset: entry.editorState?.designPreset,
        signature: adminSignature,
        recipientSignature,
      });
    }

    const updated = await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      previewHtml,
      signedPdfDataUrl,
      signedPdfFileName,
      recipientSignerName: envelopeSignedNow ? recipientSignature.signerName : current.recipientSignerName,
      recipientSignerEmail: envelopeSignedNow ? (resolvedSignerEmail || current.emailTo || undefined) : current.recipientSignerEmail,
      recipientSignatureDataUrl: envelopeSignedNow ? recipientSignature.signatureDataUrl : current.recipientSignatureDataUrl,
      recipientSignatureSource: envelopeSignedNow ? recipientSignature.signatureSource : current.recipientSignatureSource,
      recipientSignatureBoxSummary,
      recipientSigners: nextRecipientSigners,
      recipientSignatureBoxesById: nextRecipientSignatureBoxesById || current.recipientSignatureBoxesById,
      recipientSignedAt: envelopeSignedNow ? recipientSignature.signedAt : current.recipientSignedAt,
      recipientSignedIp: envelopeSignedNow ? recipientSignature.signedIp : current.recipientSignedIp,
      recipientPhotoDataUrl: envelopeSignedNow ? (cameraCaptureEnabled ? recipientSignature.signerPhotoDataUrl : undefined) : current.recipientPhotoDataUrl,
      recipientPhotoCapturedAt: envelopeSignedNow ? (cameraCaptureEnabled ? recipientSignature.signerPhotoCapturedAt : undefined) : current.recipientPhotoCapturedAt,
      recipientPhotoCapturedIp: envelopeSignedNow ? (cameraCaptureEnabled ? recipientSignature.signerPhotoCapturedIp : undefined) : current.recipientPhotoCapturedIp,
      recipientPhotoCaptureMethod: envelopeSignedNow ? (cameraCaptureEnabled ? recipientSignature.signerPhotoCaptureMethod : undefined) : current.recipientPhotoCaptureMethod,
      recipientConsentedAt: envelopeSignedNow ? (consentRequired ? recipientSignature.signedAt : undefined) : current.recipientConsentedAt,
      recipientConsentText: envelopeSignedNow
        ? (consentRequired
            ? (String(payload.attestationText || '').trim() || 'Signer confirmed authorization to sign and consented to storing signature evidence (live photo, location, timestamp, and device/IP trail) for audit.')
            : 'Consent confirmation was not required for this signer.')
        : current.recipientConsentText,
      recipientAadhaarVerificationRequired: aadhaarRuntime.enabled,
      recipientAadhaarVerifiedAt: recipientSignature.aadhaarVerifiedAt,
      recipientAadhaarVerifiedIp: recipientSignature.aadhaarVerifiedIp,
      recipientAadhaarReferenceId: recipientSignature.aadhaarReferenceId,
      recipientAadhaarMaskedId: recipientSignature.aadhaarMaskedId,
      recipientAadhaarVerificationMode: recipientSignature.aadhaarVerificationMode,
      recipientAadhaarProviderLabel: recipientSignature.aadhaarProviderLabel,
      pendingRecipientEvidenceBySignerKey: current.pendingRecipientEvidenceBySignerKey
        ? Object.fromEntries(Object.entries(current.pendingRecipientEvidenceBySignerKey).filter(([key]) => key !== normalizedSignerKey))
        : current.pendingRecipientEvidenceBySignerKey,
      pendingRecipientPhotoDataUrl: undefined,
      pendingRecipientPhotoCapturedAt: undefined,
      pendingRecipientPhotoCapturedIp: undefined,
      pendingRecipientPhotoCaptureToken: undefined,
      recipientSignedLocationLabel: envelopeSignedNow ? (captureIpDeviceLocationEnabled ? recipientSignature.signedLocationLabel : undefined) : current.recipientSignedLocationLabel,
      recipientSignedLatitude: envelopeSignedNow ? (captureIpDeviceLocationEnabled ? recipientSignature.signedLatitude : undefined) : current.recipientSignedLatitude,
      recipientSignedLongitude: envelopeSignedNow ? (captureIpDeviceLocationEnabled ? recipientSignature.signedLongitude : undefined) : current.recipientSignedLongitude,
      recipientSignedAccuracyMeters: envelopeSignedNow ? (captureIpDeviceLocationEnabled ? recipientSignature.signedAccuracyMeters : undefined) : current.recipientSignedAccuracyMeters,
      accessEvents: [
        createAccessEvent({
          eventType: 'sign',
          createdAt: new Date().toISOString(),
          ip: signingIp,
          userAgent: getRequestUserAgent(request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
          actorName: `${recipientSignature.signerName} (${normalizedSignerKey})`,
        }),
        ...(current.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [...(current.automationNotes || []), envelopeSignedNow ? 'Recipient signatures completed' : `Signer ${normalizedSignerKey} signature captured`],
    }));
    if (!updated) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Best-effort emails (do not block signing).
    try {
      const smtp = await getMailSettings();
      if (smtp.host && smtp.fromEmail) {
        const origin = request.nextUrl.origin;
        const normalizedPassword = normalizePassword(payload.password);
        const authQuery = tokenValid
          ? `token=${encodeURIComponent(signingToken)}`
          : `password=${encodeURIComponent(normalizedPassword)}`;

        const ownerEmail = String(entry.generatedBy || '').trim().toLowerCase();
        const signerEmailForNotifications = resolvedSignerEmail;
        const shouldSendOwnerReceipt = envelopeSignedNow && isValidEmail(ownerEmail);
        const shouldSendSignerReceipt = isValidEmail(signerEmailForNotifications);
        const shouldSendSignerProgress = false;

        if (shouldSendOwnerReceipt || shouldSendSignerReceipt || shouldSendSignerProgress) {
          const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: Number(smtp.port),
            secure: smtp.secure,
            auth: smtp.requireAuth ? { user: smtp.username, pass: smtp.password } : undefined,
          });

          const getSignedPdfAttachment = async () => {
            if (updated.documentSourceType === 'uploaded_pdf') {
              const dataUrl = updated.signedPdfDataUrl || updated.uploadedPdfDataUrl;
              if (!dataUrl?.startsWith('data:application/pdf;base64,')) return null;
              return {
                filename: updated.signedPdfFileName || 'signed-document.pdf',
                content: Buffer.from(dataUrl.replace(/^data:application\/pdf;base64,/, ''), 'base64'),
              };
            }

            const url = `${origin}/api/public/documents/${encodeURIComponent(params.id)}/pdf?${authQuery}&internal=1`;
            const response = await fetch(url, { method: 'GET' });
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            return {
              filename: `${(updated.templateName || 'document').replace(/\s+/g, '_')}-signed.pdf`,
              content: Buffer.from(arrayBuffer),
            };
          };

          const attachment = await getSignedPdfAttachment();

          const getReceiptPdfAttachment = async (recipientType: 'signer' | 'sender') => {
            const signerKeyParam = recipientType === 'signer' ? `&signerKey=${encodeURIComponent(normalizedSignerKey)}` : '';
            const url = `${origin}/api/public/documents/${encodeURIComponent(params.id)}/receipt?${authQuery}&internal=1${signerKeyParam}`;
            const response = await fetch(url, { method: 'GET' });
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            const baseName = (updated.uploadedPdfFileName || updated.templateName || 'signature-receipt').replace(/\.pdf$/i, '').replace(/\s+/g, '_');
            const suffix = recipientType === 'signer' ? `-${normalizedSignerKey}` : '';
            return {
              filename: `${baseName}-signature-receipt${suffix}.pdf`,
              content: Buffer.from(arrayBuffer),
            };
          };

          const sendProgressEmail = async () => {
            const receiptAttachment = await getReceiptPdfAttachment('signer');
            const subject = `${updated.templateName || 'Document'} — Signature Captured`;
            const preheader = 'Your assigned signature fields have been submitted successfully.';
            const signerLink = `${origin}/documents/${encodeURIComponent(updated.shareId || updated.id)}`;
            const bodyHtml = `
              <div style="padding: 14px 14px 0;">
                <div style="border:1px solid rgba(15,23,42,.10); border-radius: 18px; padding: 16px 16px; background:#ffffff;">
                  <div style="font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:900; color: rgba(15,23,42,.55);">Signing update</div>
                  <div style="margin-top:6px; font-size:18px; font-weight:900; letter-spacing:-.02em; color:#0f172a;">${updated.templateName || 'Document'}</div>
                  <div style="margin-top: 10px; font-size: 14px; color:#0f172a;">Your signature for signer slot <strong>${normalizedSignerKey}</strong> has been captured.</div>
                  <div style="margin-top: 14px;">
                    <a href="${signerLink}" style="display:inline-block; text-decoration:none; background:#0f172a; color:#ffffff; padding: 12px 16px; border-radius: 999px; font-weight:800; font-size:14px;">Open execution record</a>
                  </div>
                </div>
              </div>
            `.trim();
            const htmlBody = buildEmailChrome({ origin, subject, preheader, bodyHtml });
            await transporter.sendMail({
              from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
              to: signerEmailForNotifications,
              replyTo: smtp.replyTo || undefined,
              subject,
              text: `Signature captured for ${updated.templateName || 'document'}.\nSigner slot: ${normalizedSignerKey}\nOpen: ${signerLink}`,
              html: htmlBody,
              attachments: [
                ...(attachment ? [{ filename: attachment.filename, content: attachment.content }] : []),
                ...(receiptAttachment ? [{ filename: receiptAttachment.filename, content: receiptAttachment.content }] : []),
              ],
            });
          };

          const sendReceipt = async (toEmail: string, recipientType: 'signer' | 'sender') => {
            const outboxId = createOutboundEmailId('sign');
            const receipt = buildSignedReceiptEmail({
              origin,
              entry: updated,
              recipientType,
              signerEmail: signerEmailForNotifications || undefined,
              senderEmail: ownerEmail || undefined,
            });

            await appendEmailOutboxEvent({
              id: outboxId,
              createdAt: new Date().toISOString(),
              status: 'queued',
              type: 'system',
              to: toEmail,
              subject: receipt.subject,
              tracking: { opens: 0, clicks: 0 },
              metadata: { historyId: entry.id, event: recipientType === 'signer' ? 'signer_receipt' : 'sender_receipt' },
            });

            const trackedText = rewriteLinksForTracking(origin, outboxId, receipt.text);
            const trackedHtml = rewriteLinksForTracking(origin, outboxId, receipt.html);
            const htmlBody = buildEmailChrome({
              origin,
              subject: receipt.subject,
              preheader: receipt.preheader,
              bodyHtml: trackedHtml,
            });

            const receiptAttachment = await getReceiptPdfAttachment(recipientType);

            const info = await transporter.sendMail({
              from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
              to: toEmail,
              replyTo: smtp.replyTo || undefined,
              subject: receipt.subject,
              text: trackedText,
              html: `${htmlBody}\n${buildTrackingPixel(origin, outboxId)}`,
              attachments: [
                ...(attachment ? [{ filename: attachment.filename, content: attachment.content }] : []),
                ...(receiptAttachment ? [{ filename: receiptAttachment.filename, content: receiptAttachment.content }] : []),
              ],
            });

            await updateEmailOutboxEvent(outboxId, (ev) => ({
              ...ev,
              status: 'sent',
              messageId: info.messageId,
              sentAt: new Date().toISOString(),
              sentBy: ownerEmail || 'system',
            }));
          };

          if (shouldSendOwnerReceipt) {
            await sendReceipt(ownerEmail, 'sender');
          }

          if (shouldSendSignerReceipt && signerEmailForNotifications && signerEmailForNotifications !== ownerEmail) {
            await sendReceipt(signerEmailForNotifications, 'signer');
          }
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      ...updated,
      templateFields: template?.fields || [],
      data: updated?.data || entry.data,
      documentSourceType: updated?.documentSourceType || entry.documentSourceType || 'generated',
      uploadedPdfFileName: updated?.uploadedPdfFileName || entry.uploadedPdfFileName,
      uploadedPdfPreviewUrl: updated?.signedPdfDataUrl || updated?.uploadedPdfDataUrl || entry.signedPdfDataUrl || entry.uploadedPdfDataUrl,
      recipientAccess: updated?.recipientAccess || entry.recipientAccess,
      recipientSignerName: updated?.recipientSignerName || entry.recipientSignerName,
      recipientSignerEmail: updated?.recipientSignerEmail || entry.recipientSignerEmail,
      recipientSigners: updated?.recipientSigners || entry.recipientSigners || [],
      recipientSignedAt: updated?.recipientSignedAt || entry.recipientSignedAt,
      recipientSignedIp: updated?.recipientSignedIp || entry.recipientSignedIp,
      recipientSignatureSource: updated?.recipientSignatureSource || entry.recipientSignatureSource,
      recipientSignatureBoxSummary: updated?.recipientSignatureBoxSummary || entry.recipientSignatureBoxSummary,
      recipientPhotoDataUrl: updated?.recipientPhotoDataUrl || entry.recipientPhotoDataUrl,
      recipientPhotoCapturedAt: updated?.recipientPhotoCapturedAt || entry.recipientPhotoCapturedAt,
      recipientPhotoCapturedIp: updated?.recipientPhotoCapturedIp || entry.recipientPhotoCapturedIp,
      recipientPhotoCaptureMethod: updated?.recipientPhotoCaptureMethod || entry.recipientPhotoCaptureMethod,
      recipientConsentedAt: updated?.recipientConsentedAt || entry.recipientConsentedAt,
      recipientConsentText: updated?.recipientConsentText || entry.recipientConsentText,
      recipientAadhaarVerifiedAt: updated?.recipientAadhaarVerifiedAt || entry.recipientAadhaarVerifiedAt,
      recipientAadhaarVerifiedIp: updated?.recipientAadhaarVerifiedIp || entry.recipientAadhaarVerifiedIp,
      recipientAadhaarReferenceId: updated?.recipientAadhaarReferenceId || entry.recipientAadhaarReferenceId,
      recipientAadhaarMaskedId: updated?.recipientAadhaarMaskedId || entry.recipientAadhaarMaskedId,
      recipientAadhaarVerificationMode: updated?.recipientAadhaarVerificationMode || entry.recipientAadhaarVerificationMode,
      recipientAadhaarProviderLabel: updated?.recipientAadhaarProviderLabel || entry.recipientAadhaarProviderLabel,
      signatureReceiptCompletionPageEnabled: updated?.editorState?.signatureReceiptCompletionPageEnabled ?? entry.editorState?.signatureReceiptCompletionPageEnabled ?? true,
      recipientSignedLocationLabel: updated?.recipientSignedLocationLabel || entry.recipientSignedLocationLabel,
      recipientSignedLatitude: updated?.recipientSignedLatitude ?? entry.recipientSignedLatitude,
      recipientSignedLongitude: updated?.recipientSignedLongitude ?? entry.recipientSignedLongitude,
      recipientSignedAccuracyMeters: updated?.recipientSignedAccuracyMeters ?? entry.recipientSignedAccuracyMeters,
      hasRecipientSignature: Boolean(updated?.recipientSignedAt || entry.recipientSignedAt),
      requiredDocumentWorkflowEnabled: updated?.requiredDocumentWorkflowEnabled ?? entry.requiredDocumentWorkflowEnabled,
      requiredDocuments: updated?.requiredDocuments || entry.requiredDocuments || [],
      submittedDocuments: updated?.submittedDocuments || entry.submittedDocuments || [],
      documentsVerificationStatus: updated?.documentsVerificationStatus || entry.documentsVerificationStatus,
      documentsVerificationNotes: updated?.documentsVerificationNotes || entry.documentsVerificationNotes,
      collaborationComments: updated?.collaborationComments || entry.collaborationComments || [],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to sign document' }, { status: 500 });
  }
}
