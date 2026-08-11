import { NextRequest, NextResponse } from 'next/server';
import { canUnlockFileTransfer, getFileTransferById, recordFileTransferEvent, resolveFileTransferDataUrl } from '@/lib/server/file-transfers';
import { isStorageUrl } from '@/lib/server/r2';

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
    const entry = await getFileTransferById(params.id);
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

    const resolvedUrl = resolveFileTransferDataUrl(entry, {
      password: request.nextUrl.searchParams.get('password') || undefined,
      securePassword: request.nextUrl.searchParams.get('securePassword') || undefined,
      parserPassword: request.nextUrl.searchParams.get('parserPassword') || undefined,
    });

    if (entry.encryptionEnabled) {
      await recordFileTransferEvent(entry.id, 'decrypt');
    }
    await recordFileTransferEvent(entry.id, 'download');

    // File stored in R2 — proxy the response so auth checks are enforced
    if (isStorageUrl(resolvedUrl)) {
      const r2Res = await fetch(resolvedUrl);
      if (!r2Res.ok) return NextResponse.json({ error: 'File not available.' }, { status: 502 });
      const buffer = Buffer.from(await r2Res.arrayBuffer());
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': entry.mimeType || r2Res.headers.get('content-type') || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${entry.fileName.replace(/\s+/g, '_')}"`,
        },
      });
    }

    const decoded = decodeDataUrl(resolvedUrl);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid file content.' }, { status: 400 });
    }

    return new NextResponse(decoded.buffer, {
      status: 200,
      headers: {
        'Content-Type': entry.mimeType || decoded.mimeType,
        'Content-Disposition': `attachment; filename="${entry.fileName.replace(/\s+/g, '_')}"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
}
