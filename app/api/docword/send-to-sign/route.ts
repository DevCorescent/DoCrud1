import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { getAuthSession } from '@/lib/server/auth';
import { getDocWordDocumentForActor } from '@/lib/server/docword';
import { appendHistoryEntry } from '@/lib/server/history';
import { buildDocWordHtml } from '@/lib/server/docword';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getThemeStyles(documentTheme?: string) {
  switch (documentTheme) {
    case 'sky':
      return {
        bodyBackground: '#eef6ff',
        pageBackground: 'linear-gradient(180deg,#fdfefe 0%,#edf6ff 100%)',
        pageBorder: '#bae6fd',
        textColor: '#0f172a',
      };
    case 'linen':
      return {
        bodyBackground: '#fff9ef',
        pageBackground: 'linear-gradient(180deg,#fffdf8 0%,#fbf3e2 100%)',
        pageBorder: '#fcd34d',
        textColor: '#0f172a',
      };
    case 'midnight':
      return {
        bodyBackground: '#07111f',
        pageBackground: 'linear-gradient(180deg,#0f172a 0%,#172554 100%)',
        pageBorder: '#334155',
        textColor: '#e5eefc',
      };
    default:
      return {
        bodyBackground: '#f8fbff',
        pageBackground: '#ffffff',
        pageBorder: '#cbd5e1',
        textColor: '#0f172a',
      };
  }
}

function buildDocWordExportMarkup(document: {
  title: string;
  html: string;
  watermarkText?: string;
  documentTheme?: string;
  headerHtml?: string;
  footerHtml?: string;
}) {
  const theme = getThemeStyles(document.documentTheme);
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${document.title}</title>
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { font-family: Inter, system-ui, sans-serif; background: ${theme.bodyBackground}; color: ${theme.textColor}; }
        .page-shell { padding: 20px; }
        .page { position: relative; background: ${theme.pageBackground}; border: 1px solid ${theme.pageBorder}; border-radius: 18px; margin: 0 auto; padding: 44px 46px; min-height: calc(100vh - 40px); overflow: hidden; }
        h1,h2,h3 { line-height: 1.1; margin: 0 0 16px; }
        p, div, li, blockquote, aside { line-height: 1.7; margin: 0 0 12px; }
        blockquote { border-left: 4px solid #cbd5e1; padding-left: 16px; color: ${document.documentTheme === 'midnight' ? '#cbd5e1' : '#334155'}; }
        aside { background: ${document.documentTheme === 'midnight' ? 'rgba(255,255,255,0.06)' : '#f8fafc'}; border: 1px solid ${document.documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; border-radius: 16px; padding: 14px 16px; }
        table { width: 100%; border-collapse: collapse; margin: 18px 0; }
        th, td { border: 1px solid ${document.documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding: 10px 12px; text-align: left; }
        figure { margin: 20px 0; }
        img { max-width: 100%; border-radius: 12px; }
        figcaption { margin-top: 8px; color: ${document.documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 12px; }
        .page-body { position: relative; z-index: 1; }
        .watermark {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.35em;
          color: ${document.documentTheme === 'midnight' ? 'rgba(255,255,255,0.08)' : 'rgba(15, 23, 42, 0.08)'};
          font-size: 52px;
          font-weight: 700;
          transform: rotate(-28deg);
          pointer-events: none;
          z-index: 0;
        }
        header.docword-export-header { border-bottom: 1px solid ${document.documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding-bottom: 12px; margin-bottom: 24px; color: ${document.documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 13px; }
        footer.docword-export-footer { border-top: 1px solid ${document.documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding-top: 12px; margin-top: 32px; color: ${document.documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="page-shell">
        <main class="page">
          ${document.watermarkText?.trim() ? `<div class="watermark">${document.watermarkText.trim()}</div>` : ''}
          <div class="page-body">
            ${document.headerHtml?.trim() ? `<header class="docword-export-header">${document.headerHtml.trim()}</header>` : ''}
            ${document.html}
            ${document.footerHtml?.trim() ? `<footer class="docword-export-footer">${document.footerHtml.trim()}</footer>` : ''}
          </div>
        </main>
      </div>
    </body>
  </html>`;
}

export async function POST(request: NextRequest) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      documentId?: string;
      watermarkEnabled?: boolean;
      watermarkText?: string;
      recipientSignatureRequired?: boolean;
    };
    if (!payload.documentId?.trim()) {
      return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
    }

    const actor = {
      type: 'user' as const,
      userId: session.user.id,
      email: session.user.email || undefined,
    };

    const document = await getDocWordDocumentForActor(payload.documentId.trim(), actor);
    if (!document) {
      return NextResponse.json({ error: 'DocWord document not found.' }, { status: 404 });
    }

    const watermarkEnabled = payload.watermarkEnabled !== false;
    const resolvedWatermarkText = watermarkEnabled
      ? (payload.watermarkText?.trim() || document.watermarkText?.trim() || 'Confidential')
      : undefined;
    const recipientSignatureRequired = payload.recipientSignatureRequired !== false;

    const title = document.title?.trim() || 'DocWord signing draft';
    const renderedHtml = buildDocWordHtml(document.blocks || []);
    const fullMarkup = buildDocWordExportMarkup({
      title,
      html: renderedHtml,
      watermarkText: resolvedWatermarkText,
      documentTheme: document.documentTheme,
      headerHtml: document.headerHtml,
      footerHtml: document.footerHtml,
    });

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(fullMarkup, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    const uploadedPdfDataUrl = `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`;

    const historyEntry = await appendHistoryEntry({
      documentSourceType: 'uploaded_pdf',
      templateId: 'docword-sign-packet',
      templateName: title,
      category: 'DocWord Signing',
      data: {},
      generatedBy: session.user.email || 'unknown',
      generatedAt: new Date().toISOString(),
      previewHtml: fullMarkup,
      uploadedPdfFileName: `${title.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_') || 'docword_document'}.pdf`,
      uploadedPdfMimeType: 'application/pdf',
      uploadedPdfDataUrl,
      recipientSignatureRequired,
      recipientAccess: 'view',
      dataCollectionEnabled: false,
      dataCollectionStatus: 'disabled',
      automationNotes: [
        'Created from DocWord',
        `DocWord source document: ${document.id}`,
      ],
      editorState: {
        title,
        watermarkLabel: resolvedWatermarkText,
        internalSummary: document.summary,
      },
    });

    return NextResponse.json({ historyEntry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to prepare signing handoff.' }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}
