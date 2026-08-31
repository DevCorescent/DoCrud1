/**
 * POST /api/super-admin/seo/upload — accept a branding/social image and return
 * the URL to store in the SEO settings.
 *
 * This is NOT a new storage system. It is the same shape as
 * /api/super-admin/ad-banners/upload: the shared `uploadToR2` helper when R2 is
 * configured, `public/uploads/` otherwise, the same guard, the same
 * compression. Only the destination folder differs, exactly as it does for
 * ad-banners, profile images and ads.
 *
 * The uploaded URL still goes back through PUT /api/super-admin/seo, which
 * re-validates it with `isSafeAssetUrl`. Nothing reaches a <meta> tag by way of
 * this route alone.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { isR2Configured, uploadToR2, compressImageForR2 } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'seo');
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — matches ad-banners.

/* SVG is deliberately absent. It can carry script, and these files are served
   from our own origin and referenced from <head>; a favicon is not worth the
   stored-XSS surface. */
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'image/x-icon', 'image/vnd.microsoft.icon',
]);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
};

export async function POST(request: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(request);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (!(request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Only PNG, JPEG, WebP, GIF and ICO images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large — maximum 4 MB' }, { status: 400 });
    }

    const rand = crypto.randomBytes(8).toString('hex');
    let buffer = Buffer.from(await file.arrayBuffer());
    /* Leaves small images untouched, which preserves logo/favicon transparency. */
    const compressed = await compressImageForR2(buffer, file.type);
    buffer = Buffer.from(compressed.buffer);
    const outType = compressed.contentType;
    const ext = outType === 'image/jpeg' && file.type !== 'image/x-icon'
      ? 'jpg'
      : (EXT_MAP[file.type] ?? 'png');
    const filename = `seo_${rand}.${ext}`;

    if (isR2Configured()) {
      const url = await uploadToR2(`seo/${filename}`, buffer, outType, { skipCompress: true });
      return NextResponse.json({ url, size: buffer.length });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return NextResponse.json({ url: `/uploads/seo/${filename}`, size: buffer.length });
  } catch (err) {
    console.error('[super-admin/seo/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
