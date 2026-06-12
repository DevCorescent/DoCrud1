import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const html = String(body?.html || '').trim();
    const fileName = String(body?.fileName || 'optimized-resume').trim();

    if (!html) {
      return NextResponse.json({ error: 'Resume preview HTML is required.' }, { status: 400 });
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '14mm',
          right: '10mm',
          bottom: '14mm',
          left: '10mm',
        },
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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate resume PDF.' }, { status: 500 });
  }
}
