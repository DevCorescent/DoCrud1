export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/server/auth';
import { isR2Configured, uploadToR2 } from '@/lib/server/r2';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'chat');
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'application/zip': 'zip',
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large — maximum 20 MB' }, { status: 400 });

    const isImage  = IMAGE_TYPES.has(file.type);
    const ext      = EXT_MAP[file.type] ?? 'bin';
    const rand     = crypto.randomBytes(8).toString('hex');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const filename = `${rand}_${safeName}.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    if (isR2Configured()) {
      const url = await uploadToR2(`chat/${filename}`, buffer, file.type || 'application/octet-stream');
      return NextResponse.json({ url, name: file.name, size: file.size, mimeType: file.type, type: isImage ? 'image' : 'file' });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return NextResponse.json({
      url: `/uploads/chat/${filename}`,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      type: isImage ? 'image' : 'file',
    });
  } catch (e) {
    console.error('Chat upload error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
