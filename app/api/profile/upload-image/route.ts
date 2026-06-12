export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/server/auth';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'profile');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const type = String(form.get('type') ?? 'avatar'); // 'avatar' | 'banner'

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP and GIF images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large — maximum 5 MB' }, { status: 400 });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const uid = session.user.id.replace(/[^a-z0-9]/gi, '').slice(0, 12);
    const rand = crypto.randomBytes(6).toString('hex');
    const ext = EXT_MAP[file.type] ?? 'jpg';
    const filename = `${type}_${uid}_${rand}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filepath, buffer);

    const url = `/uploads/profile/${filename}`;
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[profile/upload-image]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
