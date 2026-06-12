import { NextRequest, NextResponse } from 'next/server';
import { appendFileTransfer } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      fileName?: string;
      mimeType?: string;
      dataUrl?: string;
      sizeInBytes?: number;
      accessPassword?: string;
      notes?: string;
    };

    if (!payload.fileName?.trim() || !payload.mimeType?.trim() || !payload.dataUrl?.trim()) {
      return NextResponse.json({ error: 'File name, mime type, and file data are required.' }, { status: 400 });
    }

    const transfer = await appendFileTransfer({
      title: 'Guest demo transfer',
      fileName: payload.fileName.trim(),
      mimeType: payload.mimeType.trim(),
      dataUrl: payload.dataUrl.trim(),
      sizeInBytes: Number(payload.sizeInBytes || 0),
      notes: payload.notes?.trim() || 'Created from the homepage guest transfer tutorial.',
      directoryVisibility: 'private',
      authMode: 'password',
      accessPassword: payload.accessPassword?.trim().toUpperCase() || 'DOCRUD',
      uploadedBy: 'guest@docrud.app',
      uploadedByUserId: 'guest-demo',
      organizationName: 'Docrud Guest Demo',
    });

    return NextResponse.json({
      shareId: transfer.shareId,
      shareUrl: transfer.shareUrl,
      fileName: transfer.fileName,
      accessPassword: transfer.accessPassword,
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create guest transfer.' }, { status: 500 });
  }
}
