import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEditableDocumentHtml(title: string, text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const heading = lines[0] && /^[A-Z][A-Z0-9\s/&(),.-]{2,}$/.test(lines[0]) ? `<h2>${escapeHtml(lines[0])}</h2>` : '';
      const contentLines = heading ? lines.slice(1) : lines;
      const content = contentLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
      return `<section>${heading}${content}</section>`;
    })
    .join('');

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { margin: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; }
        main { max-width: 840px; margin: 24px auto; background: white; border: 1px solid #e2e8f0; border-radius: 24px; padding: 42px; box-shadow: 0 20px 60px rgba(15,23,42,0.08); }
        h1 { margin: 0 0 24px; font-size: 30px; letter-spacing: -0.03em; }
        h2 { margin: 28px 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.2em; color: #475569; }
        p { margin: 0 0 10px; line-height: 1.75; font-size: 14px; }
        section + section { margin-top: 14px; }
      </style>
    </head>
    <body>
      <main>
        <h1>${escapeHtml(title)}</h1>
        ${blocks}
      </main>
    </body>
  </html>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = String(body?.title || 'edited-document').trim() || 'edited-document';
    const text = String(body?.text || '').trim();
    const fileName = String(body?.fileName || title).trim() || 'edited-document';

    if (!text) {
      return NextResponse.json({ error: 'Document text is required.' }, { status: 400 });
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(renderEditableDocumentHtml(title, text), { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', right: '10mm', bottom: '14mm', left: '10mm' },
      });

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=${fileName.replace(/[^a-z0-9-_]/gi, '_')}.pdf`,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to export this PDF right now.' },
      { status: 500 },
    );
  }
}
