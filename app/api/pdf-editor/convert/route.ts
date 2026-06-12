import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { extractDocumentText } from '@/lib/server/document-parser';
import { preserveDocumentStructure } from '@/lib/document-parser-analysis';
import { generateAiText, isAiConfigured } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildFallbackTitle(fileName: string, text: string) {
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean);
  if (firstLine && firstLine.length <= 80) {
    return firstLine;
  }
  return fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim() || 'Editable PDF Document';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Please upload a PDF file.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported here.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractDocumentText(file.name, file.type || 'application/pdf', buffer);
    const normalizedText = preserveDocumentStructure(extractedText);
    if (!normalizedText.trim()) {
      return NextResponse.json({ error: 'This PDF did not produce enough editable text.' }, { status: 422 });
    }

    let pageCount = 0;
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      pageCount = pdfDoc.getPageCount();
    } catch {
      pageCount = 0;
    }

    let polishedText = normalizedText;
    let documentTitle = buildFallbackTitle(file.name, normalizedText);
    let summary = 'Editable document prepared from your PDF.';
    let extractionMode: 'ai' | 'standard' = 'standard';

    if (isAiConfigured()) {
      try {
        const aiText = await generateAiText([
          {
            role: 'system',
            content: 'You clean extracted PDF text into a well-structured editable document. Return strict JSON with keys: title, summary, polishedText. Keep the meaning accurate. Do not invent details.',
          },
          {
            role: 'user',
            content: `File name: ${file.name}\n\nExtracted text:\n${normalizedText.slice(0, 18000)}`,
          },
        ]);

        const parsed = JSON.parse(aiText.match(/```json\s*([\s\S]*?)```/i)?.[1] || aiText);
        documentTitle = String(parsed?.title || documentTitle).trim() || documentTitle;
        summary = String(parsed?.summary || summary).trim() || summary;
        polishedText = preserveDocumentStructure(String(parsed?.polishedText || normalizedText));
        extractionMode = 'ai';
      } catch {
        extractionMode = 'standard';
      }
    }

    return NextResponse.json({
      fileName: file.name,
      pageCount,
      extractedCharacters: normalizedText.length,
      extractionMode,
      title: documentTitle,
      summary,
      extractedText: normalizedText,
      editableText: polishedText,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to convert this PDF right now.' },
      { status: 500 },
    );
  }
}
