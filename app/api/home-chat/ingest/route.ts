import { NextRequest, NextResponse } from 'next/server';
import { extractDocumentText } from '@/lib/server/document-parser';
import { analyzeUploadedDocumentMeta } from '@/lib/server/doc-assistant';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractDocumentText(file.name, file.type || '', buffer);
    const meta = await analyzeUploadedDocumentMeta({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: buffer.length,
      extractedText,
    });

    return NextResponse.json({
      document: {
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: buffer.length,
        extractedText,
        extractedAt: new Date().toISOString(),
        meta,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to process document' }, { status: 500 });
  }
}

