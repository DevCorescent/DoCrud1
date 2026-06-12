import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { getMarketplaceItem } from '@/lib/server/template-marketplace';
import { renderDocumentTemplate } from '@/lib/template';
import type { DocumentField, DocumentTemplate } from '@/types/document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildSampleData(fields: DocumentField[]) {
  const sample: Record<string, string> = {};
  for (const f of fields || []) {
    if (f.type === 'date') sample[f.name] = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date());
    else if (f.type === 'number') sample[f.name] = '1000';
    else if (f.type === 'email') sample[f.name] = 'recipient@company.com';
    else if (f.type === 'tel') sample[f.name] = '+91 98XXXXXX10';
    else if (f.type === 'url') sample[f.name] = 'https://docrud.app';
    else if (f.type === 'textarea') sample[f.name] = 'Replace this text with your content.';
    else if ((f.type === 'select' || f.type === 'radio') && f.options?.length) sample[f.name] = f.options[0]!;
    else if (f.type === 'checkbox') sample[f.name] = 'true';
    else sample[f.name] = f.placeholder || 'Value';
  }
  return sample;
}

function resolveTemplatePageOptions(template: DocumentTemplate) {
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

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  const id = String(context?.params?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const item = await getMarketplaceItem(id);
  if (!item || item.status !== 'published') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tpl = item.templateSnapshot;
  const sample = item.exampleData && typeof item.exampleData === 'object'
    ? { ...item.exampleData }
    : buildSampleData(tpl.fields || []);
  (sample as any).title = tpl.name || 'Template';
  (sample as any).summary = tpl.description || '';

  const pageOptions = resolveTemplatePageOptions(tpl);
  const { pageNumbersEnabled, ...docPageOptions } = pageOptions as any;

  const html = renderDocumentTemplate(tpl, sample, {
    generatedBy: 'docrud marketplace preview',
    renderMode: 'plain',
    watermarkLabel: 'EXAMPLE',
    ...(docPageOptions || {}),
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const wantsPageNumbers = Boolean(tpl.isCustom && pageNumbersEnabled);

    const pdf = await page.pdf({
      printBackground: true,
      ...(tpl.isCustom
        ? ((pageOptions as any).pageWidthMm && (pageOptions as any).pageHeightMm
          ? { width: `${(pageOptions as any).pageWidthMm}mm`, height: `${(pageOptions as any).pageHeightMm}mm` }
          : { format: ((pageOptions as any).pageSize || 'A4') as any })
        : { format: 'A4' }),
      margin: wantsPageNumbers
        ? { top: '0mm', right: '0mm', bottom: '10mm', left: '0mm' }
        : { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
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

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=${(tpl.name || 'template').replace(/\s+/g, '_')}_PREVIEW.pdf`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await browser.close();
  }
}
