/**
 * POST /api/super-admin/mail/upload — images for the email composer.
 *
 * Identical in shape to the SEO and ad-banner upload routes: the shared
 * `uploadToR2` helper when R2 is configured, `public/uploads/` otherwise, the
 * same Super Admin guard, the same compression. Only the destination folder
 * differs. This is not a new storage system.
 *
 * ICO is absent (it is a favicon format, not an email image) and SVG stays
 * absent because it can carry script and these files are served from our own
 * origin. The returned URL is later re-validated by the email sanitizer before
 * it can reach a recipient.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { isR2Configured, uploadToR2, compressImageForR2 } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'mail');
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — matches ad-banners.

/* SVG is deliberately absent. It can carry script, and these files are served
   from our own origin and referenced from <head>; a favicon is not worth the
   stored-XSS surface. */
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
]);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
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
        { error: 'Only PNG, JPEG, WebP and GIF images are allowed' }, { status: 400 });
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
    const ext = outType === 'image/jpeg' ? 'jpg' : (EXT_MAP[file.type] ?? 'png');
    const filename = `mail_${rand}.${ext}`;

    if (isR2Configured()) {
      const url = await uploadToR2(`mail/${filename}`, buffer, outType, { skipCompress: true });
      return NextResponse.json({ url, size: buffer.length });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return NextResponse.json({ url: `/uploads/mail/${filename}`, size: buffer.length });
  } catch (err) {
    console.error('[super-admin/mail/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
