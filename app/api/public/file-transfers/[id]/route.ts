import { NextRequest, NextResponse } from 'next/server';
import { canUnlockFileTransfer, getFileTransfers, isPreviewableFile, recordFileTransferEvent, resolveFileTransferDataUrl } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const transfers = await getFileTransfers();
    const entry = transfers.find((item) => item.shareId === params.id || item.id === params.id);
    if (!entry) {
      return NextResponse.json({ error: 'File transfer not found.' }, { status: 404 });
    }

    const password = request.nextUrl.searchParams.get('password') || undefined;
    const filePassword = request.nextUrl.searchParams.get('filePassword') || undefined;
    const securePassword = request.nextUrl.searchParams.get('securePassword') || undefined;
    const parserPassword = request.nextUrl.searchParams.get('parserPassword') || undefined;
    const email = request.nextUrl.searchParams.get('email') || undefined;
    const needsUnlock = entry.authMode === 'password' || entry.authMode === 'email' || entry.authMode === 'password_and_email' || entry.authMode === 'triple_password';
    const validation = needsUnlock || entry.fileAccessPassword
      ? canUnlockFileTransfer(entry, { password, filePassword, email, securePassword, parserPassword })
      : { ok: true };
    const unlocked = validation.ok;
    let previewUrl: string | undefined;

    if (unlocked) {
      if (entry.encryptionEnabled && isPreviewableFile(entry.mimeType)) {
        previewUrl = resolveFileTransferDataUrl(entry, { password, securePassword, parserPassword });
        await recordFileTransferEvent(entry.id, 'decrypt');
      }
      await recordFileTransferEvent(entry.id, 'open');
    }

    return NextResponse.json({
      id: entry.id,
      shareId: entry.shareId,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      notes: entry.notes,
      authMode: entry.authMode,
      directoryVisibility: entry.directoryVisibility,
      directoryCategory: entry.directoryCategory,
      requiresPassword: entry.authMode === 'password' || entry.authMode === 'password_and_email' || entry.authMode === 'triple_password',
      requiresSecurePassword: entry.authMode === 'triple_password',
      requiresParserPassword: entry.authMode === 'triple_password',
      requiresEmail: entry.authMode === 'email' || entry.authMode === 'password_and_email',
      requiresFilePassword: Boolean(entry.fileAccessPassword),
      passwordValidated: unlocked,
      previewable: unlocked ? isPreviewableFile(entry.mimeType) : false,
      previewUrl: unlocked && isPreviewableFile(entry.mimeType) ? (previewUrl || entry.dataUrl) : undefined,
      openCount: entry.openCount,
      downloadCount: entry.downloadCount,
      expiresAt: entry.expiresAt,
      recipientEmailHint: entry.recipientEmail ? entry.recipientEmail.replace(/(^.).+(@.+$)/, '$1***$2') : undefined,
      encryptionEnabled: entry.encryptionEnabled,
      error: unlocked ? undefined : validation.error || undefined,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load file transfer' }, { status: 500 });
  }
}
