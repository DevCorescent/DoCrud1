import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'recents');
const MAX_MB = 20;

export async function POST(req: Request) {
  const session = await getAuthSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  if (file.size > MAX_MB * 1024 * 1024)
    return NextResponse.json({ error: `Max ${MAX_MB}MB` }, { status: 413 });

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: 'File type not allowed' }, { status: 415 });

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const filename = `${userId}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

  const isVideo = file.type.startsWith('video/');
  return NextResponse.json({ url: `/recents/${filename}`, type: isVideo ? 'video' : 'image' });
}
