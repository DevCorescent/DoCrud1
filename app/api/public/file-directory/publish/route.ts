import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendFileTransfer, getFileTransfers, updateFileTransfer } from '@/lib/server/file-transfers';
import { recordPost, checkAndGrantMilestones } from '@/lib/server/credits';
import { readJsonFile } from '@/lib/server/storage';
import { getProfileData } from '@/lib/server/user-profiles';
import path from 'path';
import fs from 'fs';
import type { SecureFileTransfer } from '@/types/document';

export const dynamic = 'force-dynamic';

const MAX_PUBLIC_BYTES = 15 * 1024 * 1024;
const MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // 2 MB hard limit for thumbnails
const THUMBNAILS_DIR = path.join(process.cwd(), 'data', 'thumbnails');

function isImageMime(mimeType: string) {
  return mimeType.toLowerCase().startsWith('image/');
}

/**
 * Save a data:... thumbnail to disk and return the public URL path.
 * Returns null if the dataUrl is empty or invalid.
 */
function saveThumbnail(transferId: string, dataUrl: string): string | null {
  try {
    if (!dataUrl?.startsWith('data:image/')) return null;
    const [header, base64] = dataUrl.split(',');
    if (!header || !base64) return null;

    // Derive extension from mime type
    const mime = header.replace('data:', '').replace(';base64', '').toLowerCase();
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'image/gif': 'gif',
    };
    const ext = extMap[mime] ?? 'jpg';

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_THUMBNAIL_BYTES) return null; // silently drop oversized

    if (!fs.existsSync(THUMBNAILS_DIR)) {
      fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    const fileName = `${transferId}.${ext}`;
    fs.writeFileSync(path.join(THUMBNAILS_DIR, fileName), buffer);
    return `/api/public/thumbnail/${transferId}`;
  } catch {
    return null;
  }
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
    const sessionName = session?.user?.email || session?.user?.name || 'public-user';
    const userId = session?.user?.id;

    const extra = payload as Record<string, unknown>;
    // If publishing from a business page, use company name as the author display name
    const companyName       = extra.uploadedByName as string | undefined;
    const uploadedBy        = companyName || sessionName;
    const uploadedByName    = companyName || undefined;
    const avatarUrl         = extra.avatarUrl as string | undefined;
    const businessPageSlug  = extra.businessPageSlug as string | undefined;

    // Resolve user avatar: explicit > Docrud profile > OAuth session image
    const uploaderProfile = userId ? await getProfileData(userId).catch(() => null) : null;
    const resolvedAvatarUrl = avatarUrl || uploaderProfile?.avatarUrl || (session?.user?.image as string | undefined) || undefined;

    // Create the record first (without thumbnail) to get the ID
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
      uploadedByName,
      uploadedByUserId: userId,
      avatarUrl: resolvedAvatarUrl,
      businessPageSlug,
      videoUrl: payload.videoUrl?.trim() || undefined,
      // Store thumbnail as a real file on disk; keep thumbnailUrl as the API path only
      thumbnailUrl: (() => {
        const raw = payload.thumbnailUrl?.trim();
        if (!raw) return undefined;
        // If it's already an HTTP URL (not a data URL), store as-is
        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
        // It's a data URL — we'll save after creation but need ID; placeholder first
        return raw; // will be overwritten below
      })(),
    });

    // ── Auto-derive thumbnail from main content if it is an image and no explicit thumb was given
    const mainIsImage = isImageMime(payload.mimeType.trim()) && payload.dataUrl.trim().startsWith('data:image/');
    const rawThumb = payload.thumbnailUrl?.trim() || (mainIsImage ? payload.dataUrl.trim() : undefined);

    // Save thumbnail to disk and patch the record with the API URL
    if (rawThumb && rawThumb.startsWith('data:image/')) {
      const thumbApiUrl = saveThumbnail(created.id, rawThumb);
      if (thumbApiUrl) {
        // Replace the huge base64 thumbnailUrl with the lightweight API path
        try {
          await updateFileTransfer(created.id, { thumbnailUrl: thumbApiUrl });
          created.thumbnailUrl = thumbApiUrl;
        } catch { /* non-fatal */ }
      } else {
        // thumbnail save failed — clear it so the feed doesn't show a broken image
        try {
          await updateFileTransfer(created.id, { thumbnailUrl: undefined });
        } catch { /* non-fatal */ }
        created.thumbnailUrl = undefined;
      }
    }

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
