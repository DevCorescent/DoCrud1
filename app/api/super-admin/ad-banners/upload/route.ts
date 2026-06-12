import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'ad-banners');
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function POST(request: NextRequest) {
  const session = await guard(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP and GIF images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large — maximum 4 MB' }, { status: 400 });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const rand = crypto.randomBytes(8).toString('hex');
    const ext = EXT_MAP[file.type] ?? 'jpg';
    const filename = `banner_${rand}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filepath, buffer);

    const url = `/uploads/ad-banners/${filename}`;
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[super-admin/ad-banners/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
