import { NextRequest, NextResponse } from 'next/server';
import { analyzeDoxpertContent } from '@/lib/server/doxpert';
import { extractDocumentText } from '@/lib/server/document-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      const title = String(formData.get('title') || 'Uploaded document');
      const question = String(formData.get('question') || '');

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Upload a document or paste text first.' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const extractedText = await extractDocumentText(file.name || title, file.type || 'application/octet-stream', buffer);
      const analysis = await analyzeDoxpertContent({
        title: title || file.name || 'Uploaded document',
        rawContent: extractedText,
        question,
        sourceType: 'upload',
      });

      return NextResponse.json(analysis);
    }

    const payload = await request.json() as {
      title?: string;
      content?: string;
      question?: string;
    };

    const title = payload.title || 'Pasted document';
    const content = payload.content || '';
    const question = payload.question || '';

    if (!content.trim()) {
      return NextResponse.json({ error: 'Paste a document or upload a file first.' }, { status: 400 });
    }

    const analysis = await analyzeDoxpertContent({
      title,
      rawContent: content,
      question,
      sourceType: 'paste',
    });

    return NextResponse.json(analysis);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to run DoXpert demo.' }, { status: 500 });
  }
}
