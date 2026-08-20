import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendFileTransfer, getFileTransfers, updateFileTransfer } from '@/lib/server/file-transfers';
import { recordPost, checkAndGrantMilestones } from '@/lib/server/credits';
import { readJsonFile } from '@/lib/server/storage';
import { getProfileData } from '@/lib/server/user-profiles';
import { isR2Configured, compressAndUploadThumbnail, uploadToR2, compressImageForR2 } from '@/lib/server/r2';
import path from 'path';
import fs from 'fs';
import type { SecureFileTransfer } from '@/types/document';
import { sanitizeCta } from '@/lib/cta';
import { publicationBodyError, isPublicationBodyOverLimit } from '@/lib/publication-body';
import { getFeedConfig } from '@/lib/server/feed-config';

export const dynamic = 'force-dynamic';

const MAX_PUBLIC_BYTES = 15 * 1024 * 1024;
const MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // 2 MB hard limit for thumbnails
const THUMBNAILS_DIR = path.join(process.cwd(), 'data', 'thumbnails');

function isImageMime(mimeType: string) {
  return mimeType.toLowerCase().startsWith('image/');
}

/**
 * Move image payload out of Mongo base64 into Cloudflare R2.
 * - Single image → store public HTTPS URL in dataUrl
 * - HTML gallery → rewrite embedded data:image srcs to R2 URLs
 * Returns null when R2 is off or content has nothing to offload.
 */
async function offloadImagesToR2(
  transferId: string,
  mimeType: string,
  dataUrl: string,
): Promise<{ dataUrl: string; mimeType: string; sizeInBytes: number; firstImageUrl?: string } | null> {
  if (!isR2Configured()) return null;

  // ── Single image ──────────────────────────────────────────────────────────
  if (isImageMime(mimeType) && dataUrl.startsWith('data:image/')) {
    const [, b64] = dataUrl.split(',');
    if (!b64) return null;
    const raw = Buffer.from(b64, 'base64');
    const { buffer, contentType } = await compressImageForR2(raw, mimeType);
    const url = await uploadToR2(`posts/${transferId}.jpg`, buffer, contentType, { skipCompress: true });
    console.log(`[publish] image → R2: ${url} (${buffer.length} bytes)`);
    return {
      dataUrl: url,
      mimeType: contentType || 'image/jpeg',
      sizeInBytes: buffer.length,
      firstImageUrl: url,
    };
  }

  // ── HTML gallery with embedded base64 images ──────────────────────────────
  if (mimeType === 'text/html' && dataUrl.startsWith('data:text/html')) {
    const htmlB64 = dataUrl.split(',')[1];
    if (!htmlB64) return null;
    let html = Buffer.from(htmlB64, 'base64').toString('utf-8');
    const re = /src=(["'])(data:image\/[^;]+;base64,[^"']+)\1/gi;
    const matches = Array.from(html.matchAll(re));
    if (matches.length === 0) return null;

    let firstImageUrl: string | undefined;
    let i = 0;
    for (const m of matches) {
      const fullDataUrl = m[2];
      if (!fullDataUrl) continue;
      const [header, b64] = fullDataUrl.split(',');
      if (!header || !b64) continue;
      const imgMime = header.replace(/^data:/i, '').replace(/;base64$/i, '').toLowerCase();
      const raw = Buffer.from(b64, 'base64');
      const { buffer, contentType } = await compressImageForR2(raw, imgMime || 'image/jpeg');
      const url = await uploadToR2(`posts/${transferId}/${i}.jpg`, buffer, contentType, { skipCompress: true });
      if (!firstImageUrl) firstImageUrl = url;
      html = html.split(fullDataUrl).join(url);
      i += 1;
    }

    if (i === 0) return null;
    const out = Buffer.from(html, 'utf-8');
    const newDataUrl = `data:text/html;base64,${out.toString('base64')}`;
    console.log(`[publish] gallery → R2: ${i} image(s), html ${out.length} bytes`);
    return {
      dataUrl: newDataUrl,
      mimeType: 'text/html',
      sizeInBytes: out.length,
      firstImageUrl,
    };
  }

  return null;
}

/**
 * Compress and upload a data:image/... thumbnail.
 * Tries R2 first (compressed JPEG); falls back to local disk.
 * Returns the public URL or null on failure.
 */
async function saveThumbnail(transferId: string, dataUrl: string): Promise<string | null> {
  try {
    if (!dataUrl?.startsWith('data:image/')) return null;
    const [header, base64] = dataUrl.split(',');
    if (!header || !base64) return null;

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_THUMBNAIL_BYTES) return null;

    // ── R2 path (compressed) ────────────────────────────────────────────────
    if (isR2Configured()) {
      try {
        const r2Url = await compressAndUploadThumbnail(transferId, buffer);
        console.log(`[publish] thumbnail → R2: ${r2Url}`);
        return r2Url;
      } catch (e) {
        console.warn('[publish] R2 thumbnail upload failed, falling back to disk:', e);
      }
    }

    // ── Local disk fallback ─────────────────────────────────────────────────
    const mime = header.replace('data:', '').replace(';base64', '').toLowerCase();
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'image/gif': 'gif',
    };
    const ext = extMap[mime] ?? 'jpg';
    if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    fs.writeFileSync(path.join(THUMBNAILS_DIR, `${transferId}.${ext}`), buffer);
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

    /* Body limit. Checked here, not only in the composer, so a direct request
       cannot publish more than the composer allows. The title and the
       structured fields the composer writes into `notes` are excluded — only
       the author's own body text counts. Nothing is truncated: an oversized
       body is rejected and the author keeps their text. */
    /* The limit is read from server configuration, never from the request. */
    const publicationMax = (await getFeedConfig()).publication.maxChars;
    if (isPublicationBodyOverLimit(payload.notes, payload.directoryCategory, publicationMax)) {
      return NextResponse.json({ error: publicationBodyError(publicationMax) }, { status: 400 });
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

    let mimeType = payload.mimeType.trim();
    let dataUrl = payload.dataUrl.trim();
    let finalSize = sizeInBytes;
    let contentFirstImage: string | undefined;

    // Pre-generate transfer id so we can upload to R2 *before* writing Mongo
    // (avoids ever persisting multi-MB base64 blobs when R2 is configured).
    const { randomBytes } = await import('crypto');
    const transferId = `transfer-${Date.now()}-${randomBytes(4).toString('hex')}`;

    try {
      const offloaded = await offloadImagesToR2(transferId, mimeType, dataUrl);
      if (offloaded) {
        mimeType = offloaded.mimeType;
        dataUrl = offloaded.dataUrl;
        finalSize = offloaded.sizeInBytes;
        contentFirstImage = offloaded.firstImageUrl;
      }
    } catch (e) {
      console.warn('[publish] R2 content offload failed; will store payload in Mongo:', e);
    }

    // Resolve thumbnail before create when possible
    let resolvedThumb: string | undefined = (() => {
      const raw = payload.thumbnailUrl?.trim();
      if (!raw) return undefined;
      if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
      return undefined; // data: handled below
    })();

    const rawThumb = payload.thumbnailUrl?.trim();
    if (rawThumb?.startsWith('data:image/')) {
      resolvedThumb = (await saveThumbnail(transferId, rawThumb)) || undefined;
    } else if (!resolvedThumb && contentFirstImage) {
      resolvedThumb = contentFirstImage;
    } else if (!resolvedThumb && isImageMime(mimeType) && dataUrl.startsWith('data:image/')) {
      resolvedThumb = (await saveThumbnail(transferId, dataUrl)) || undefined;
    }

    const created = await appendFileTransfer({
      preferredId: transferId,
      title: payload.title?.trim() || undefined,
      fileName: payload.fileName.trim(),
      mimeType,
      dataUrl,
      sizeInBytes: finalSize,
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
      thumbnailUrl: resolvedThumb,
      // Server is the authority on CTA safety: unsafe schemes
      // (javascript:/data:/vbscript:…) and malformed URLs are dropped here
      // regardless of what the client sent.
      cta: sanitizeCta((payload as { cta?: unknown }).cta) ?? undefined,
    });

    created.thumbnailUrl = resolvedThumb || created.thumbnailUrl;

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
