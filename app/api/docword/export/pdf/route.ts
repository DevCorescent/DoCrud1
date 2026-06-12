import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

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

function buildPdfHtml(title: string, html: string, watermarkText?: string, documentTheme?: string) {
  const theme = getThemeStyles(documentTheme);
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { font-family: Inter, system-ui, sans-serif; background: ${theme.bodyBackground}; color: ${theme.textColor}; }
        .page-shell { padding: 20px; }
        .page { position: relative; background: ${theme.pageBackground}; border: 1px solid ${theme.pageBorder}; border-radius: 18px; margin: 0 auto; padding: 44px 46px; min-height: calc(100vh - 40px); overflow: hidden; }
        .page-body { position: relative; z-index: 1; min-height: calc(100vh - 128px); }
        .docword-export-page-flow { position: relative; z-index: 1; min-height: calc(100vh - 128px); display: flex; flex-direction: column; }
        h1,h2,h3 { line-height: 1.1; margin: 0 0 16px; }
        p, div, li, blockquote, aside { line-height: 1.7; margin: 0 0 12px; }
        blockquote { border-left: 4px solid #cbd5e1; padding-left: 16px; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#334155'}; }
        aside { background: ${documentTheme === 'midnight' ? 'rgba(255,255,255,0.06)' : '#f8fafc'}; border: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; border-radius: 16px; padding: 14px 16px; }
        table { width: 100%; border-collapse: collapse; margin: 18px 0; }
        th, td { border: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding: 10px 12px; text-align: left; }
        figure { margin: 20px 0; }
        img { max-width: 100%; border-radius: 12px; }
        figcaption { margin-top: 8px; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 12px; }
        span { white-space: pre-wrap; }
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
          color: ${documentTheme === 'midnight' ? 'rgba(255,255,255,0.08)' : 'rgba(15, 23, 42, 0.08)'};
          font-size: 52px;
          font-weight: 700;
          transform: rotate(-28deg);
          pointer-events: none;
          z-index: 0;
        }
        header.docword-export-header { border-bottom: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding-bottom: 12px; margin-bottom: 24px; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 13px; }
        footer.docword-export-footer { border-top: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding-top: 12px; margin-top: auto; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="page-shell">
        <main class="page">${watermarkText?.trim() ? `<div class="watermark">${watermarkText.trim()}</div>` : ''}<div class="page-body">${html}</div></main>
      </div>
    </body>
  </html>`;
}

export async function POST(request: NextRequest) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const payload = await request.json() as {
      title?: string;
      html?: string;
      watermarkText?: string;
      documentTheme?: string;
      exportProfile?: 'standard' | 'compact';
    };
    const title = payload.title?.trim() || 'DocWord Document';
    const html = payload.html?.trim() || '<p></p>';
    const watermarkText = payload.watermarkText?.trim() || undefined;
    const documentTheme = payload.documentTheme?.trim() || undefined;
    const exportProfile = payload.exportProfile === 'compact' ? 'compact' : 'standard';

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(buildPdfHtml(title, html, watermarkText, documentTheme), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: exportProfile !== 'compact',
      margin: exportProfile === 'compact'
        ? { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' }
        : { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
      scale: exportProfile === 'compact' ? 0.96 : 1,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title.replace(/\s+/g, '_')}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to export PDF.' }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}
