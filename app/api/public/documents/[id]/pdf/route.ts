import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { documentTemplates } from '@/data/templates';
import { createAccessEvent, getHistoryEntries, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { type DocumentDesignPreset, isDocumentDesignPreset } from '@/lib/document-designs';
import { getCustomTemplatesFromRepository } from '@/lib/server/repositories';
import { renderDocumentTemplate } from '@/lib/template';
import { getSignatureSettings } from '@/lib/server/settings';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveTemplatePageOptions(template: (typeof documentTemplates)[number] | (Awaited<ReturnType<typeof getCustomTemplatesFromRepository>>)[number]) {
  // Only custom templates can carry render settings today.
  if (!template || !('isCustom' in template) || !template.isCustom) return {};
  const settings = (template as any).renderSettings as (import('@/types/document').DocumentTemplate['renderSettings']) | undefined;
  if (!settings) return {};
  const pageSize = settings.pageSize === 'Custom' ? 'A4' : settings.pageSize;
  return {
    pageSize,
    pageWidthMm: settings.pageSize === 'Custom' ? settings.pageWidthMm : undefined,
    pageHeightMm: settings.pageSize === 'Custom' ? settings.pageHeightMm : undefined,
    pageMarginMm: typeof settings.pageMarginMm === 'number' ? settings.pageMarginMm : undefined,
    pageNumbersEnabled: Boolean(settings.pageNumbersEnabled),
    pageBackgroundCss: typeof (settings as any).pageBackgroundCss === 'string' ? (settings as any).pageBackgroundCss : undefined,
  };
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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const internal = request.nextUrl.searchParams.get('internal') === '1';
    const password = request.nextUrl.searchParams.get('password')?.trim().toUpperCase();
    const signingToken = request.nextUrl.searchParams.get('token')?.trim() || '';
    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
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

    const resolvedSignedPdfDataUrl = entry.documentSourceType === 'uploaded_pdf' ? entry.signedPdfDataUrl : undefined;
    if (resolvedSignedPdfDataUrl?.startsWith('data:application/pdf;base64,')) {
      const pdfBuffer = Buffer.from(resolvedSignedPdfDataUrl.replace(/^data:application\/pdf;base64,/, ''), 'base64');
      if (!internal) {
        await updateHistoryEntry(entry.id, (current) => ({
          ...current,
          downloadCount: (current.downloadCount || 0) + 1,
          lastDownloadedAt: new Date().toISOString(),
          accessEvents: [
            createAccessEvent({
              eventType: 'download',
              createdAt: new Date().toISOString(),
              ip: getRequestIp(request),
              userAgent: getRequestUserAgent(request),
              deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
            }),
            ...(current.accessEvents || []),
          ].slice(0, 50),
          automationNotes: [...(current.automationNotes || []), 'Signed PDF downloaded'],
        }));
      }

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=${(entry.signedPdfFileName || entry.templateName || 'signed-document').replace(/\s+/g, '_').replace(/\.pdf$/i, '')}.pdf`,
        },
      });
    }

    if (entry.documentSourceType === 'uploaded_pdf') {
      const pdfDataUrl = entry.signedPdfDataUrl || entry.uploadedPdfDataUrl;
      if (!pdfDataUrl?.startsWith('data:application/pdf;base64,')) {
        return NextResponse.json({ error: 'Uploaded PDF is not available for download' }, { status: 404 });
      }

      const pdfBuffer = Buffer.from(pdfDataUrl.replace(/^data:application\/pdf;base64,/, ''), 'base64');
      if (!internal) {
        await updateHistoryEntry(entry.id, (current) => ({
          ...current,
          downloadCount: (current.downloadCount || 0) + 1,
          lastDownloadedAt: new Date().toISOString(),
          accessEvents: [
            createAccessEvent({
              eventType: 'download',
              createdAt: new Date().toISOString(),
              ip: getRequestIp(request),
              userAgent: getRequestUserAgent(request),
              deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
            }),
            ...(current.accessEvents || []),
          ].slice(0, 50),
          automationNotes: [...(current.automationNotes || []), 'Recipient PDF downloaded'],
        }));
      }

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=${(entry.signedPdfFileName || entry.uploadedPdfFileName || entry.templateName || 'shared-document').replace(/\s+/g, '_')}`,
        },
      });
    }

    const customTemplates = await getCustomTemplatesFromRepository();
    const template = [...documentTemplates, ...customTemplates].find((item) => item.id === entry.templateId);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const signatureSettings = await getSignatureSettings();
    const signature = signatureSettings.signatures.find((item) => item.id === entry.signatureId) || null;
    const recipientSignature = entry.recipientSignatureDataUrl
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
    const brandLogoSrc = await getEmbeddedBrandLogoSrc();
    const pageOptions = resolveTemplatePageOptions(template);
    const { pageNumbersEnabled, ...docPageOptions } = pageOptions as any;

    const html = renderDocumentTemplate(template as any, entry.data || {}, {
      referenceNumber: entry.referenceNumber,
      generatedAt: entry.generatedAt,
      generatedBy: entry.generatedBy,
      signature,
      brandLogoSrc,
      renderMode: template.isCustom ? 'plain' : 'platform',
      designPreset: isDocumentDesignPreset(entry.editorState?.designPreset as DocumentDesignPreset) ? entry.editorState?.designPreset : undefined,
      recipientSignature,
      watermarkLabel: entry.editorState?.watermarkLabel,
      letterheadMode: entry.editorState?.letterheadMode,
      letterheadImageDataUrl: entry.editorState?.letterheadImageDataUrl,
      letterheadHtml: entry.editorState?.letterheadHtml,
      ...(docPageOptions || {}),
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const wantsPageNumbers = Boolean(template.isCustom && pageNumbersEnabled);
      const pdfBuffer = await page.pdf({
        printBackground: true,
        ...(template.isCustom
          ? (pageOptions.pageWidthMm && pageOptions.pageHeightMm
            ? { width: `${pageOptions.pageWidthMm}mm`, height: `${pageOptions.pageHeightMm}mm` }
            : { format: (pageOptions.pageSize || 'A4') as any })
          : { format: 'A4' }),
        margin: template.isCustom
          ? (wantsPageNumbers
            ? { top: '0mm', right: '0mm', bottom: '10mm', left: '0mm' }
            : { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' })
          : {
              top: '14mm',
              right: '10mm',
              bottom: '14mm',
              left: '10mm',
            },
        displayHeaderFooter: wantsPageNumbers,
        headerTemplate: wantsPageNumbers ? '<div></div>' : undefined,
        footerTemplate: wantsPageNumbers
          ? `
            <div style="width:100%; font-size:10px; color:rgba(15,23,42,.62); padding:0 12mm; display:flex; justify-content:flex-end; font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;">
              <span class="pageNumber"></span>/<span class="totalPages"></span>
            </div>
          `
          : undefined,
      });

      const outputBuffer = Buffer.from(pdfBuffer);

      if (!internal) {
        await updateHistoryEntry(entry.id, (current) => ({
          ...current,
          downloadCount: (current.downloadCount || 0) + 1,
          lastDownloadedAt: new Date().toISOString(),
          accessEvents: [
            createAccessEvent({
              eventType: 'download',
              createdAt: new Date().toISOString(),
              ip: getRequestIp(request),
              userAgent: getRequestUserAgent(request),
              deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
            }),
            ...(current.accessEvents || []),
          ].slice(0, 50),
          automationNotes: [...(current.automationNotes || []), 'Recipient PDF downloaded'],
        }));
      }

      return new NextResponse(outputBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=${template.name.replace(/\s+/g, '_')}.pdf`,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
