import { NextRequest, NextResponse } from 'next/server';
import { createAccessEvent, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getRequestIp, getRequestUserAgent, getDeviceLabel } from '@/lib/server/public-documents';
import { getAadhaarRuntimeConfig, requestAadhaarOtp, verifyAadhaarOtp, type AadhaarIdentityType } from '@/lib/server/aadhaar';

export const dynamic = 'force-dynamic';

function normalizeIdentityValue(value?: string) {
  return (value || '').replace(/\D/g, '').trim();
}

function isValidIdentity(type: AadhaarIdentityType, value: string) {
  return type === 'aadhaar' ? /^\d{12}$/.test(value) : /^\d{16}$/.test(value);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await request.json() as {
      action?: 'request_otp' | 'verify_otp';
      password?: string;
      signerName?: string;
      identityType?: AadhaarIdentityType;
      identityValue?: string;
      otp?: string;
      transactionId?: string;
    };

    const runtime = await getAadhaarRuntimeConfig();
    if (!runtime.enabled) {
      return NextResponse.json({ error: 'Aadhaar verification is not enabled by admin.' }, { status: 403 });
    }
    if (!runtime.configured) {
      return NextResponse.json({ error: 'Aadhaar verification is not configured yet. Ask your admin to complete the UIDAI gateway setup.' }, { status: 503 });
    }

    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (!entry.recipientSignatureRequired) {
      return NextResponse.json({ error: 'This document does not require signing.' }, { status: 400 });
    }
    if (entry.recipientSignatureDataUrl) {
      return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 });
    }
    if (entry.sharePassword !== payload.password?.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Invalid signing password' }, { status: 403 });
    }

    const identityType = payload.identityType === 'vid' ? 'vid' : 'aadhaar';
    const identityValue = normalizeIdentityValue(payload.identityValue);
    if (!isValidIdentity(identityType, identityValue)) {
      return NextResponse.json({ error: identityType === 'vid' ? 'Enter a valid 16-digit VID.' : 'Enter a valid 12-digit Aadhaar number.' }, { status: 400 });
    }

    if (payload.action === 'request_otp') {
      const otpRequest = await requestAadhaarOtp({
        identityType,
        identityValue,
        signerName: payload.signerName?.trim(),
        documentId: entry.id,
        shareId: entry.shareId,
        referenceNumber: entry.referenceNumber,
      });

      const updated = await updateHistoryEntry(entry.id, (current) => ({
        ...current,
        recipientAadhaarVerificationRequired: true,
        pendingRecipientAadhaarTransactionId: otpRequest.transactionId,
        pendingRecipientAadhaarMaskedId: otpRequest.maskedId,
        pendingRecipientAadhaarRequestedAt: new Date().toISOString(),
        accessEvents: [
          createAccessEvent({
            eventType: 'verify',
            createdAt: new Date().toISOString(),
            ip: getRequestIp(request),
            userAgent: getRequestUserAgent(request),
            deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
            actorName: payload.signerName?.trim() || 'Recipient',
          }),
          ...(current.accessEvents || []),
        ].slice(0, 50),
        automationNotes: [...(current.automationNotes || []), 'Aadhaar OTP requested for recipient signing'],
      }));

      return NextResponse.json({
        verificationRequired: true,
        transactionId: updated?.pendingRecipientAadhaarTransactionId || otpRequest.transactionId,
        maskedId: updated?.pendingRecipientAadhaarMaskedId || otpRequest.maskedId,
        requestedAt: updated?.pendingRecipientAadhaarRequestedAt,
        providerLabel: otpRequest.providerLabel,
        message: otpRequest.message,
      });
    }

    if (payload.action === 'verify_otp') {
      if (!payload.transactionId?.trim()) {
        return NextResponse.json({ error: 'Missing Aadhaar OTP transaction ID.' }, { status: 400 });
      }
      if (!payload.otp?.trim()) {
        return NextResponse.json({ error: 'OTP is required for Aadhaar verification.' }, { status: 400 });
      }
      if (!entry.pendingRecipientAadhaarTransactionId || entry.pendingRecipientAadhaarTransactionId !== payload.transactionId.trim()) {
        return NextResponse.json({ error: 'Aadhaar verification session expired. Please request a fresh OTP.' }, { status: 409 });
      }

      const verified = await verifyAadhaarOtp({
        identityType,
        identityValue,
        otp: payload.otp.trim(),
        transactionId: payload.transactionId.trim(),
        signerName: payload.signerName?.trim(),
        documentId: entry.id,
        shareId: entry.shareId,
        referenceNumber: entry.referenceNumber,
      });

      const verifiedIp = getRequestIp(request);
      const updated = await updateHistoryEntry(entry.id, (current) => ({
        ...current,
        recipientAadhaarVerificationRequired: true,
        recipientAadhaarVerifiedAt: new Date().toISOString(),
        recipientAadhaarVerifiedIp: verifiedIp,
        recipientAadhaarReferenceId: verified.referenceId,
        recipientAadhaarMaskedId: verified.maskedId,
        recipientAadhaarVerificationMode: 'otp',
        recipientAadhaarProviderLabel: verified.providerLabel,
        pendingRecipientAadhaarTransactionId: undefined,
        pendingRecipientAadhaarMaskedId: undefined,
        pendingRecipientAadhaarRequestedAt: undefined,
        accessEvents: [
          createAccessEvent({
            eventType: 'verify',
            createdAt: new Date().toISOString(),
            ip: verifiedIp,
            userAgent: getRequestUserAgent(request),
            deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
            actorName: payload.signerName?.trim() || 'Recipient',
          }),
          ...(current.accessEvents || []),
        ].slice(0, 50),
        automationNotes: [...(current.automationNotes || []), 'Aadhaar verification completed before signing'],
      }));

      return NextResponse.json({
        verified: true,
        verifiedAt: updated?.recipientAadhaarVerifiedAt,
        verifiedIp: updated?.recipientAadhaarVerifiedIp,
        referenceId: updated?.recipientAadhaarReferenceId,
        maskedId: updated?.recipientAadhaarMaskedId,
        providerLabel: updated?.recipientAadhaarProviderLabel,
        verificationMode: updated?.recipientAadhaarVerificationMode,
        message: verified.message,
      });
    }

    return NextResponse.json({ error: 'Unsupported Aadhaar action.' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to process Aadhaar verification.' }, { status: 500 });
  }
}
