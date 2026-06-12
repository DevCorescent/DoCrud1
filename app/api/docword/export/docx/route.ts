import JSZip from 'jszip';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDocxDocumentXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" mc:Ignorable="w14 wp14">
  <w:body>
    <w:altChunk r:id="htmlChunk"/>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

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

function buildWordHtml(title: string, html: string, watermarkText?: string, documentTheme?: string) {
  const theme = getThemeStyles(documentTheme);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(title)}</title>
    <style>
      body { position: relative; font-family: Inter, Arial, sans-serif; color: ${theme.textColor}; margin: 0; padding: 0; overflow: hidden; background: ${theme.bodyBackground}; }
      .page-shell { padding: 18px; }
      .page { position: relative; background: ${theme.pageBackground}; border: 1px solid ${theme.pageBorder}; border-radius: 18px; padding: 32px 28px; min-height: calc(100vh - 36px); overflow: hidden; }
      .docword-export-page-flow { position: relative; z-index: 1; min-height: calc(100vh - 104px); display: flex; flex-direction: column; }
      h1, h2, h3 { line-height: 1.15; margin: 0 0 16px; }
      p, div, li, blockquote, aside { line-height: 1.7; margin: 0 0 12px; }
      blockquote { border-left: 3px solid #cbd5e1; padding-left: 14px; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#334155'}; }
      aside { background: ${documentTheme === 'midnight' ? 'rgba(255,255,255,0.06)' : '#f8fafc'}; border: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; border-radius: 14px; padding: 14px; }
      table { width: 100%; border-collapse: collapse; margin: 18px 0; }
      th, td { border: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#dbe3ef'}; padding: 10px 12px; text-align: left; }
      figure { margin: 18px 0; }
      img { max-width: 100%; border-radius: 12px; }
      figcaption { margin-top: 10px; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 12px; }
      span { white-space: pre-wrap; }
      .docword-export-body { position: relative; z-index: 1; }
      .docword-export-watermark {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        text-transform: uppercase;
        letter-spacing: 0.35em;
        color: ${documentTheme === 'midnight' ? 'rgba(255,255,255,0.08)' : 'rgba(15, 23, 42, 0.08)'};
        font-size: 44px;
        font-weight: 700;
        transform: rotate(-28deg);
        z-index: 0;
        pointer-events: none;
      }
      .docword-export-header { border-bottom: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding-bottom: 12px; margin-bottom: 24px; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 13px; }
      .docword-export-footer { border-top: 1px solid ${documentTheme === 'midnight' ? '#334155' : '#e2e8f0'}; padding-top: 12px; margin-top: auto; color: ${documentTheme === 'midnight' ? '#cbd5e1' : '#475569'}; font-size: 13px; }
    </style>
  </head>
  <body><div class="page-shell"><div class="page">${watermarkText?.trim() ? `<div class="docword-export-watermark">${escapeXml(watermarkText.trim())}</div>` : ''}${html}</div></div></body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      title?: string;
      html?: string;
      plainText?: string;
      watermarkText?: string;
      documentTheme?: string;
      exportProfile?: 'standard' | 'compact';
    };
    const title = payload.title?.trim() || 'DocWord Document';
    const html = payload.html?.trim() || '';
    const plainText = payload.plainText?.trim() || '';
    const exportProfile = payload.exportProfile === 'compact' ? 'compact' : 'standard';
    const fallbackHtml = plainText
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
      .join('');
    const wordHtml = buildWordHtml(
      title,
      html || fallbackHtml || '<p></p>',
      payload.watermarkText,
      exportProfile === 'compact' ? 'classic' : payload.documentTheme,
    );

    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="html" ContentType="text/html"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
    );
    zip.folder('_rels')?.file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    );
    zip.folder('word')?.file('document.xml', buildDocxDocumentXml());
    zip.folder('word')?.file(
      'styles.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`,
    );
    zip.folder('word')?.file('afchunk.html', wordHtml);
    zip.folder('word')?.folder('_rels')?.file(
      'document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.html"/>
</Relationships>`,
    );

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${title.replace(/\s+/g, '_')}.docx"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to export DOCX.' }, { status: 500 });
  }
}
