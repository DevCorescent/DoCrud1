import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getHistoryEntryById } from '@/lib/server/history';
import { extractDocumentText } from '@/lib/server/document-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function decodePdfDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const historyId = request.nextUrl.searchParams.get('historyId')?.trim();
    if (!historyId) {
      return NextResponse.json({ error: 'historyId is required' }, { status: 400 });
    }

    const entry = await getHistoryEntryById(historyId);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const pdfDataUrl = entry.signedPdfDataUrl || entry.uploadedPdfDataUrl;
    if (!pdfDataUrl?.startsWith('data:application/pdf;base64,')) {
      return NextResponse.json({ error: 'No PDF is available for preview extraction.' }, { status: 400 });
    }

    const buffer = decodePdfDataUrl(pdfDataUrl);
    if (!buffer) {
      return NextResponse.json({ error: 'Invalid PDF payload.' }, { status: 400 });
    }

    const fileName = entry.signedPdfFileName || entry.uploadedPdfFileName || `${entry.templateName || 'document'}.pdf`;
    const extractedContent = await extractDocumentText(fileName, 'application/pdf', buffer);

    return NextResponse.json({
      title: entry.templateName || fileName.replace(/\.[^.]+$/, ''),
      sourceType: 'preview',
      extractionMethod: 'history_pdf_extraction',
      extractedContent,
      extractedCharacterCount: extractedContent.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract preview text.' },
      { status: 500 },
    );
  }
}

