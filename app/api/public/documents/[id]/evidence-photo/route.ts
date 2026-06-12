import { NextRequest, NextResponse } from 'next/server';
import { createAccessEvent, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';

export const dynamic = 'force-dynamic';

function isValidImageDataUrl(value: string | undefined) {
  return Boolean(value && /^data:image\/(png|jpeg|jpg);base64,/i.test(value));
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await request.json() as {
      password?: string;
      token?: string;
      signerKey?: string;
      photoDataUrl?: string;
      capturedAt?: string;
    };

    if (!isValidImageDataUrl(payload.photoDataUrl)) {
      return NextResponse.json({ error: 'A live camera capture is required. Uploaded images are not allowed.' }, { status: 400 });
    }
    const photoDataUrl = String(payload.photoDataUrl);

    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (!entry.recipientSignatureRequired) {
      return NextResponse.json({ error: 'This document does not require recipient signing.' }, { status: 400 });
    }
    if (entry.recipientSignedAt) {
      return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 });
    }
    const normalizePassword = (value?: string | null) => String(value || '').trim().toUpperCase();
    const signingToken = String(payload.token || '').trim();
    let tokenSignerKey: string | null = null;
    let tokenValid = false;
    if (signingToken && entry.recipientSignerInvitesByKey && typeof entry.recipientSignerInvitesByKey === 'object') {
      for (const [signerKey, invite] of Object.entries(entry.recipientSignerInvitesByKey)) {
        if (!invite || typeof invite !== 'object') continue;
        if (String((invite as any).token || '') !== signingToken) continue;
        const expiresAt = String((invite as any).expiresAt || '');
        if (expiresAt && new Date(expiresAt).getTime() < Date.now()) break;
        tokenSignerKey = String(signerKey).slice(0, 64);
        tokenValid = true;
        break;
      }
    }

    if (!tokenValid) {
      if (!normalizePassword(entry.sharePassword)) {
        return NextResponse.json({ error: 'Signing password is not configured for this document' }, { status: 409 });
      }
      if (!payload.password?.trim()) {
        return NextResponse.json({ error: 'Signing password is required before capturing evidence.' }, { status: 400 });
      }
      if (normalizePassword(entry.sharePassword) !== normalizePassword(payload.password)) {
        return NextResponse.json({ error: 'Invalid signing password' }, { status: 403 });
      }
    }

    const normalizedSignerKey = tokenSignerKey || (String(payload.signerKey || 'recipient').trim().slice(0, 64) || 'recipient');
    const signerCfg = entry.recipientSignerConfigsByKey?.[normalizedSignerKey];
    if (signerCfg?.cameraCaptureEnabled === false) {
      return NextResponse.json({ error: 'Camera capture is disabled for this signer.' }, { status: 403 });
    }
    if (Array.isArray(entry.recipientSigners) && entry.recipientSigners.some((s) => s.signerKey === normalizedSignerKey && s.signingStatus === 'signed')) {
      return NextResponse.json({ error: 'This signer has already completed signing.' }, { status: 409 });
    }
    const captureToken = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const capturedIp = getRequestIp(request);
    const capturedAt = payload.capturedAt ? new Date(payload.capturedAt).toISOString() : new Date().toISOString();
    const updated = await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      pendingRecipientEvidenceBySignerKey: {
        ...(current.pendingRecipientEvidenceBySignerKey || {}),
        [normalizedSignerKey]: {
          photoDataUrl,
          capturedAt,
          capturedIp,
          captureToken,
        },
      },
      pendingRecipientPhotoDataUrl: photoDataUrl,
      pendingRecipientPhotoCapturedAt: capturedAt,
      pendingRecipientPhotoCapturedIp: capturedIp,
      pendingRecipientPhotoCaptureToken: captureToken,
      accessEvents: [
        createAccessEvent({
          eventType: 'camera_capture',
          createdAt: new Date().toISOString(),
          ip: capturedIp,
          userAgent: getRequestUserAgent(request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
          actorName: normalizedSignerKey,
        }),
        ...(current.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [...(current.automationNotes || []), 'Live signer photo evidence captured'],
    }));

    return NextResponse.json({
      evidenceCaptureToken: updated?.pendingRecipientPhotoCaptureToken || captureToken,
      photoDataUrl: updated?.pendingRecipientPhotoDataUrl || payload.photoDataUrl,
      capturedAt: updated?.pendingRecipientPhotoCapturedAt || capturedAt,
      capturedIp: updated?.pendingRecipientPhotoCapturedIp || capturedIp,
      captureMethod: 'live_camera',
      signerKey: normalizedSignerKey,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to capture live signer photo.' }, { status: 500 });
  }
}
