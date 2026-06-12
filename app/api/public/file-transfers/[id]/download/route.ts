import { NextRequest, NextResponse } from 'next/server';
import { canUnlockFileTransfer, getFileTransfers, recordFileTransferEvent, resolveFileTransferDataUrl } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const transfers = await getFileTransfers();
    const entry = transfers.find((item) => item.shareId === params.id || item.id === params.id);
    if (!entry) {
      return NextResponse.json({ error: 'File transfer not found.' }, { status: 404 });
    }

    const validation = canUnlockFileTransfer(entry, {
      password: request.nextUrl.searchParams.get('password') || undefined,
      filePassword: request.nextUrl.searchParams.get('filePassword') || undefined,
      securePassword: request.nextUrl.searchParams.get('securePassword') || undefined,
      parserPassword: request.nextUrl.searchParams.get('parserPassword') || undefined,
      email: request.nextUrl.searchParams.get('email') || undefined,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const decoded = decodeDataUrl(resolveFileTransferDataUrl(entry, {
      password: request.nextUrl.searchParams.get('password') || undefined,
      securePassword: request.nextUrl.searchParams.get('securePassword') || undefined,
      parserPassword: request.nextUrl.searchParams.get('parserPassword') || undefined,
    }));
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid file content.' }, { status: 400 });
    }

    if (entry.encryptionEnabled) {
      await recordFileTransferEvent(entry.id, 'decrypt');
    }
    await recordFileTransferEvent(entry.id, 'download');

    return new NextResponse(decoded.buffer, {
      status: 200,
      headers: {
        'Content-Type': entry.mimeType || decoded.mimeType,
        'Content-Disposition': `attachment; filename=${entry.fileName.replace(/\s+/g, '_')}`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
}
