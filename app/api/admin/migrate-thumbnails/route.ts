import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/server/database';
import { isR2Configured, compressAndUploadThumbnail } from '@/lib/server/r2';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel max

const THUMBNAILS_DIR = path.join(process.cwd(), 'data', 'thumbnails');

function auth(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get('token');
  return !!token && token === process.env.ADMIN_MIGRATION_SECRET;
}

/** Extract a raw image Buffer from a transfer document. Returns null if no image found. */
function extractImageBuffer(t: Record<string, unknown>, id: string): { buffer: Buffer; mime: string } | null {
  // 1. Local disk cache (fastest)
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
    const p = path.join(THUMBNAILS_DIR, `${id}.${ext}`);
    if (fs.existsSync(p)) {
      return { buffer: fs.readFileSync(p), mime: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
    }
  }

  // 2. Stored thumbnailUrl as data URI
  const thumbUrl = t.thumbnailUrl as string | undefined;
  if (thumbUrl?.startsWith('data:image/')) {
    const [hdr, b64] = thumbUrl.split(',');
    if (hdr && b64) {
      return { buffer: Buffer.from(b64, 'base64'), mime: hdr.replace('data:', '').replace(';base64', '') };
    }
  }

  const dataUrl = t.dataUrl as string | undefined;
  const mimeType = t.mimeType as string | undefined;

  // 3. Main content is an image
  if (mimeType?.startsWith('image/') && dataUrl?.startsWith('data:image/')) {
    const [, b64] = dataUrl.split(',');
    if (b64) return { buffer: Buffer.from(b64, 'base64'), mime: mimeType };
  }

  // 4. HTML post — extract first embedded image
  if (
    mimeType === 'text/html' &&
    dataUrl?.startsWith('data:text/html') &&
    ((t.directoryCategory as string) === 'post' || (t.directoryCategory as string) === 'product')
  ) {
    const htmlB64 = dataUrl.split(',')[1];
    if (htmlB64) {
      const html = Buffer.from(htmlB64, 'base64').toString('utf-8');
      const match = html.match(/src="(data:image\/([^;]+);base64,([^"]{10,}))"/);
      if (match && match[2] && match[3]) {
        return { buffer: Buffer.from(match[3], 'base64'), mime: `image/${match[2]}` };
      }
    }
  }

  return null;
}

/** GET — report how many need migration without doing anything */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getMongoDb();
  if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const total    = await db.collection('file_transfers').countDocuments({ directoryVisibility: 'public', authMode: 'public' });
  const onCloud  = await db.collection('file_transfers').countDocuments({ directoryVisibility: 'public', authMode: 'public', thumbnailUrl: /^https?:\/\// });
  const onApiPath = await db.collection('file_transfers').countDocuments({ directoryVisibility: 'public', authMode: 'public', thumbnailUrl: /^\/api\// });
  const noThumb  = total - onCloud - onApiPath;

  return NextResponse.json({
    total,
    thumbnails: { cloud: onCloud, mongoProxy: onApiPath, none: noThumb },
    r2Configured: isR2Configured(),
    message: `${onCloud} already on R2/cloud · ${onApiPath} proxied via MongoDB · ${noThumb} have no thumbnail`,
  });
}

/** POST — run the migration in batches */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isR2Configured()) return NextResponse.json({ error: 'R2 not configured' }, { status: 500 });

  const { searchParams } = req.nextUrl;
  const batchSize = Math.min(parseInt(searchParams.get('batch') ?? '50', 10), 200);
  const skip      = Math.max(parseInt(searchParams.get('skip')  ?? '0',  10), 0);

  const db = await getMongoDb();
  if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const col = db.collection('file_transfers');

  // Only fetch transfers that do NOT already have a cloud URL
  const transfers = await col.find({
    directoryVisibility: 'public',
    authMode: 'public',
    thumbnailUrl: { $not: /^https?:\/\// },
  }).skip(skip).limit(batchSize).toArray();

  let migrated = 0;
  let skipped  = 0;
  let failed   = 0;
  const errors: string[] = [];

  for (const t of transfers) {
    const id = String((t as Record<string, unknown>).id ?? t._id ?? '');
    try {
      const extracted = extractImageBuffer(t as Record<string, unknown>, id);
      if (!extracted) { skipped++; continue; }

      const r2Url = await compressAndUploadThumbnail(id, extracted.buffer);
      await col.updateOne(
        { $or: [{ _id: id as never }, { id }] },
        { $set: { thumbnailUrl: r2Url, updatedAt: new Date().toISOString() } },
      );
      console.log(`[migrate-thumbnails] ${id} → ${r2Url}`);
      migrated++;
    } catch (e) {
      failed++;
      errors.push(`${id}: ${String(e).slice(0, 120)}`);
    }
  }

  const remaining = await col.countDocuments({
    directoryVisibility: 'public',
    authMode: 'public',
    thumbnailUrl: { $not: /^https?:\/\// },
  });

  return NextResponse.json({
    batch: { size: transfers.length, skip },
    migrated, skipped, failed,
    remaining,
    done: remaining === 0,
    errors: errors.slice(0, 20),
  });
}
