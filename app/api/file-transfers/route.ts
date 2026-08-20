import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendFileTransfer, deleteFileTransferRow, getFileTransfers, saveFileTransfers, updateFileTransfer } from '@/lib/server/file-transfers';
import { getDbPool } from '@/lib/server/database';
import { selectFileTransferRowById, selectFileTransferRowsForUser } from '@/lib/server/db/file-transfers-rows';
import { getProfileData } from '@/lib/server/user-profiles';
import { attachFileToLocker, createFileLocker, ensureLockerRotation, getVisibleLockersForUser } from '@/lib/server/file-lockers';
import { checkDriveQuota } from '@/lib/server/drive-storage';
import { SecureFileTransfer } from '@/types/document';
import { isR2Configured, uploadToR2 } from '@/lib/server/r2';
import { publicationBodyError, isPublicationBodyOverLimit } from '@/lib/publication-body';
import { getFeedConfig } from '@/lib/server/feed-config';

export const dynamic = 'force-dynamic';

function canUseTransfers(role?: string) {
  return role === 'admin' || role === 'client' || role === 'individual';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseTransfers(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Same visibility rules, applied by MongoDB instead of by scanning the whole
    // collection in Node. Falls back to the JSON path when no database is set up.
    if (getDbPool()) {
      const visible = await selectFileTransferRowsForUser({
        role: session.user.role,
        email: session.user.email || '',
        orgId: session.user.id,
      });
      return NextResponse.json(visible);
    }

    const transfers = await getFileTransfers();
    const visible = session.user.role === 'admin'
      ? transfers
      : session.user.role === 'client'
        ? transfers.filter((entry) => entry.organizationId === session.user.id || entry.uploadedBy.toLowerCase() === (session.user.email || '').toLowerCase())
        : transfers.filter((entry) => entry.uploadedBy.toLowerCase() === (session.user.email || '').toLowerCase());

    return NextResponse.json(visible);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load file transfers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseTransfers(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as Partial<SecureFileTransfer> & {
      passwordRotationDays?: number;
    };
    if (!payload.fileName?.trim() || !payload.mimeType?.trim() || !payload.dataUrl?.trim()) {
      return NextResponse.json({ error: 'File name, mime type, and file data are required.' }, { status: 400 });
    }

    const fileSizeBytes = Number(payload.sizeInBytes || 0);
    const quota = await checkDriveQuota(session.user.id, fileSizeBytes);
    if (!quota.allowed) {
      const usedGb    = (quota.usedBytes  / (1024 ** 3)).toFixed(2);
      const limitGb   = quota.limitGb.toFixed(2);
      return NextResponse.json(
        {
          error: `Drive storage limit reached. You have used ${usedGb} GB of your ${limitGb} GB quota. Upgrade your storage plan to upload more files.`,
          code:  'STORAGE_QUOTA_EXCEEDED',
          usedBytes:  quota.usedBytes,
          limitBytes: quota.limitBytes,
        },
        { status: 402 },
      );
    }
    if ((payload.authMode === 'email' || payload.authMode === 'password_and_email') && !payload.recipientEmail?.trim()) {
      return NextResponse.json({ error: 'Recipient email is required for the selected access method.' }, { status: 400 });
    }
    if (payload.authMode === 'triple_password' && !payload.dataUrl?.trim()) {
      return NextResponse.json({ error: 'Encrypted transfers require a valid file payload.' }, { status: 400 });
    }

    let lockerId = payload.lockerId?.trim() || undefined;
    let lockerName = payload.lockerName?.trim() || undefined;
    let accessPassword = payload.accessPassword?.trim().toUpperCase();

    if (payload.directoryVisibility !== 'public') {
      if (lockerId) {
        const visibleLockers = await getVisibleLockersForUser({
          role: session.user.role,
          userId: session.user.id,
          email: session.user.email || undefined,
        });
        const currentLocker = visibleLockers.find((item) => item.id === lockerId);
        if (!currentLocker) {
          return NextResponse.json({ error: 'Locker not found.' }, { status: 404 });
        }
        const activeLocker = await ensureLockerRotation(currentLocker);
        lockerName = activeLocker.name;
        accessPassword = activeLocker.currentPassword;
      } else {
        const createdLocker = await createFileLocker({
          ownerUserId: session.user.id,
          ownerEmail: session.user.email || 'docrud@user.local',
          ownerName: session.user.name || 'docrud user',
          organizationId: session.user.role === 'client' ? session.user.id : undefined,
          organizationName: session.user.role === 'client' ? (session.user.organizationName || session.user.name || 'Business Workspace') : undefined,
          name: lockerName || payload.title?.trim() || payload.fileName.trim(),
          category: payload.directoryCategory?.trim() || undefined,
          password: accessPassword,
          passwordRotationDays: typeof payload.passwordRotationDays === 'number' ? payload.passwordRotationDays : undefined,
        });
        lockerId = createdLocker.id;
        lockerName = createdLocker.name;
        accessPassword = createdLocker.currentPassword;
      }
    }

    // Fetch uploader's avatar from their profile for feed display
    const uploaderProfile = await getProfileData(session.user.id).catch(() => null);
    const avatarUrl = uploaderProfile?.avatarUrl || undefined;

    // Upload file content to R2 for unencrypted transfers.
    // Encrypted transfers keep the base64 payload in MongoDB (encryption is local).
    let resolvedDataUrl = payload.dataUrl.trim();
    if (isR2Configured() && !payload.encryptionEnabled && resolvedDataUrl.startsWith('data:')) {
      try {
        const commaIdx = resolvedDataUrl.indexOf(',');
        if (commaIdx !== -1) {
          const base64Data = resolvedDataUrl.slice(commaIdx + 1);
          const buffer = Buffer.from(base64Data, 'base64');
          const ext = (payload.fileName.trim().split('.').pop() ?? 'bin').toLowerCase();
          const key = `files/${Date.now()}-${payload.fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          resolvedDataUrl = await uploadToR2(key, buffer, payload.mimeType.trim());
        }
      } catch (r2Err) {
        console.error('[file-transfers] R2 upload failed, falling back to base64:', r2Err);
        resolvedDataUrl = payload.dataUrl.trim(); // fallback: keep base64
      }
    }

    const transfer = await appendFileTransfer({
      title: payload.title?.trim() || undefined,
      fileName: payload.fileName.trim(),
      mimeType: payload.mimeType.trim(),
      dataUrl: resolvedDataUrl,
      sizeInBytes: Number(payload.sizeInBytes || 0),
      notes: payload.notes?.trim() || '',
      folderId: payload.folderId?.trim() || undefined,
      folderName: payload.folderName?.trim() || undefined,
      lockerId,
      lockerName,
      directoryVisibility: payload.directoryVisibility === 'public' ? 'public' : 'private',
      directoryCategory: payload.directoryCategory?.trim() || undefined,
      directoryTags: Array.isArray(payload.directoryTags) ? payload.directoryTags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      authMode: payload.authMode || 'password',
      accessPassword,
      fileAccessPassword: payload.fileAccessPassword?.trim().toUpperCase() || undefined,
      securePassword: payload.securePassword?.trim().toUpperCase(),
      parserPassword: payload.parserPassword?.trim().toUpperCase(),
      recipientEmail: payload.recipientEmail?.trim().toLowerCase(),
      maxDownloads: typeof payload.maxDownloads === 'number' ? payload.maxDownloads : undefined,
      expiresAt: payload.expiresAt,
      uploadedBy: session.user.email || session.user.name || 'docrud user',
      uploadedByName: session.user.name || session.user.email?.split('@')[0] || 'Docrud User',
      uploadedByUserId: session.user.id,
      avatarUrl,
      organizationId: session.user.role === 'client' ? session.user.id : undefined,
      organizationName: session.user.role === 'client' ? (session.user.organizationName || session.user.name || 'Business Workspace') : undefined,
    });

    if (lockerId && payload.directoryVisibility !== 'public') {
      await attachFileToLocker(lockerId, transfer.id, {
        actorName: session.user.name || session.user.email || 'docrud user',
        actorUserId: session.user.id,
        fileName: transfer.fileName,
      });
    }

    return NextResponse.json(transfer, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create file transfer' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseTransfers(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as {
      id?: string;
      revoke?: boolean;
      title?: string;
      notes?: string;
      folderId?: string;
      folderName?: string;
      directoryVisibility?: 'public' | 'private';
      directoryCategory?: string;
      directoryTags?: string[];
      accessPassword?: string;
      authMode?: SecureFileTransfer['authMode'];
    };
    if (!payload.id) {
      return NextResponse.json({ error: 'Transfer ID is required.' }, { status: 400 });
    }

    /* Editing a published item must answer to the same body limit as creating
       one, otherwise the rule could be side-stepped by publishing short and
       editing long. Private transfers keep their existing behaviour: `notes`
       there is a note to the recipient, not a publication body. */
    /* Resolved before the synchronous updater runs, and read from server
       configuration rather than the request. */
    const publicationMax = (await getFeedConfig()).publication.maxChars;
    let bodyTooLong = false;

    const updated = await updateFileTransfer(payload.id, (entry) => {
      const allowed = session.user.role === 'admin'
        || entry.uploadedBy.toLowerCase() === (session.user.email || '').toLowerCase()
        || (session.user.role === 'client' && entry.organizationId === session.user.id);
      if (!allowed) {
        return null;
      }

      const nextVisibility = payload.directoryVisibility ?? entry.directoryVisibility;
      const nextCategory = payload.directoryCategory ?? entry.directoryCategory;
      if (payload.notes !== undefined && nextVisibility === 'public' && isPublicationBodyOverLimit(payload.notes, nextCategory, publicationMax)) {
        bodyTooLong = true;
        return null;
      }

      return {
        ...entry,
        title: payload.title !== undefined ? payload.title.trim() || undefined : entry.title,
        notes: payload.notes !== undefined ? payload.notes.trim() || undefined : entry.notes,
        folderId: payload.folderId !== undefined ? payload.folderId || undefined : entry.folderId,
        folderName: payload.folderName !== undefined ? payload.folderName || undefined : entry.folderName,
        directoryVisibility: payload.directoryVisibility !== undefined ? payload.directoryVisibility : entry.directoryVisibility,
        directoryCategory: payload.directoryCategory !== undefined ? payload.directoryCategory.trim() || undefined : entry.directoryCategory,
        directoryTags: payload.directoryTags !== undefined ? payload.directoryTags.map((tag) => String(tag).trim()).filter(Boolean) : entry.directoryTags,
        authMode: payload.authMode !== undefined ? payload.authMode : entry.authMode,
        accessPassword: payload.accessPassword !== undefined ? payload.accessPassword.trim().toUpperCase() || undefined : entry.accessPassword,
        revokedAt: payload.revoke ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      };
    });

    if (bodyTooLong) {
      return NextResponse.json({ error: publicationBodyError(publicationMax) }, { status: 400 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Transfer not found or not permitted.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update file transfer' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseTransfers(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Transfer ID is required.' }, { status: 400 });
    }

    // In DB mode fetch only the target row; fall back to full list scan for JSON mode.
    const target = getDbPool()
      ? await selectFileTransferRowById(id)
      : (await getFileTransfers()).find((entry) => entry.id === id || entry.shareId === id) ?? null;

    if (!target) {
      return NextResponse.json({ error: 'Transfer not found.' }, { status: 404 });
    }

    const allowed = session.user.role === 'admin'
      || (target.uploadedBy || '').toLowerCase() === (session.user.email || '').toLowerCase()
      || (session.user.role === 'client' && target.organizationId === session.user.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
    }

    if (getDbPool()) {
      await deleteFileTransferRow(target.id);
    } else {
      const transfers = await getFileTransfers();
      await saveFileTransfers(transfers.filter((entry) => entry.id !== target.id));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete file transfer' }, { status: 500 });
  }
}
