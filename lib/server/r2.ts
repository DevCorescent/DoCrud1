import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/** Hard cap for every image uploaded to R2 */
export const R2_MAX_IMAGE_BYTES = 200 * 1024; // 200 KB

let _client: S3Client | null | undefined = undefined;

function getClient(): S3Client | null {
  if (_client !== undefined) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    _client = null;
    return null;
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL,
  );
}

function isCompressibleImage(contentType: string): boolean {
  const t = contentType.toLowerCase().split(';')[0].trim();
  if (!t.startsWith('image/')) return false;
  // Keep SVG as-is (vector); everything else (jpeg/png/webp/gif/avif/heic) gets compressed
  return t !== 'image/svg+xml';
}

function withJpegExtension(key: string): string {
  if (/\.jpe?g$/i.test(key)) return key;
  if (/\.[a-z0-9]+$/i.test(key)) return key.replace(/\.[a-z0-9]+$/i, '.jpg');
  return `${key}.jpg`;
}

/**
 * Compress an image buffer to ≤ maxBytes (default 200 KB) using sharp.
 * Output is JPEG for maximum size reduction. Non-images / failures return input unchanged.
 */
export async function compressImageForR2(
  buffer: Buffer,
  contentType: string,
  options?: { maxBytes?: number; maxDimension?: number },
): Promise<{ buffer: Buffer; contentType: string; compressed: boolean }> {
  const maxBytes = options?.maxBytes ?? R2_MAX_IMAGE_BYTES;
  const maxDimension = options?.maxDimension ?? 1920;

  if (!isCompressibleImage(contentType)) {
    return { buffer, contentType, compressed: false };
  }

  // Already small enough — keep original (preserves small PNG transparency, etc.)
  if (buffer.length <= maxBytes) {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer, { failOn: 'none' }).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w <= maxDimension && h <= maxDimension) {
        return { buffer, contentType, compressed: false };
      }
    } catch {
      return { buffer, contentType, compressed: false };
    }
  }

  try {
    const sharp = (await import('sharp')).default;
    const dimensions = [maxDimension, 1600, 1280, 1024, 800, 640, 480];
    const qualities = [82, 74, 66, 58, 50, 42, 35, 28];

    for (const dim of dimensions) {
      for (const quality of qualities) {
        const out = await sharp(buffer, { animated: false, failOn: 'none' })
          .rotate() // honor EXIF orientation
          .resize(dim, dim, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
          .toBuffer();

        if (out.length <= maxBytes) {
          console.log(
            `[r2-compress] ${buffer.length} → ${out.length} bytes (dim≤${dim}, q=${quality})`,
          );
          return { buffer: out, contentType: 'image/jpeg', compressed: true };
        }
      }
    }

    // Absolute last resort
    const last = await sharp(buffer, { animated: false, failOn: 'none' })
      .rotate()
      .resize(360, 360, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 22, mozjpeg: true })
      .toBuffer();
    console.warn(
      `[r2-compress] fallback ${buffer.length} → ${last.length} bytes (may still exceed ${maxBytes})`,
    );
    return { buffer: last, contentType: 'image/jpeg', compressed: true };
  } catch (err) {
    console.error('[r2-compress] failed, uploading original', err);
    return { buffer, contentType, compressed: false };
  }
}

/**
 * Upload a buffer to R2 and return the public URL.
 * Images are automatically compressed to ≤ 200 KB before upload.
 * Key should include the prefix path, e.g. "profiles/avatar_abc.jpg"
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
  opts?: { skipCompress?: boolean },
): Promise<string> {
  const client = getClient();
  if (!client) throw new Error('R2 is not configured');

  let uploadBody = body;
  let uploadType = contentType || 'application/octet-stream';
  let uploadKey = key;

  if (!opts?.skipCompress && isCompressibleImage(uploadType)) {
    const result = await compressImageForR2(uploadBody, uploadType);
    uploadBody = result.buffer;
    uploadType = result.contentType;
    if (result.compressed && result.contentType === 'image/jpeg') {
      uploadKey = withJpegExtension(uploadKey);
    }
  }

  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: uploadKey,
    Body: uploadBody,
    ContentType: uploadType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
  return `${base}/${uploadKey}`;
}

/** Delete an object from R2 by key. Non-fatal — ignores errors. */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }));
  } catch { /* non-fatal */ }
}

/** Extract the R2 key from a full public URL. Returns null if the URL is not from R2. */
export function r2KeyFromUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!base || !url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}

/** Returns true if the string looks like an external storage URL (not a base64 data URL). */
export function isStorageUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}

/**
 * Compress an image for feed thumbnails (max 800px, ≤ 200 KB),
 * upload to R2 at thumbnails/{id}.jpg, and return the public R2 URL.
 */
export async function compressAndUploadThumbnail(
  id: string,
  buffer: Buffer,
): Promise<string> {
  const { buffer: compressed, contentType } = await compressImageForR2(buffer, 'image/jpeg', {
    maxBytes: R2_MAX_IMAGE_BYTES,
    maxDimension: 800,
  });
  const key = `thumbnails/${id}.jpg`;
  return uploadToR2(key, compressed, contentType, { skipCompress: true });
}
