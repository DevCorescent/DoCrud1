import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { getAuthSession } from '@/lib/server/auth';
import { type DocumentDesignPreset, isDocumentDesignPreset } from '@/lib/document-designs';
import { getSignatureSettings } from '@/lib/server/settings';
import { renderDocumentTemplate } from '@/lib/template';
import { DocumentTemplate, SignatureRecord } from '@/types/document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getEmbeddedBrandLogoSrc() {
  const logoPath = path.join(process.cwd(), 'public', 'docrud-logo.png');
  const logoBuffer = await fs.readFile(logoPath);
  return `data:image/png;base64,${logoBuffer.toString('base64')}`;
}

function resolveTemplatePageOptions(template: DocumentTemplate) {
  if (!template?.isCustom) return {};
  const settings = template.renderSettings;
  if (!settings) return {};
  const pageSize = settings.pageSize === 'Custom' ? 'A4' : settings.pageSize;
  return {
    pageSize: pageSize as 'A4' | 'Letter' | 'Legal' | undefined,
    pageWidthMm: settings.pageSize === 'Custom' ? settings.pageWidthMm : undefined,
    pageHeightMm: settings.pageSize === 'Custom' ? settings.pageHeightMm : undefined,
    pageMarginMm: typeof settings.pageMarginMm === 'number' ? settings.pageMarginMm : undefined,
    pageNumbersEnabled: Boolean(settings.pageNumbersEnabled),
    pageBackgroundCss: typeof settings.pageBackgroundCss === 'string' ? settings.pageBackgroundCss : undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      template,
      data,
      referenceNumber,
      generatedAt,
      generatedBy,
      signatureId,
      watermarkLabel,
      letterheadMode,
      letterheadImageDataUrl,
      letterheadHtml,
      designPreset,
    }: {
      template: DocumentTemplate;
      data: Record<string, string>;
      referenceNumber?: string;
      generatedAt?: string;
      generatedBy?: string;
      signatureId?: string;
      watermarkLabel?: string;
      letterheadMode?: 'default' | 'image' | 'html';
      letterheadImageDataUrl?: string;
      letterheadHtml?: string;
      designPreset?: DocumentDesignPreset;
    } = await request.json();

    if (!template?.name || !Array.isArray(template.fields)) {
      return NextResponse.json({ error: 'A valid template is required' }, { status: 400 });
    }
    const signatureSettings = await getSignatureSettings();
    const signature: SignatureRecord | null = signatureId
      ? (signatureSettings.signatures.find((item) => item.id === signatureId) || null)
      : null;
    const brandLogoSrc = await getEmbeddedBrandLogoSrc();
    const pageOptions = resolveTemplatePageOptions(template);
    const { pageNumbersEnabled, ...docPageOptions } = pageOptions as any;

    const html = renderDocumentTemplate(template, data || {}, {
      referenceNumber,
      generatedAt,
      generatedBy: generatedBy || session.user.email || 'docrud workflow',
      signature: signature || undefined,
      brandLogoSrc,
      renderMode: template.isCustom ? 'plain' : 'platform',
      designPreset: isDocumentDesignPreset(designPreset) ? designPreset : undefined,
      watermarkLabel,
      letterheadMode,
      letterheadImageDataUrl,
      letterheadHtml,
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
      const pdfBase: Parameters<typeof page.pdf>[0] = {
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
      };

      const pdfBuffer = await page.pdf(pdfBase);

      return new NextResponse(Buffer.from(pdfBuffer), {
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
