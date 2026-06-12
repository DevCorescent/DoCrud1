import { PDFDocument, PDFPage, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

function sha256Hex(bytes: Uint8Array) {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

async function tryLoadPublicAssetBytes(relativePathFromPublic: string) {
  try {
    const filePath = path.join(process.cwd(), 'public', relativePathFromPublic);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL');
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], 'base64'),
  };
}

function buildPdfDataUrl(bytes: Uint8Array) {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
}

async function normalizeSignatureImageBytes(input: { mimeType: string; bytes: Buffer }) {
  // Keep the signature bytes as-is. The signature capture flow produces a transparent PNG
  // so it stamps cleanly without a white rectangle.
  return input;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
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

  words.forEach((word) => {
    // Hard-wrap long tokens (hashes, reference ids, long URLs) so they do not overflow the card.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      splitLongToken(word).forEach((segment) => {
        if (segment) lines.push(segment);
      });
      return;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawWrappedParagraph(
  page: PDFPage,
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

  lines.forEach((line) => {
    page.drawText(line, {
      x: options.x,
      y: cursorY,
      size: options.size,
      font: options.font,
      color: options.color,
    });
    cursorY -= options.size + lineGap;
  });

  return {
    lines,
    nextY: cursorY,
  };
}

function drawWatermarkOnPage(page: PDFPage, font: PDFFont, watermarkLabel: string) {
  const normalized = watermarkLabel.trim().slice(0, 48);
  if (!normalized) {
    return;
  }

  const { width, height } = page.getSize();
  page.drawText(normalized, {
    x: width * 0.18,
    y: height * 0.48,
    size: Math.min(width * 0.09, 64),
    font,
    color: rgb(0.8, 0.83, 0.88),
    rotate: { angle: -0.6, type: 'degrees' } as never,
    opacity: 0.18,
  });
}

async function drawWatermark(pdfDoc: PDFDocument, watermarkLabel: string | undefined) {
  if (!watermarkLabel?.trim()) {
    return;
  }

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  pdfDoc.getPages().forEach((page) => drawWatermarkOnPage(page, font, watermarkLabel));
}

function createCertificatePage(
  pdfDoc: PDFDocument,
  fonts: { heading: PDFFont; body: PDFFont },
  options: {
    continuation?: boolean;
    brandingEnabled?: boolean;
    docrudLogo?: Awaited<ReturnType<PDFDocument['embedPng']>> | null;
  },
) {
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  page.drawRectangle({
    x: 28,
    y: 28,
    width: width - 56,
    height: height - 56,
    color: rgb(0.985, 0.989, 0.995),
    borderColor: rgb(0.86, 0.89, 0.93),
    borderWidth: 1,
  });

  if (options.brandingEnabled) {
    page.drawText('DOCRUD', {
      x: 132,
      y: 402,
      size: 72,
      font: fonts.heading,
      color: rgb(0.87, 0.9, 0.95),
      rotate: { angle: -0.58, type: 'degrees' } as never,
      opacity: 0.1,
    });
  }

  page.drawRectangle({
    x: 28,
    y: height - 126,
    width: width - 56,
    height: 74,
    color: rgb(0.06, 0.08, 0.11),
  });

  const hasLogo = Boolean(options.brandingEnabled && options.docrudLogo);
  if (hasLogo && options.docrudLogo) {
    const targetHeight = 28;
    const scale = Math.min(targetHeight / options.docrudLogo.height, 1);
    const logoWidth = options.docrudLogo.width * scale;
    const logoHeight = options.docrudLogo.height * scale;
    page.drawImage(options.docrudLogo, {
      x: 54,
      y: height - 126 + (74 - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight,
      opacity: 0.98,
    });
  }

  page.drawText(options.continuation ? 'Signing Terms Continuation' : 'Recipient Signature and Acceptance Record', {
    x: hasLogo ? 230 : 54,
    y: height - 86,
    size: options.continuation ? 18 : 19,
    font: fonts.heading,
    color: rgb(1, 1, 1),
  });

  page.drawText(
    options.continuation
      ? 'Continuation of password-protected signing certificate and evidentiary notes'
      : 'Password-protected signing certificate and evidentiary summary',
    {
      x: hasLogo ? 230 : 54,
      y: height - 108,
      size: 10.2,
      font: fonts.body,
      color: rgb(0.83, 0.87, 0.92),
    },
  );

  if (options.brandingEnabled) {
    page.drawText('docrud', {
      x: width - 126,
      y: height - 90,
      size: 17,
      font: fonts.heading,
      color: rgb(0.85, 0.89, 0.95),
    });
    page.drawText('document operations certificate', {
      x: width - 194,
      y: height - 108,
      size: 7.8,
      font: fonts.body,
      color: rgb(0.72, 0.77, 0.83),
    });
  }

  return page;
}

export async function applyWatermarkToPdfDataUrl(originalPdfDataUrl: string, watermarkLabel?: string) {
  if (!watermarkLabel?.trim()) {
    return originalPdfDataUrl;
  }

  const pdfSource = decodeDataUrl(originalPdfDataUrl);
  const pdfDoc = await PDFDocument.load(pdfSource.bytes);
  await drawWatermark(pdfDoc, watermarkLabel);
  return buildPdfDataUrl(await pdfDoc.save());
}

export async function appendSignaturePageToUploadedPdf(input: {
  originalPdfDataUrl: string;
  signatureDataUrl: string;
  signerName: string;
  signedAt: string;
  signedIp?: string;
  signerPhotoDataUrl?: string;
  signerPhotoCapturedAt?: string;
  signerPhotoCapturedIp?: string;
  signedLocationLabel?: string;
  signedLatitude?: number;
  signedLongitude?: number;
  signedAccuracyMeters?: number;
  signatureSource?: 'drawn' | 'uploaded';
  documentTitle?: string;
  watermarkLabel?: string;
  signatureCertificateBrandingEnabled?: boolean;
  executionRecordId?: string;
  signerUserAgent?: string;
  aadhaarVerifiedAt?: string;
  aadhaarVerifiedIp?: string;
  aadhaarReferenceId?: string;
  aadhaarMaskedId?: string;
  aadhaarVerificationMode?: string;
  aadhaarProviderLabel?: string;
}) {
  const pdfSource = decodeDataUrl(input.originalPdfDataUrl);
  const signatureSource = decodeDataUrl(input.signatureDataUrl);
  const pdfDoc = await PDFDocument.load(pdfSource.bytes);
  const headingFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const originalPdfSha256 = sha256Hex(pdfSource.bytes);
  const signatureSha256 = sha256Hex(signatureSource.bytes);

  let signerPhotoSha256: string | null = null;
  if (input.signerPhotoDataUrl) {
    try {
      const photoSource = decodeDataUrl(input.signerPhotoDataUrl);
      signerPhotoSha256 = sha256Hex(photoSource.bytes);
    } catch {
      signerPhotoSha256 = null;
    }
}

  const docrudLogoBytes = await tryLoadPublicAssetBytes('docrud-logo.png');
  const embeddedDocrudLogo = docrudLogoBytes ? await pdfDoc.embedPng(docrudLogoBytes) : null;

  if (input.watermarkLabel?.trim()) {
    await drawWatermark(pdfDoc, input.watermarkLabel);
  }

  let embeddedSignature;
  if (signatureSource.mimeType === 'image/png') {
    embeddedSignature = await pdfDoc.embedPng(signatureSource.bytes);
  } else if (signatureSource.mimeType === 'image/jpeg' || signatureSource.mimeType === 'image/jpg') {
    embeddedSignature = await pdfDoc.embedJpg(signatureSource.bytes);
  } else {
    throw new Error('Unsupported signature image format. Please upload PNG or JPG.');
  }

  let embeddedSignerPhoto: Awaited<ReturnType<PDFDocument['embedPng']>> | Awaited<ReturnType<PDFDocument['embedJpg']>> | null = null;
  if (input.signerPhotoDataUrl) {
    const photoSource = decodeDataUrl(input.signerPhotoDataUrl);
    if (photoSource.mimeType === 'image/png') {
      embeddedSignerPhoto = await pdfDoc.embedPng(photoSource.bytes);
    } else if (photoSource.mimeType === 'image/jpeg' || photoSource.mimeType === 'image/jpg') {
      embeddedSignerPhoto = await pdfDoc.embedJpg(photoSource.bytes);
    }
  }

  const signedAtLocal = new Date(input.signedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const signedAtUtc = new Date(input.signedAt).toISOString().replace('T', ' ').replace('Z', ' UTC');
  const aadhaarLabel = input.aadhaarVerifiedAt
    ? `Verified (${input.aadhaarMaskedId || 'masked id not captured'})${input.aadhaarProviderLabel ? ` via ${input.aadhaarProviderLabel}` : ''}${input.aadhaarVerificationMode ? ` (${input.aadhaarVerificationMode})` : ''}${input.aadhaarReferenceId ? ` ref ${input.aadhaarReferenceId.slice(0, 24)}` : ''}`
    : 'Not captured';
  const ipMatchLabel = input.signerPhotoCapturedIp && input.signedIp
    ? input.signerPhotoCapturedIp === input.signedIp
      ? 'Matched'
      : 'Mismatch'
    : 'Not captured';

  const metadataLines = [
    `Execution record ID: ${input.executionRecordId || 'Not captured'}`,
    `Document title: ${input.documentTitle || 'Uploaded PDF Document'}`,
    `Signed by: ${input.signerName}`,
    `Signed at (local): ${signedAtLocal}`,
    `Signed at (UTC): ${signedAtUtc}`,
    `Signature method: ${input.signatureSource === 'uploaded' ? 'Uploaded image' : 'Drawn e-signature'}`,
    `Aadhaar verification: ${aadhaarLabel}`,
    `Signing IP: ${input.signedIp || 'Not captured'} (Photo IP match: ${ipMatchLabel})`,
    `Location label: ${input.signedLocationLabel || 'Not captured'}`,
    ...(typeof input.signedLatitude === 'number' && typeof input.signedLongitude === 'number'
      ? [
        `Location coordinates: ${input.signedLatitude.toFixed(6)}, ${input.signedLongitude.toFixed(6)}${typeof input.signedAccuracyMeters === 'number' ? ` (accuracy ~${Math.round(input.signedAccuracyMeters)}m)` : ''}`,
      ]
      : []),
  ];

  const evidenceLines = [
    `Document SHA-256: ${originalPdfSha256}`,
    `Signature image SHA-256: ${signatureSha256}`,
    `Live signer photo SHA-256: ${signerPhotoSha256 || (input.signerPhotoDataUrl ? 'Not available' : 'Not captured')}`,
    `Policy reference: /signed-document-policy`,
  ];

  const legalParagraphs = [
    '1. Consent and intent: By entering the required access password, reviewing the shared PDF, and submitting a signature, the signer confirms the signing action was performed intentionally and with the signer’s consent.',
    '2. Evidence captured: This appended certificate records operational evidence produced at signing time. Evidence may include signer-entered name, signature image, timestamps, IP address, location label and (when enabled) device-captured geolocation, and platform access-event logs.',
    '3. Live photo evidence (when enabled): Where a live camera capture is required, the signer photo is captured in-session and tied to the same network-origin controls required for submission. If origin controls fail, submission is blocked and a fresh capture is required.',
    '4. Integrity guidance: Retain the signed PDF together with this appended certificate as a single execution record. Any modification of the PDF may alter file fingerprints and reduce evidentiary value. For technical integrity checks, compare the SHA-256 values recorded on this certificate with the evidence retained by the relying party.',
    '5. Legal treatment varies: Electronic records and electronic signatures are treated differently across jurisdictions. This certificate is an operational record and is not legal advice or a universal guarantee of admissibility, validity, or enforceability for every instrument.',
    '6. India context: Certain transactions may require specific forms of electronic signature such as CCA-backed eSign, a Digital Signature Certificate, stamp duty handling, witnessing, notarisation, registration, or other regulated execution steps. Parties should confirm requirements before relying on any signing workflow.',
    '7. Global context: Depending on the jurisdiction and transaction, validity may be assessed under frameworks such as ESIGN / UETA (United States), eIDAS (European Union), and UNCITRAL model principles. Parties should align signature method, identity assurance, consent capture, and retention policy with the applicable standard.',
    '8. Recommended retention: Preserve surrounding context such as invitation email/SMS records, authority approvals, version history, and any supporting documents that establish the signer’s authority and the intent of the parties.',
  ];

  const scale = Math.min(260 / embeddedSignature.width, 110 / embeddedSignature.height, 1);
  const signatureWidth = embeddedSignature.width * scale;
  const signatureHeight = embeddedSignature.height * scale;
  const brandEnabled = input.signatureCertificateBrandingEnabled !== false;

  const firstPage = createCertificatePage(
    pdfDoc,
    { heading: headingFont, body: bodyFont },
    { brandingEnabled: brandEnabled, docrudLogo: embeddedDocrudLogo },
  );

  const { width, height } = firstPage.getSize();
  let cursorY = height - 156;
  const metadataFontSize = 9.6;
  const metadataLineGap = 2.6;
  const metadataMaxWidth = width - 148;
  const metadataLineCount = metadataLines.reduce(
    (sum, line) => sum + wrapText(line, bodyFont, metadataFontSize, metadataMaxWidth).length,
    0,
  );
  const metadataCardHeight = Math.min(260, 56 + metadataLineCount * (metadataFontSize + metadataLineGap) + 16);

  firstPage.drawRectangle({
    x: 54,
    y: cursorY - metadataCardHeight,
    width: width - 108,
    height: metadataCardHeight,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.88, 0.9, 0.94),
    borderWidth: 1,
  });

  firstPage.drawText('Signing event details', {
    x: 70,
    y: cursorY - 24,
    size: 11.5,
    font: headingFont,
    color: rgb(0.08, 0.11, 0.16),
  });

  let metaCursorY = cursorY - 50;
  metadataLines.forEach((line) => {
    const { nextY } = drawWrappedParagraph(firstPage, line, {
      x: 70,
      y: metaCursorY,
      font: bodyFont,
      size: metadataFontSize,
      maxWidth: metadataMaxWidth,
      color: rgb(0.25, 0.3, 0.37),
      lineGap: metadataLineGap,
    });
    metaCursorY = nextY - 4;
  });

  cursorY -= metadataCardHeight + 18;

  firstPage.drawText('Evidence fingerprints (SHA-256) and verification notes', {
    x: 54,
    y: cursorY,
    size: 11.2,
    font: headingFont,
    color: rgb(0.08, 0.11, 0.16),
  });
  cursorY -= 14;

  const evidenceFontSize = 8.6;
  const evidenceLineGap = 2.6;
  const evidenceMaxWidth = width - 148;
  const evidenceLineCount = evidenceLines.reduce(
    (sum, line) => sum + wrapText(line, bodyFont, evidenceFontSize, evidenceMaxWidth).length,
    0,
  );
  const evidenceCardHeight = Math.min(170, 34 + evidenceLineCount * (evidenceFontSize + evidenceLineGap) + 16);
  firstPage.drawRectangle({
    x: 54,
    y: cursorY - evidenceCardHeight,
    width: width - 108,
    height: evidenceCardHeight,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.88, 0.9, 0.94),
    borderWidth: 1,
  });

  let evidenceCursorY = cursorY - 18;
  evidenceLines.forEach((line) => {
    const { nextY } = drawWrappedParagraph(firstPage, line, {
      x: 70,
      y: evidenceCursorY,
      font: bodyFont,
      size: evidenceFontSize,
      maxWidth: evidenceMaxWidth,
      color: rgb(0.42, 0.47, 0.54),
      lineGap: evidenceLineGap,
    });
    evidenceCursorY = nextY - 4;
  });

  cursorY -= evidenceCardHeight + 16;

  firstPage.drawText('Accepted recipient signature', {
    x: 54,
    y: cursorY,
    size: 12,
    font: headingFont,
    color: rgb(0.08, 0.11, 0.16),
  });

  const signatureBoxTop = cursorY - 16;
  const signatureBoxHeight = 150;
  firstPage.drawRectangle({
    x: 54,
    y: signatureBoxTop - signatureBoxHeight,
    width: width - 108,
    height: signatureBoxHeight,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.88, 0.9, 0.94),
    borderWidth: 1,
  });

  firstPage.drawImage(embeddedSignature, {
    x: 70,
    y: signatureBoxTop - 18 - signatureHeight,
    width: signatureWidth,
    height: signatureHeight,
  });

  if (embeddedSignerPhoto) {
    const photoScale = Math.min(110 / embeddedSignerPhoto.width, 110 / embeddedSignerPhoto.height, 1);
    const photoWidth = embeddedSignerPhoto.width * photoScale;
    const photoHeight = embeddedSignerPhoto.height * photoScale;
    const photoBoxSize = 118;
    const photoBoxX = width - 54 - photoBoxSize - 16;
    const photoBoxY = signatureBoxTop - 16 - photoBoxSize;

    firstPage.drawRectangle({
      x: photoBoxX,
      y: photoBoxY,
      width: photoBoxSize,
      height: photoBoxSize,
      color: rgb(0.98, 0.99, 1),
      borderColor: rgb(0.88, 0.9, 0.94),
      borderWidth: 1,
    });

    firstPage.drawImage(embeddedSignerPhoto, {
      x: photoBoxX + (photoBoxSize - photoWidth) / 2,
      y: photoBoxY + (photoBoxSize - photoHeight) / 2,
      width: photoWidth,
      height: photoHeight,
    });

    firstPage.drawText('Live signer photo', {
      x: photoBoxX,
      y: photoBoxY + photoBoxSize + 8,
      size: 9,
      font: headingFont,
      color: rgb(0.25, 0.3, 0.37),
    });

    if (input.signerPhotoCapturedAt) {
      firstPage.drawText(
        new Date(input.signerPhotoCapturedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        {
          x: photoBoxX,
          y: photoBoxY - 14,
          size: 7.8,
          font: bodyFont,
          color: rgb(0.42, 0.47, 0.54),
        },
      );
    }
  }

  cursorY = signatureBoxTop - signatureBoxHeight - 26;

  const drawLegalBlock = (page: PDFPage, startY: number, paragraphs: string[]) => {
    let localCursorY = startY;
    page.drawText('Signing terms, consent statements, and evidentiary notes', {
      x: 54,
      y: localCursorY,
      size: 11,
      font: headingFont,
      color: rgb(0.08, 0.11, 0.16),
    });
    localCursorY -= 22;

    const remaining: string[] = [];
    paragraphs.forEach((paragraph, index) => {
      const wrapped = wrapText(paragraph, bodyFont, 9.2, width - 108);
      const requiredHeight = wrapped.length * (9.2 + 3.3) + 6;
      if (localCursorY - requiredHeight < 74) {
        remaining.push(paragraph);
        return;
      }

      const { nextY } = drawWrappedParagraph(page, paragraph, {
        x: 54,
        y: localCursorY,
        font: bodyFont,
        size: 9.2,
        maxWidth: width - 108,
        color: index === legalParagraphs.length - 1 ? rgb(0.3, 0.35, 0.42) : rgb(0.42, 0.47, 0.54),
        lineGap: 3.3,
      });
      localCursorY = nextY - 6;
    });

    return { remaining, cursorY: localCursorY };
  };

  // Always render legal + retention notes on a clean continuation page for readability.
  let legalPage = createCertificatePage(
    pdfDoc,
    { heading: headingFont, body: bodyFont },
    { continuation: true, brandingEnabled: brandEnabled, docrudLogo: embeddedDocrudLogo },
  );
  let legalResult = drawLegalBlock(legalPage, 650, legalParagraphs);

  while (legalResult.remaining.length > 0) {
    legalPage = createCertificatePage(
      pdfDoc,
      { heading: headingFont, body: bodyFont },
      { continuation: true, brandingEnabled: brandEnabled, docrudLogo: embeddedDocrudLogo },
    );
    legalResult = drawLegalBlock(legalPage, 650, legalResult.remaining);
  }

  legalPage.drawLine({
    start: { x: 54, y: 60 },
    end: { x: width - 54, y: 60 },
    thickness: 1,
    color: rgb(0.88, 0.9, 0.94),
  });

  legalPage.drawText('This certificate page was appended by docrud after password validation and recipient signing activity capture. Operational record only; not legal advice.', {
    x: 54,
    y: 42,
    size: 8.5,
    font: bodyFont,
    color: rgb(0.42, 0.47, 0.54),
  });

  return buildPdfDataUrl(await pdfDoc.save());
}

export async function applyRecipientSignaturePlacementsToPdfDataUrl(
  originalPdfDataUrl: string,
  signatureDataUrl: string,
  placements?: import('@/types/document').RecipientSignaturePlacements | null,
) {
  if (!placements) {
    return originalPdfDataUrl;
  }

  const pdfSource = decodeDataUrl(originalPdfDataUrl);
  const signatureSource = decodeDataUrl(signatureDataUrl);
  const pdfDoc = await PDFDocument.load(pdfSource.bytes);

  const normalizedSignature = await normalizeSignatureImageBytes({
    mimeType: signatureSource.mimeType,
    bytes: signatureSource.bytes,
  });

  let embeddedSignature;
  if (normalizedSignature.mimeType === 'image/png') {
    embeddedSignature = await pdfDoc.embedPng(normalizedSignature.bytes);
  } else if (normalizedSignature.mimeType === 'image/jpeg' || normalizedSignature.mimeType === 'image/jpg') {
    embeddedSignature = await pdfDoc.embedJpg(normalizedSignature.bytes);
  } else {
    throw new Error('Unsupported signature image format. Please upload PNG or JPG.');
  }

  const pages = pdfDoc.getPages();
  if (placements.mode === 'boxes') {
    const boxes = Array.isArray(placements.boxes) ? placements.boxes : [];
    for (const box of boxes) {
      const pageIndex = Math.floor(Number(box.page || 0)) - 1;
      const page = pages[pageIndex];
      if (!page) continue;

      const pdfX = Number((box as any).pdfX);
      const pdfY = Number((box as any).pdfY);
      const pdfW = Number((box as any).pdfW);
      const pdfH = Number((box as any).pdfH);

      const xPct = Number(box.xPct);
      const yPct = Number(box.yPct);
      const widthPct = Number(box.widthPct);
      const heightPct = Number(box.heightPct);
      if (
        !Number.isFinite(xPct)
        || !Number.isFinite(yPct)
        || !Number.isFinite(widthPct)
        || !Number.isFinite(heightPct)
      ) {
        continue;
      }

      let x: number;
      let y: number;
      let boxWidth: number;
      let boxHeight: number;

      // Prefer absolute PDF coordinates when available (most accurate).
      if (Number.isFinite(pdfX) && Number.isFinite(pdfY) && Number.isFinite(pdfW) && Number.isFinite(pdfH) && pdfW > 0 && pdfH > 0) {
        // Do not apply crop/media offsets here: `convertToPdfPoint` returns coordinates
        // in the page's PDF user space. pdf-lib draw operations use the same space.
        // Only apply minimal sanity clamping to avoid NaNs/negatives.
        const media = page.getMediaBox();
        boxWidth = Math.max(0, Math.min(media.width, pdfW));
        boxHeight = Math.max(0, Math.min(media.height, pdfH));
        x = Math.max(media.x, Math.min(media.x + media.width - boxWidth, pdfX));
        y = Math.max(media.y, Math.min(media.y + media.height - boxHeight, pdfY));
      } else {
        const crop = page.getCropBox();
        const pageWidth = crop.width;
        const pageHeight = crop.height;
        const wPct = Math.min(Math.max(widthPct, 0), 1);
        const hPct = Math.min(Math.max(heightPct, 0), 1);
        const safeXPct = Math.min(Math.max(xPct, 0), 1);
        const safeYPct = Math.min(Math.max(yPct, 0), 1);

        boxWidth = Math.max(0, Math.min(pageWidth, pageWidth * wPct));
        boxHeight = Math.max(0, Math.min(pageHeight, pageHeight * hPct));
        x = crop.x + Math.max(0, Math.min(pageWidth - boxWidth, pageWidth * safeXPct));
        // yPct is measured from the TOP in the sender UI; convert to PDF bottom-left origin.
        const yFromTop = pageHeight * safeYPct;
        const yInCrop = Math.max(0, Math.min(pageHeight - boxHeight, pageHeight - yFromTop - boxHeight));
        y = crop.y + yInCrop;
      }

      if (boxWidth < 6 || boxHeight < 6) continue;

      // Fill the box as closely as possible while preserving aspect ratio.
      // Allow moderate upscaling since drawn signatures are usually crisp.
      const padding = 0.06;
      const availableWidth = boxWidth * (1 - padding * 2);
      const availableHeight = boxHeight * (1 - padding * 2);
      const scale = Math.min(availableWidth / embeddedSignature.width, availableHeight / embeddedSignature.height, 3);
      const signatureWidth = embeddedSignature.width * scale;
      const signatureHeight = embeddedSignature.height * scale;
      const centeredX = x + (boxWidth - signatureWidth) / 2;
      const centeredY = y + (boxHeight - signatureHeight) / 2;

      page.drawImage(embeddedSignature, {
        x: centeredX,
        y: centeredY,
        width: signatureWidth,
        height: signatureHeight,
        opacity: 0.98,
      });

      // Optional subtle guide box for robustness/verification (invisible-ish but helps on very light signatures).
      // Keep extremely light so it looks premium and doesn't distract.
      page.drawRectangle({
        x,
        y,
        width: boxWidth,
        height: boxHeight,
        borderColor: rgb(0.82, 0.87, 0.93),
        borderWidth: 0.6,
        opacity: 0.18,
      });
    }
  } else {
    const position = placements.position || 'bottom_right';
    const sizePct = typeof placements.sizePct === 'number' ? Math.min(Math.max(placements.sizePct, 0.08), 0.6) : 0.22;
    const marginPct = typeof placements.marginPct === 'number' ? Math.min(Math.max(placements.marginPct, 0.01), 0.12) : 0.04;

    const pageIndexes = (() => {
      if (placements.mode === 'all') return pages.map((_, index) => index);
      if (placements.mode === 'last') return pages.length ? [pages.length - 1] : [];
      const explicit = (placements.pages || []).map((p) => Number(p)).filter((p) => Number.isFinite(p));
      const normalized = explicit
        .map((p) => Math.max(1, Math.floor(p)))
        .filter((p, idx, arr) => arr.indexOf(p) === idx)
        .map((p) => p - 1)
        .filter((idx) => idx >= 0 && idx < pages.length);
      return normalized;
    })();

    for (const index of pageIndexes) {
      const page = pages[index];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const margin = pageWidth * marginPct;
      const targetWidth = pageWidth * sizePct;
      const scale = Math.min(targetWidth / embeddedSignature.width, 1);
      const signatureWidth = embeddedSignature.width * scale;
      const signatureHeight = embeddedSignature.height * scale;

      const coords = (() => {
        switch (position) {
          case 'bottom_left':
            return { x: margin, y: margin };
          case 'top_left':
            return { x: margin, y: pageHeight - margin - signatureHeight };
          case 'top_right':
            return { x: pageWidth - margin - signatureWidth, y: pageHeight - margin - signatureHeight };
          case 'center':
            return { x: (pageWidth - signatureWidth) / 2, y: (pageHeight - signatureHeight) / 2 };
          case 'bottom_right':
          default:
            return { x: pageWidth - margin - signatureWidth, y: margin };
        }
      })();

      page.drawImage(embeddedSignature, {
        x: coords.x,
        y: coords.y,
        width: signatureWidth,
        height: signatureHeight,
        opacity: 0.98,
      });
    }
  }

  return buildPdfDataUrl(await pdfDoc.save());
}

export async function applyRecipientSignatureBoxSignaturesToPdfDataUrl(
  originalPdfDataUrl: string,
  signaturesByBoxId: Record<string, string>,
  placements: { mode: 'boxes'; boxes: import('@/types/document').RecipientSignatureBoxPlacement[] },
) {
  const pdfSource = decodeDataUrl(originalPdfDataUrl);
  const pdfDoc = await PDFDocument.load(pdfSource.bytes);
  const pages = pdfDoc.getPages();

  // Cache embedded images by signature data URL.
  const embeddedCache = new Map<string, any>();

  const getEmbeddedSignature = async (signatureDataUrl: string) => {
    const cached = embeddedCache.get(signatureDataUrl);
    if (cached) return cached;
    const signatureSource = decodeDataUrl(signatureDataUrl);
    const normalizedSignature = await normalizeSignatureImageBytes({
      mimeType: signatureSource.mimeType,
      bytes: signatureSource.bytes,
    });
    let embeddedSignature;
    if (normalizedSignature.mimeType === 'image/png') {
      embeddedSignature = await pdfDoc.embedPng(normalizedSignature.bytes);
    } else if (normalizedSignature.mimeType === 'image/jpeg' || normalizedSignature.mimeType === 'image/jpg') {
      embeddedSignature = await pdfDoc.embedJpg(normalizedSignature.bytes);
    } else {
      throw new Error('Unsupported signature image format. Please upload PNG or JPG.');
    }
    embeddedCache.set(signatureDataUrl, embeddedSignature);
    return embeddedSignature;
  };

  const boxes = Array.isArray(placements.boxes) ? placements.boxes : [];
  for (const box of boxes) {
    const signatureDataUrl = signaturesByBoxId[box.id];
    if (!signatureDataUrl?.startsWith('data:image/')) continue;

    const pageIndex = Math.floor(Number(box.page || 0)) - 1;
    const page = pages[pageIndex];
    if (!page) continue;

    const embeddedSignature = await getEmbeddedSignature(signatureDataUrl);

    const pdfX = Number((box as any).pdfX);
    const pdfY = Number((box as any).pdfY);
    const pdfW = Number((box as any).pdfW);
    const pdfH = Number((box as any).pdfH);

    let x: number;
    let y: number;
    let boxWidth: number;
    let boxHeight: number;

    if (Number.isFinite(pdfX) && Number.isFinite(pdfY) && Number.isFinite(pdfW) && Number.isFinite(pdfH) && pdfW > 0 && pdfH > 0) {
      const media = page.getMediaBox();
      boxWidth = Math.max(0, Math.min(media.width, pdfW));
      boxHeight = Math.max(0, Math.min(media.height, pdfH));
      x = Math.max(media.x, Math.min(media.x + media.width - boxWidth, pdfX));
      y = Math.max(media.y, Math.min(media.y + media.height - boxHeight, pdfY));
    } else {
      // Fallback to pct-based placement (legacy boxes).
      const crop = page.getCropBox();
      const pageWidth = crop.width;
      const pageHeight = crop.height;
      const wPct = Math.min(Math.max(Number(box.widthPct), 0), 1);
      const hPct = Math.min(Math.max(Number(box.heightPct), 0), 1);
      const safeXPct = Math.min(Math.max(Number(box.xPct), 0), 1);
      const safeYPct = Math.min(Math.max(Number(box.yPct), 0), 1);
      boxWidth = Math.max(0, Math.min(pageWidth, pageWidth * wPct));
      boxHeight = Math.max(0, Math.min(pageHeight, pageHeight * hPct));
      x = crop.x + Math.max(0, Math.min(pageWidth - boxWidth, pageWidth * safeXPct));
      const yFromTop = pageHeight * safeYPct;
      const yInCrop = Math.max(0, Math.min(pageHeight - boxHeight, pageHeight - yFromTop - boxHeight));
      y = crop.y + yInCrop;
    }

    if (boxWidth < 6 || boxHeight < 6) continue;

    const padding = 0.06;
    const availableWidth = boxWidth * (1 - padding * 2);
    const availableHeight = boxHeight * (1 - padding * 2);
    const scale = Math.min(availableWidth / embeddedSignature.width, availableHeight / embeddedSignature.height, 3);
    const signatureWidth = embeddedSignature.width * scale;
    const signatureHeight = embeddedSignature.height * scale;
    const centeredX = x + (boxWidth - signatureWidth) / 2;
    const centeredY = y + (boxHeight - signatureHeight) / 2;

    page.drawImage(embeddedSignature, {
      x: centeredX,
      y: centeredY,
      width: signatureWidth,
      height: signatureHeight,
      opacity: 0.98,
    });
  }

  return buildPdfDataUrl(await pdfDoc.save());
}
