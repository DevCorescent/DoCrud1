/**
 * Advertiser creative upload.
 *
 * Same R2 pipeline and same limits the Superadmin banner uploader already
 * uses — no second upload system. Authenticated advertisers only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/server/auth';
import { isR2Configured, uploadToR2, compressImageForR2 } from '@/lib/server/r2';

export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'ad-banners');
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (!(request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP and GIF images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large — maximum 4 MB' }, { status: 400 });

    const rand = crypto.randomBytes(8).toString('hex');
    const compressed = await compressImageForR2(Buffer.from(await file.arrayBuffer()), file.type);
    const buffer = Buffer.from(compressed.buffer);
    const outType = compressed.contentType;
    const ext = outType === 'image/jpeg' ? 'jpg' : (EXT_MAP[file.type] ?? 'jpg');
    const filename = `ad_${rand}.${ext}`;

    if (isR2Configured()) {
      const url = await uploadToR2(`ad-banners/${filename}`, buffer, outType, { skipCompress: true });
      return NextResponse.json({ url, size: buffer.length });
    }
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return NextResponse.json({ url: `/uploads/ad-banners/${filename}`, size: buffer.length });
  } catch (err) {
    console.error('[ads/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
