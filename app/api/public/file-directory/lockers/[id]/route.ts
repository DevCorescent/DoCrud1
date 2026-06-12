import { NextRequest, NextResponse } from 'next/server';
import { getFileLockerById } from '@/lib/server/file-lockers';
import { getFileTransfers } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const locker = await getFileLockerById(params.id);
    if (!locker) {
      return NextResponse.json({ error: 'Locker not found.' }, { status: 404 });
    }

    const password = (request.nextUrl.searchParams.get('password') || '').trim().toUpperCase();
    const unlocked = password && password === locker.currentPassword;
    const transfers = await getFileTransfers();
    const files = transfers
      .filter((item) => !item.revokedAt && item.lockerId === locker.id)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .map((item) => ({
        id: item.id,
        shareId: item.shareId,
        fileName: item.fileName,
        title: item.title || item.fileName,
        notes: item.notes,
        mimeType: item.mimeType,
        sizeInBytes: item.sizeInBytes,
        directoryCategory: item.directoryCategory,
        directoryTags: item.directoryTags || [],
        fileAccessPasswordEnabled: Boolean(item.fileAccessPassword),
        linkHref: `/transfer/${item.shareId}`,
        openCount: item.openCount,
        downloadCount: item.downloadCount,
        updatedAt: item.updatedAt,
      }));

    return NextResponse.json({
      id: locker.id,
      name: locker.name,
      description: locker.description,
      category: locker.category,
      passwordVersion: locker.passwordVersion,
      passwordRotationDays: locker.passwordRotationDays,
      fileCount: files.length,
      unlocked,
      files: unlocked ? files : [],
      history: locker.history.slice(0, 8),
      error: unlocked ? undefined : 'Enter the locker password to open this folder.',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to load locker.' }, { status: 500 });
  }
}
