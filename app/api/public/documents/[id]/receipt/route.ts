import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib';
import { createAccessEvent, getHistoryEntries, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatLocalDate(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function buildPolicyLabel(entry: { shareAccessPolicy?: string; shareExpiresAt?: string; maxAccessCount?: number }) {
  if (entry.shareAccessPolicy === 'expiring') {
    return entry.shareExpiresAt ? `Expiring (expires ${formatLocalDate(entry.shareExpiresAt)})` : 'Expiring';
  }
  if (entry.shareAccessPolicy === 'one_time') {
    return `One-time (${Math.max(1, Number(entry.maxAccessCount || 1))} max)`;
  }
  return 'Standard';
}

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

async function getEmbeddedBrandLogoSrc() {
  const logoPath = path.join(process.cwd(), 'public', 'docrud-logo.png');
  const logoBuffer = await fs.readFile(logoPath);
  return `data:image/png;base64,${logoBuffer.toString('base64')}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const splitLongToken = (token: string) => {
    const segments: string[] = [];
    let cursor = '';
    for (const char of token) {
      const candidate = cursor + char;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        cursor = candidate;
        continue;
      }
      if (cursor) segments.push(cursor);
      cursor = char;
    }
    if (cursor) segments.push(cursor);
    return segments.length ? segments : [token];
  };

  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      splitLongToken(word).forEach((seg) => lines.push(seg));
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawWrappedText(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    maxWidth: number;
    color: ReturnType<typeof rgb>;
    lineGap?: number;
  },
) {
  const lines = wrapText(text, options.font, options.size, options.maxWidth);
  let cursorY = options.y;
  const lineGap = options.lineGap ?? 3;
  for (const line of lines) {
    page.drawText(line, { x: options.x, y: cursorY, font: options.font, size: options.size, color: options.color });
    cursorY -= options.size + lineGap;
  }
  return { lines, nextY: cursorY };
}

function buildReceiptModel(entry: Awaited<ReturnType<typeof getHistoryEntries>>[number]) {
  const docLabel = entry.documentSourceType === 'uploaded_pdf'
    ? (entry.uploadedPdfFileName || entry.templateName || 'Uploaded PDF')
    : (entry.templateName || 'Document');

  const executionRecordId = entry.shareId || entry.id;
  const envelopeId = entry.shareId || '';
  const documentId = entry.id;
  const policyLabel = buildPolicyLabel(entry);

  const signers = Array.isArray(entry.recipientSigners) && entry.recipientSigners.length
    ? entry.recipientSigners
    : (entry.recipientSignerName || entry.recipientSignedAt ? [{
        signerKey: 'recipient',
        signerName: entry.recipientSignerName || 'Signer',
        signerEmail: entry.recipientSignerEmail || entry.emailTo || '',
        signingStatus: entry.recipientSignedAt ? 'signed' as const : 'pending' as const,
        signedAt: entry.recipientSignedAt,
        signedIp: entry.recipientSignedIp,
        signedLocationLabel: entry.recipientSignedLocationLabel,
        signedLatitude: entry.recipientSignedLatitude,
        signedLongitude: entry.recipientSignedLongitude,
        signedAccuracyMeters: entry.recipientSignedAccuracyMeters,
        authenticationMethods: [
          entry.shareRequiresPassword !== false ? 'Access password' : null,
          entry.recipientPhotoDataUrl ? 'Live photo evidence' : null,
          entry.recipientSignedLatitude && entry.recipientSignedLongitude ? 'Live location capture' : null,
          entry.recipientAadhaarVerifiedAt ? 'Aadhaar OTP verification' : null,
        ].filter(Boolean) as string[],
        photoDataUrl: entry.recipientPhotoDataUrl,
        photoCapturedAt: entry.recipientPhotoCapturedAt,
        photoCapturedIp: entry.recipientPhotoCapturedIp,
        photoCaptureMethod: entry.recipientPhotoCaptureMethod,
        consentedAt: entry.recipientConsentedAt,
        consentText: entry.recipientConsentText,
        signatureBoxSummary: entry.recipientSignatureBoxSummary,
      }] : []);

  const auditRows = (entry.accessEvents || [])
    .slice(0, 50)
    .map((ev) => ({
      at: formatLocalDate(ev.createdAt),
      type: ev.eventType,
      actor: ev.actorName || '',
      ip: ev.ip || '',
      device: ev.deviceLabel || '',
      ua: ev.userAgent || '',
    }));
  const reminderRows = (entry.recipientReminderHistory || [])
    .slice(0, 50)
    .map((ev) => ({
      at: formatLocalDate(ev.sentAt),
      type: ev.status === 'failed' ? 'reminder_failed' : 'reminder_sent',
      actor: ev.sentBy ? `${ev.sentBy}${ev.signerKey ? ` (${ev.signerKey})` : ''}` : (ev.signerKey || ''),
      ip: '',
      device: '',
      ua: ev.toEmail || '',
    }));

  const metaRows = [
    { label: 'Document', value: docLabel },
    ...(entry.referenceNumber ? [{ label: 'Reference', value: entry.referenceNumber }] : []),
    ...(entry.generatedAt ? [{ label: 'Generated', value: formatLocalDate(entry.generatedAt) }] : []),
    { label: 'Execution record / envelope', value: executionRecordId },
    { label: 'Link policy', value: policyLabel },
    ...(entry.shareUrl ? [{ label: 'Share URL', value: entry.shareUrl }] : []),
    ...(documentId ? [{ label: 'Document ID', value: documentId }] : []),
    ...(envelopeId ? [{ label: 'Envelope ID', value: envelopeId }] : []),
  ];

  const signerModels = signers.map((signer) => {
    const signedAt = signer.signedAt ? formatLocalDate(signer.signedAt) : '';
    const consentedAt = signer.consentedAt ? formatLocalDate(signer.consentedAt) : '';
    const status = signer.signingStatus === 'signed' ? 'Signed' : 'Pending';
    const auth = Array.isArray(signer.authenticationMethods) ? signer.authenticationMethods.filter(Boolean) : [];
    const consentNotRequired = auth.some((method) => /consent/i.test(method) && /not required/i.test(method));
    const fieldsSummary = signer.signatureBoxSummary
      ? `${signer.signatureBoxSummary.completedBoxes}/${signer.signatureBoxSummary.totalBoxes} fields completed (${signer.signatureBoxSummary.requiredBoxes} required)`
      : (entry.recipientSignatureRequired ? 'Signature completed' : 'Signature not required');
    const consentSummary = consentNotRequired
      ? 'Consent confirmation was not required for this signer.'
      : (consentedAt ? `Accepted at ${consentedAt}` : (signedAt ? `Accepted at ${signedAt}` : 'Accepted'));
    const signerRows = [
      { label: 'Signer key', value: signer.signerKey || 'recipient' },
      { label: 'Signer name', value: signer.signerName || 'Signer' },
      ...(signer.signerEmail ? [{ label: 'Signer email', value: signer.signerEmail }] : []),
      { label: 'Signing status', value: status },
      ...(signedAt ? [{ label: 'Signed at', value: signedAt }] : []),
      ...(signer.signedIp ? [{ label: 'Signer IP', value: signer.signedIp }] : []),
      ...(signer.signedLocationLabel ? [{ label: 'Signer location', value: signer.signedLocationLabel }] : []),
      ...(auth.length ? [{ label: 'Authentication', value: auth.join(' • ') }] : []),
      ...(entry.recipientAadhaarMaskedId ? [{ label: 'Aadhaar', value: entry.recipientAadhaarMaskedId }] : []),
      { label: 'Fields completed', value: fieldsSummary },
      { label: 'Acceptance / consent', value: consentSummary },
    ];
    return {
      signerKey: signer.signerKey || 'recipient',
      status,
      signerRows,
      acceptanceText: signer.consentText
        || (consentNotRequired ? 'Consent confirmation was not required for this signer.' : '')
        || entry.recipientConsentText
        || 'Signer provided consent to electronic signing and audit evidence capture.',
      photoDataUrl: signer.photoDataUrl || '',
      photoCapturedAt: signer.photoCapturedAt ? formatLocalDate(signer.photoCapturedAt) : '',
      photoCapturedIp: signer.photoCapturedIp || '',
    };
  });

  return {
    docLabel,
    executionRecordId,
    documentId,
    envelopeId,
    policyLabel,
    metaRows,
    auditRows: [...reminderRows, ...auditRows].slice(0, 70),
    status: entry.recipientSignedAt ? 'Signed' : 'Pending',
    signerModels,
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const internal = request.nextUrl.searchParams.get('internal') === '1';
    const requestedSignerKey = request.nextUrl.searchParams.get('signerKey')?.trim().slice(0, 64) || '';
    const password = request.nextUrl.searchParams.get('password')?.trim().toUpperCase();
    const signingToken = request.nextUrl.searchParams.get('token')?.trim() || '';
    const entry = await getHistoryEntryById(params.id);
    if (!entry) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const normalizePassword = (value?: string | null) => String(value || '').trim().toUpperCase();
    const tokenValid = (() => {
      if (!signingToken) return false;
      if (!entry.recipientSignerInvitesByKey || typeof entry.recipientSignerInvitesByKey !== 'object') return false;
      for (const invite of Object.values(entry.recipientSignerInvitesByKey)) {
        if (!invite || typeof invite !== 'object') continue;
        if (String((invite as any).token || '') !== signingToken) continue;
        const expiresAt = String((invite as any).expiresAt || '');
        if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return false;
        return true;
      }
      return false;
    })();
    const requiresPassword = !tokenValid && entry.shareRequiresPassword !== false && Boolean(normalizePassword(entry.sharePassword));
    if (requiresPassword && !password) {
      return NextResponse.json({ error: 'Document password is required' }, { status: 400 });
    }
    if (requiresPassword && normalizePassword(entry.sharePassword) !== normalizePassword(password)) {
      return NextResponse.json({ error: 'Invalid document password' }, { status: 403 });
    }
    const accessError = getShareAccessError(entry);
    if (accessError) {
      return NextResponse.json({ error: accessError }, { status: 410 });
    }
    const allowPartialSignerReceipt = (() => {
      if (entry.recipientSignedAt) return true;
      if (!requestedSignerKey) return false;
      const signer = (entry.recipientSigners || []).find((s) => String((s as any)?.signerKey || '') === requestedSignerKey);
      return Boolean(signer && (signer as any).signingStatus === 'signed');
    })();
    if (!allowPartialSignerReceipt) {
      return NextResponse.json({ error: 'Signature receipt is available only after signing is completed.' }, { status: 409 });
    }

    const includeBranding = entry.editorState?.signatureCertificateBrandingEnabled !== false;
    const logoSrc = includeBranding ? await getEmbeddedBrandLogoSrc().catch(() => undefined) : undefined;

    const model = buildReceiptModel(entry);

    if (!internal && model.signerModels.length > 1 && !requestedSignerKey) {
      return NextResponse.json({ error: 'Signer key is required for this signature receipt.' }, { status: 400 });
    }
    if (requestedSignerKey) {
      model.signerModels = model.signerModels.filter((s) => String(s.signerKey) === requestedSignerKey);
      if (!model.signerModels.length) {
        return NextResponse.json({ error: 'Signer not found for this receipt.' }, { status: 404 });
      }
      model.auditRows = model.auditRows.filter((row) => {
        const actor = String(row.actor || '');
        return actor.includes(`(${requestedSignerKey})`) || actor.includes(requestedSignerKey) || actor === '' || actor === 'System';
      });
    }
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const embeddedSignerPhotos: Record<string, { image: any; width: number; height: number } | null> = {};
    for (const signer of model.signerModels) {
      const key = `${signer.signerKey}`;
      const photoDataUrl = String(signer.photoDataUrl || '');
      if (!/^data:image\/(png|jpeg|jpg);base64,/i.test(photoDataUrl)) {
        embeddedSignerPhotos[key] = null;
        continue;
      }
      const mime = photoDataUrl.split(';')[0]?.slice(5) || '';
      const bytes = Buffer.from(photoDataUrl.split(',')[1] || '', 'base64');
      const embedded = mime.includes('png')
        ? await pdfDoc.embedPng(bytes).catch(() => null)
        : await pdfDoc.embedJpg(bytes).catch(() => null);
      embeddedSignerPhotos[key] = embedded ? { image: embedded, width: embedded.width, height: embedded.height } : null;
    }

    const A4 = { width: 595.28, height: 841.89 };
    const margin = 40;
    const cardGap = 14;
    const cardPadding = 14;
    const borderColor = rgb(15 / 255, 23 / 255, 42 / 255);
    const borderAlpha = 0.12;

    const drawWatermark = (targetPage: ReturnType<PDFDocument['addPage']>) => {
      const cx = A4.width / 2;
      const cy = A4.height / 2;
      targetPage.drawText('DocRud', {
        x: cx - 160,
        y: cy + 60,
        font: fontBold,
        size: 64,
        color: rgb(0.06, 0.09, 0.16),
        rotate: degrees(32),
        opacity: 0.05,
      });
      targetPage.drawText('SIGNED', {
        x: cx - 110,
        y: cy - 10,
        font: fontBold,
        size: 44,
        color: rgb(0.06, 0.09, 0.16),
        rotate: degrees(32),
        opacity: 0.06,
      });
    };

    const addReceiptPage = () => {
      const next = pdfDoc.addPage([A4.width, A4.height]);
      drawWatermark(next);
      return next;
    };

    let page = addReceiptPage();
    let cursorY = A4.height - margin;

    const ensureSpace = (heightNeeded: number) => {
      if (cursorY - heightNeeded >= margin) return;
      page = addReceiptPage();
      cursorY = A4.height - margin;
    };

    const drawKicker = (text: string) => {
      page.drawText(text, { x: margin, y: cursorY, font: fontBold, size: 9.5, color: rgb(0.25, 0.29, 0.36) });
      cursorY -= 16;
    };

    const drawHeader = async () => {
      ensureSpace(86);
      if (includeBranding && logoSrc?.startsWith('data:image/png;base64,')) {
        const bytes = Buffer.from(logoSrc.replace(/^data:image\/png;base64,/, ''), 'base64');
        const img = await pdfDoc.embedPng(bytes).catch(() => null);
        if (img) {
          const targetH = 18;
          const scale = targetH / img.height;
          page.drawImage(img, { x: margin, y: cursorY - targetH + 2, width: img.width * scale, height: targetH });
        }
      }

      const headerLeftX = margin + (includeBranding ? 64 : 0);
      page.drawText('SIGNATURE RECEIPT & ACCEPTANCE DETAILS', { x: headerLeftX, y: cursorY, font: fontBold, size: 9, color: rgb(0.35, 0.38, 0.44) });
      cursorY -= 18;

      const titleLines = wrapText(model.docLabel, fontBold, 16, A4.width - margin - headerLeftX - 90);
      for (const line of titleLines.slice(0, 2)) {
        page.drawText(line, { x: headerLeftX, y: cursorY, font: fontBold, size: 16, color: rgb(0.06, 0.09, 0.16) });
        cursorY -= 20;
      }

      const sub = entry.referenceNumber ? `Reference: ${entry.referenceNumber}` : `Execution record: ${model.executionRecordId}`;
      drawWrappedText(page, sub, { x: headerLeftX, y: cursorY, font: fontRegular, size: 10.5, maxWidth: A4.width - margin - headerLeftX - 90, color: rgb(0.25, 0.29, 0.36), lineGap: 3 });

      const pillText = model.status.toUpperCase();
      const pillW = Math.min(120, fontBold.widthOfTextAtSize(pillText, 10) + 16);
      const pillX = A4.width - margin - pillW;
      page.drawRectangle({ x: pillX, y: A4.height - margin - 24, width: pillW, height: 20, borderColor, borderWidth: 1, borderOpacity: borderAlpha, color: rgb(0.96, 0.97, 0.99) });
      page.drawText(pillText, { x: pillX + 8, y: A4.height - margin - 18, font: fontBold, size: 10, color: rgb(0.25, 0.29, 0.36) });

      cursorY -= 18;
      page.drawLine({ start: { x: margin, y: cursorY }, end: { x: A4.width - margin, y: cursorY }, thickness: 1, color: borderColor, opacity: borderAlpha });
      cursorY -= 18;
    };

    const estimateKeyValueRowsHeight = (rows: Array<{ label: string; value: string }>, width: number) => {
      const keyW = Math.min(160, width * 0.36);
      const valW = width - keyW - 14;
      const keySize = 10;
      const valSize = 10;
      let height = 0;
      for (const row of rows) {
        const keyLines = wrapText(row.label, fontRegular, keySize, keyW);
        const valLines = wrapText(row.value, fontBold, valSize, valW);
        const lineCount = Math.max(keyLines.length, valLines.length);
        height += lineCount * (valSize + 3) + 6;
      }
      return height;
    };

    const drawCard = (title: string, estimatedBodyHeight: number, drawBody: (x: number, yTop: number, width: number) => void) => {
      const cardWidth = A4.width - margin * 2;
      const estimatedCardHeight = Math.max(56, cardPadding + 16 + estimatedBodyHeight + cardPadding);
      ensureSpace(estimatedCardHeight + cardGap);
      const cardTopY = cursorY;
      const x = margin;
      const bodyTop = cardTopY - cardPadding - 16;
      const cardHeight = estimatedCardHeight;

      // Background + border (draw after computing height)
      page.drawRectangle({
        x,
        y: cardTopY - cardHeight,
        width: cardWidth,
        height: cardHeight,
        borderColor,
        borderWidth: 1,
        borderOpacity: borderAlpha,
        color: rgb(1, 1, 1),
      });

      page.drawText(title.toUpperCase(), { x: x + cardPadding, y: cardTopY - cardPadding - 10, font: fontBold, size: 9.5, color: rgb(0.35, 0.38, 0.44) });
      drawBody(x + cardPadding, bodyTop, cardWidth - cardPadding * 2);

      cursorY = (cardTopY - cardHeight) - cardGap;
    };

    const drawKeyValueRows = (rows: Array<{ label: string; value: string }>, startY: number, width: number) => {
      const keyW = Math.min(160, width * 0.36);
      const valW = width - keyW - 14;
      const keyX = margin + cardPadding;
      const valX = keyX + keyW + 14;
      let y = startY;
      const keySize = 10;
      const valSize = 10;

      for (const row of rows) {
        const keyLines = wrapText(row.label, fontRegular, keySize, keyW);
        const valLines = wrapText(row.value, fontBold, valSize, valW);
        const lineCount = Math.max(keyLines.length, valLines.length);
        const rowHeight = lineCount * (valSize + 3) + 6;

        // subtle separator
        page.drawLine({ start: { x: margin + cardPadding, y: y - 6 }, end: { x: margin + cardPadding + width, y: y - 6 }, thickness: 1, color: borderColor, opacity: 0.06 });

        let rowY = y;
        for (let i = 0; i < lineCount; i += 1) {
          const k = keyLines[i] || '';
          const v = valLines[i] || '';
          page.drawText(k, { x: keyX, y: rowY, font: fontRegular, size: keySize, color: rgb(0.35, 0.38, 0.44) });
          page.drawText(v, { x: valX, y: rowY, font: fontBold, size: valSize, color: rgb(0.06, 0.09, 0.16) });
          rowY -= valSize + 3;
        }
        y -= rowHeight;
      }
      return y;
    };

    await drawHeader();

    const signerCardWidth = A4.width - margin * 2 - cardPadding * 2;
    for (const signer of model.signerModels) {
      const acceptanceLines = wrapText(signer.acceptanceText, fontRegular, 10, signerCardWidth - 132);
      const signerCardEstimatedBody =
        estimateKeyValueRowsHeight(signer.signerRows, signerCardWidth - 132)
        + 8
        + (acceptanceLines.length * (10 + 3) + 18)
        + 16;

      drawCard(`Signer details — ${signer.signerKey}`, signerCardEstimatedBody, (_x, yTop, width) => {
        const photoBoxW = 118;
        const photoBoxH = 140;
        const contentW = width - photoBoxW - 14;

        // Photo panel
        page.drawRectangle({
          x: margin + cardPadding + contentW + 14,
          y: yTop - photoBoxH + 10,
          width: photoBoxW,
          height: photoBoxH,
          borderColor,
          borderWidth: 1,
          borderOpacity: 0.10,
          color: rgb(1, 1, 1),
        });

        const embedded = embeddedSignerPhotos[`${signer.signerKey}`];
        if (embedded) {
          const scale = Math.min(photoBoxW / embedded.width, photoBoxH / embedded.height);
          const w = embedded.width * scale;
          const h = embedded.height * scale;
          page.drawImage(embedded.image, {
            x: margin + cardPadding + contentW + 14 + (photoBoxW - w) / 2,
            y: (yTop - photoBoxH + 10) + (photoBoxH - h) / 2,
            width: w,
            height: h,
          });
        } else {
          page.drawText('NO PHOTO', { x: margin + cardPadding + contentW + 14 + 20, y: yTop - 60, font: fontBold, size: 9, color: rgb(0.55, 0.58, 0.64) });
        }

        let y = yTop;
        y = drawKeyValueRows(signer.signerRows, y, contentW);
        y -= 8;
        const blockH = acceptanceLines.length * (10 + 3) + 18;
        page.drawRectangle({
          x: margin + cardPadding,
          y: y - blockH + 12,
          width: contentW,
          height: blockH,
          borderColor,
          borderWidth: 1,
          borderOpacity: 0.08,
          color: rgb(0.96, 0.97, 0.99),
        });
        drawWrappedText(page, signer.acceptanceText, { x: margin + cardPadding + 10, y: y + 2, font: fontRegular, size: 10, maxWidth: contentW - 20, color: rgb(0.12, 0.15, 0.22), lineGap: 3 });
      });
    }

    const metaCardWidth = A4.width - margin * 2 - cardPadding * 2;
    const metaEstimatedBody = estimateKeyValueRowsHeight(model.metaRows, metaCardWidth) + 8;
    drawCard('Document metadata', metaEstimatedBody, (_x, yTop, width) => {
      drawKeyValueRows(model.metaRows, yTop, width);
    });

    // Audit trail table: may span pages; we draw as its own flow (not in card to simplify pagination).
    drawKicker('AUDIT TRAIL');
    const col = {
      time: 90,
      event: 56,
      actor: 74,
      ip: 68,
      device: 84,
      ua: (A4.width - margin * 2) - (90 + 56 + 74 + 68 + 84 + 20),
    };
    const tableX = margin;
    const rowFontSize = 9;
    const headerFontSize = 9;
    const drawAuditHeader = () => {
      ensureSpace(28);
      const y = cursorY;
      const headerColor = rgb(0.35, 0.38, 0.44);
      page.drawText('TIME', { x: tableX, y, font: fontBold, size: headerFontSize, color: headerColor });
      page.drawText('EVENT', { x: tableX + col.time, y, font: fontBold, size: headerFontSize, color: headerColor });
      page.drawText('ACTOR', { x: tableX + col.time + col.event, y, font: fontBold, size: headerFontSize, color: headerColor });
      page.drawText('IP', { x: tableX + col.time + col.event + col.actor, y, font: fontBold, size: headerFontSize, color: headerColor });
      page.drawText('DEVICE', { x: tableX + col.time + col.event + col.actor + col.ip, y, font: fontBold, size: headerFontSize, color: headerColor });
      page.drawText('USER AGENT', { x: tableX + col.time + col.event + col.actor + col.ip + col.device, y, font: fontBold, size: headerFontSize, color: headerColor });
      cursorY -= 16;
      page.drawLine({ start: { x: margin, y: cursorY }, end: { x: A4.width - margin, y: cursorY }, thickness: 1, color: borderColor, opacity: 0.10 });
      cursorY -= 10;
    };

    drawAuditHeader();
    if (!model.auditRows.length) {
      ensureSpace(20);
      page.drawText('No audit events recorded.', { x: margin, y: cursorY, font: fontRegular, size: 10, color: rgb(0.35, 0.38, 0.44) });
      cursorY -= 16;
    } else {
      for (const row of model.auditRows) {
        const timeLines = wrapText(row.at, fontRegular, rowFontSize, col.time - 6);
        const eventLines = wrapText(row.type, fontRegular, rowFontSize, col.event - 6);
        const actorLines = wrapText(row.actor, fontRegular, rowFontSize, col.actor - 6);
        const ipLines = wrapText(row.ip, fontRegular, rowFontSize, col.ip - 6);
        const deviceLines = wrapText(row.device, fontRegular, rowFontSize, col.device - 6);
        const uaLines = wrapText(row.ua, fontRegular, rowFontSize, col.ua - 6);
        const lines = Math.max(timeLines.length, eventLines.length, actorLines.length, ipLines.length, deviceLines.length, uaLines.length);
        const rowH = lines * (rowFontSize + 3) + 10;
        if (cursorY - rowH < margin) {
          page = addReceiptPage();
          cursorY = A4.height - margin;
          drawAuditHeader();
        }
        const baseY = cursorY;
        for (let i = 0; i < lines; i += 1) {
          const y = baseY - i * (rowFontSize + 3);
          page.drawText(timeLines[i] || '', { x: tableX, y, font: fontRegular, size: rowFontSize, color: rgb(0.25, 0.29, 0.36) });
          page.drawText(eventLines[i] || '', { x: tableX + col.time, y, font: fontRegular, size: rowFontSize, color: rgb(0.06, 0.09, 0.16) });
          page.drawText(actorLines[i] || '', { x: tableX + col.time + col.event, y, font: fontRegular, size: rowFontSize, color: rgb(0.06, 0.09, 0.16) });
          page.drawText(ipLines[i] || '', { x: tableX + col.time + col.event + col.actor, y, font: fontRegular, size: rowFontSize, color: rgb(0.06, 0.09, 0.16) });
          page.drawText(deviceLines[i] || '', { x: tableX + col.time + col.event + col.actor + col.ip, y, font: fontRegular, size: rowFontSize, color: rgb(0.06, 0.09, 0.16) });
          page.drawText(uaLines[i] || '', { x: tableX + col.time + col.event + col.actor + col.ip + col.device, y, font: fontRegular, size: rowFontSize, color: rgb(0.06, 0.09, 0.16) });
        }
        cursorY -= rowH;
        page.drawLine({ start: { x: margin, y: cursorY + 4 }, end: { x: A4.width - margin, y: cursorY + 4 }, thickness: 1, color: borderColor, opacity: 0.06 });
        cursorY -= 6;
      }
    }

    const pdfBytes = await pdfDoc.save();

    if (!internal) {
      await updateHistoryEntry(entry.id, (current) => ({
        ...current,
        accessEvents: [
          createAccessEvent({
            eventType: 'download',
            createdAt: new Date().toISOString(),
            ip: getRequestIp(request),
            userAgent: getRequestUserAgent(request),
            deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
            actorName: current.recipientSignerName || undefined,
          }),
          ...(current.accessEvents || []),
        ].slice(0, 50),
        automationNotes: [...(current.automationNotes || []), 'Signature receipt downloaded'],
      }));
    }

    const safeName = (entry.templateName || entry.uploadedPdfFileName || 'signature-receipt')
      .replace(/\s+/g, '_')
      .replace(/\.pdf$/i, '');

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=${safeName}-signature-receipt.pdf`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to generate signature receipt' }, { status: 500 });
  }
}
