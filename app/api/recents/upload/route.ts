import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { isR2Configured, uploadToR2, compressImageForR2 } from '@/lib/server/r2';
import { promises as fs } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'recents');
const MAX_MB = 20;

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
];

export async function POST(req: Request) {
  const session = await getAuthSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  if (file.size > MAX_MB * 1024 * 1024)
    return NextResponse.json({ error: `Max ${MAX_MB}MB` }, { status: 413 });

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'File type not allowed' }, { status: 415 });

  const isVideo = file.type.startsWith('video/');
  let buffer = Buffer.from(await file.arrayBuffer());
  let outType = file.type;
  let ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';

  if (!isVideo) {
    const compressed = await compressImageForR2(buffer, file.type);
    buffer = Buffer.from(compressed.buffer);
    outType = compressed.contentType;
    if (outType === 'image/jpeg') ext = 'jpg';
  }

  const filename = `${userId}_${Date.now()}.${ext}`;

  if (isR2Configured()) {
    try {
      const url = await uploadToR2(`recents/${filename}`, buffer, outType, { skipCompress: true });
      return NextResponse.json({ url, type: isVideo ? 'video' : 'image', size: buffer.length });
    } catch (err) {
      console.error('[recents/upload] R2 upload failed, falling back to local disk:', err);
    }
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return NextResponse.json({ url: `/recents/${filename}`, type: isVideo ? 'video' : 'image', size: buffer.length });
}
