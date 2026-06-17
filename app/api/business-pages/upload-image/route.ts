export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById } from '@/lib/server/business-pages';
import { isR2Configured, uploadToR2 } from '@/lib/server/r2';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'businesses');
const MAX_BYTES  = 8 * 1024 * 1024; // 8 MB
const ALLOWED    = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png',  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form   = await req.formData();
    const file   = form.get('file');
    const type   = String(form.get('type') ?? 'logo'); // 'logo' | 'cover'
    const pageId = String(form.get('pageId') ?? '');

    if (pageId) {
      const page = await getBusinessPageById(pageId);
      if (!page || page.ownerUserId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only JPEG, PNG, WebP allowed' }, { status: 400 });
    if (file.size > MAX_BYTES)   return NextResponse.json({ error: 'File too large — max 8 MB' }, { status: 400 });

    const uid      = session.user.id.replace(/[^a-z0-9]/gi, '').slice(0, 10);
    const rand     = crypto.randomBytes(6).toString('hex');
    const ext      = EXT_MAP[file.type] ?? 'jpg';
    const filename = `${type}_${uid}_${rand}.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    if (isR2Configured()) {
      const url = await uploadToR2(`businesses/${filename}`, buffer, file.type);
      return NextResponse.json({ url });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return NextResponse.json({ url: `/uploads/businesses/${filename}` });
  } catch (err) {
    console.error('[business/upload-image]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
