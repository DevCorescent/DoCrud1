import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isR2Configured, compressAndUploadThumbnail } from '@/lib/server/r2';
import { updateFileTransfer } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

const THUMBNAILS_DIR = path.join(process.cwd(), 'data', 'thumbnails');

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const EXT_FROM_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Opportunistically save buffer to disk so the next request hits the file cache. */
function saveToDisk(id: string, buffer: Buffer, mimeType: string) {
  void (async () => {
    try {
      const ext = EXT_FROM_MIME[mimeType] ?? 'jpg';
      if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
      const dest = path.join(THUMBNAILS_DIR, `${id}.${ext}`);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer);
    } catch { /* non-fatal */ }
  })();
}

/** Fire-and-forget: compress → upload to R2 → patch thumbnailUrl in DB. */
function migrateToR2(id: string, buffer: Buffer) {
  if (!isR2Configured()) return;
  void (async () => {
    try {
      const r2Url = await compressAndUploadThumbnail(id, buffer);
      await updateFileTransfer(id, { thumbnailUrl: r2Url });
      console.log(`[thumbnail] migrated ${id} → ${r2Url}`);
    } catch { /* non-fatal */ }
  })();
}

/**
 * Serve a thumbnail for a published item.
 *
 * Lookup priority:
 *  1. Dedicated thumbnail file:  data/thumbnails/{id}.{ext}
 *  2. Main content is an image:  mimeType starts with "image/"
 *  3. HTML gallery post/product: parse HTML, extract first embedded <img> data URL
 *  4. 404
 *
 * Successful fallback results (2 & 3) are opportunistically saved to disk
 * so subsequent requests are served instantly without touching the DB.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = (params.id ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    // ── 1. Dedicated thumbnail file ─────────────────────────────────────────
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
      const filePath = path.join(THUMBNAILS_DIR, `${id}.${ext}`);
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': MIME_MAP[ext] ?? 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(buffer.length),
          },
        });
      }
    }

    // ── 2 & 3. Read transfer record for fallback (single-row lookup, not full scan) ──
    const { selectFileTransferRowById } = await import('@/lib/server/db/file-transfers-rows');
    const t = await selectFileTransferRowById(id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // ── 1.5a. thumbnailUrl is an external R2/CDN URL — redirect directly ────
    if (t.thumbnailUrl && (t.thumbnailUrl.startsWith('https://') || t.thumbnailUrl.startsWith('http://'))) {
      return NextResponse.redirect(t.thumbnailUrl, { status: 302 });
    }

    // ── 1.5b. Stored thumbnailUrl data URL (e.g. product cover image) ───────
    if (t.thumbnailUrl?.startsWith('data:image/')) {
      const parts = t.thumbnailUrl.split(',');
      if (parts.length === 2 && parts[1]) {
        const mimeType = t.thumbnailUrl.split(';')[0].replace('data:', '').toLowerCase();
        const buffer = Buffer.from(parts[1], 'base64');
        saveToDisk(id, buffer, mimeType);
        migrateToR2(id, buffer);
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=86400',
            'Content-Length': String(buffer.length),
          },
        });
      }
    }

    // ── 2. Main content is itself an image ──────────────────────────────────
    if (t.mimeType?.startsWith('image/') && t.dataUrl?.startsWith('data:image/')) {
      const parts = t.dataUrl.split(',');
      if (parts.length === 2 && parts[1]) {
        const mimeType = t.mimeType.toLowerCase();
        const buffer = Buffer.from(parts[1], 'base64');
        saveToDisk(id, buffer, mimeType);
        migrateToR2(id, buffer);
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=86400',
            'Content-Length': String(buffer.length),
          },
        });
      }
    }

    // ── 3. HTML gallery (multi-image post or product) ───────────────────────
    if (
      t.mimeType === 'text/html' &&
      t.dataUrl?.startsWith('data:text/html') &&
      (t.directoryCategory === 'post' || t.directoryCategory === 'product')
    ) {
      const htmlBase64 = t.dataUrl.split(',')[1];
      if (htmlBase64) {
        const html = Buffer.from(htmlBase64, 'base64').toString('utf-8');
        const match = html.match(/src="(data:image\/([^;]+);base64,([^"]+))"/);
        if (match) {
          const mimeType = `image/${match[2].toLowerCase()}`;
          const imgB64 = match[3];
          if (imgB64) {
            const buffer = Buffer.from(imgB64, 'base64');
            saveToDisk(id, buffer, mimeType);
            migrateToR2(id, buffer);
            return new NextResponse(buffer, {
              status: 200,
              headers: {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=86400',
                'Content-Length': String(buffer.length),
              },
            });
          }
        }
      }
    }

    return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
  } catch (err) {
    console.error('[thumbnail]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
