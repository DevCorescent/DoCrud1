import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendFileTransfer, getFileTransfers } from '@/lib/server/file-transfers';
import { recordPost, checkAndGrantMilestones } from '@/lib/server/credits';
import { readJsonFile } from '@/lib/server/storage';
import path from 'path';
import type { SecureFileTransfer } from '@/types/document';

export const dynamic = 'force-dynamic';

const MAX_PUBLIC_BYTES = 15 * 1024 * 1024;
const MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024;

function isImageMime(mimeType: string) {
  return mimeType.toLowerCase().startsWith('image/');
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as Partial<SecureFileTransfer> & {
      directoryVisibility?: 'public' | 'private';
      authMode?: SecureFileTransfer['authMode'];
      videoUrl?: string;
      thumbnailUrl?: string;
    };

    if (!payload.fileName?.trim() || !payload.mimeType?.trim() || !payload.dataUrl?.trim()) {
      return NextResponse.json({ error: 'fileName, mimeType, and dataUrl are required.' }, { status: 400 });
    }

    const directoryVisibility = payload.directoryVisibility === 'private' ? 'private' : 'public';
    if (directoryVisibility !== 'public') {
      return NextResponse.json({ error: 'Private publishing requires an authenticated workspace session.' }, { status: 401 });
    }

    const sizeInBytes = Number(payload.sizeInBytes || 0);
    const maxBytes = isImageMime(payload.mimeType) ? MAX_PUBLIC_IMAGE_BYTES : MAX_PUBLIC_BYTES;
    if (sizeInBytes > maxBytes) {
      return NextResponse.json({
        error: `File too large. Limit is ${(maxBytes / (1024 * 1024)).toFixed(0)} MB for this type.`,
      }, { status: 413 });
    }

    const session = await getAuthSession();
    const uploadedBy = session?.user?.email || session?.user?.name || 'public-user';
    const userId = session?.user?.id;

    const created = await appendFileTransfer({
      title: payload.title?.trim() || undefined,
      fileName: payload.fileName.trim(),
      mimeType: payload.mimeType.trim(),
      dataUrl: payload.dataUrl.trim(),
      sizeInBytes,
      notes: payload.notes?.trim() || undefined,
      directoryVisibility: 'public',
      directoryCategory: payload.directoryCategory?.trim() || undefined,
      directoryTags: Array.isArray(payload.directoryTags) ? payload.directoryTags.map((t) => String(t).trim()).filter(Boolean) : [],
      authMode: 'public',
      uploadedBy,
      uploadedByUserId: userId,
      videoUrl: payload.videoUrl?.trim() || undefined,
      thumbnailUrl: payload.thumbnailUrl?.trim() || undefined,
    });

    // Fire analytics + milestones for authenticated users (non-blocking)
    if (userId) {
      void (async () => {
        try {
          await recordPost(userId);
          type FollowsData = Record<string, string[]>;
          const [allTransfers, followsData] = await Promise.all([
            getFileTransfers(),
            readJsonFile<FollowsData>(path.join(process.cwd(), 'data', 'follows.json'), {}).catch(() => ({} as FollowsData)),
          ]);
          const publishCount = allTransfers.filter(
            (t) => t.uploadedByUserId === userId && t.directoryVisibility === 'public' && !t.revokedAt,
          ).length;
          const followersCount = Object.values(followsData).filter((arr) => Array.isArray(arr) && arr.includes(userId)).length;
          await checkAndGrantMilestones(userId, { followers: followersCount, publishCount });
        } catch (e) {
          console.error('[publish] analytics error:', e);
        }
      })();
    }

    return NextResponse.json({ transfer: created }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to publish.' }, { status: 500 });
  }
}
