import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendFileManagerFolder, getFileManagerFolders, removeFileManagerFolder, updateFileManagerFolder } from '@/lib/server/file-manager';
import { getFileTransfers, patchFileTransfersByFolderId, saveFileTransfers } from '@/lib/server/file-transfers';
import { getDbPool } from '@/lib/server/database';
import { FileManagerFolder } from '@/types/document';

export const dynamic = 'force-dynamic';

function canUseFileManager(role?: string) {
  return role === 'admin' || role === 'client' || role === 'individual';
}

function canSeeFolder(session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>['user'], folder: FileManagerFolder) {
  return session.role === 'admin'
    || (session.role === 'client' && folder.organizationId === session.id)
    || folder.createdBy.toLowerCase() === (session.email || '').toLowerCase()
    || folder.createdByUserId === session.id;
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseFileManager(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const folders = await getFileManagerFolders();
    const visible = folders.filter((folder) => canSeeFolder(session.user, folder));
    return NextResponse.json(visible);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load folders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseFileManager(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as Partial<FileManagerFolder>;
    if (!payload.name?.trim()) {
      return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 });
    }

    const folder = await appendFileManagerFolder({
      name: payload.name.trim(),
      description: payload.description?.trim() || undefined,
      colorTone: payload.colorTone,
      createdBy: session.user.email || session.user.name || 'docrud user',
      createdByUserId: session.user.id,
      organizationId: session.user.role === 'client' ? session.user.id : undefined,
      organizationName: session.user.role === 'client' ? (session.user.organizationName || session.user.name || 'Business Workspace') : undefined,
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseFileManager(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as { id?: string; name?: string; description?: string; colorTone?: FileManagerFolder['colorTone'] };
    if (!payload.id) {
      return NextResponse.json({ error: 'Folder ID is required.' }, { status: 400 });
    }

    const updated = await updateFileManagerFolder(payload.id, (folder) => {
      if (!canSeeFolder(session.user, folder)) {
        return null;
      }

      return {
        ...folder,
        name: payload.name?.trim() || folder.name,
        description: payload.description?.trim() || undefined,
        colorTone: payload.colorTone || folder.colorTone,
        updatedAt: new Date().toISOString(),
      };
    });

    if (!updated) {
      return NextResponse.json({ error: 'Folder not found or not permitted.' }, { status: 404 });
    }

    if (payload.name?.trim()) {
      if (getDbPool()) {
        await patchFileTransfersByFolderId(updated.id, { folderName: updated.name });
      } else {
        const transfers = await getFileTransfers();
        await saveFileTransfers(transfers.map((entry) => entry.folderId === updated.id ? { ...entry, folderName: updated.name } : entry));
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseFileManager(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Folder ID is required.' }, { status: 400 });
    }

    const folders = await getFileManagerFolders();
    const target = folders.find((folder) => folder.id === id);
    if (!target || !canSeeFolder(session.user, target)) {
      return NextResponse.json({ error: 'Folder not found or not permitted.' }, { status: 404 });
    }

    const removed = await removeFileManagerFolder(id);
    if (!removed) {
      return NextResponse.json({ error: 'Folder could not be removed.' }, { status: 500 });
    }

    if (getDbPool()) {
      await patchFileTransfersByFolderId(id, { folderId: null, folderName: null });
    } else {
      const transfers = await getFileTransfers();
      await saveFileTransfers(transfers.map((entry) => entry.folderId === id ? { ...entry, folderId: undefined, folderName: undefined } : entry));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
