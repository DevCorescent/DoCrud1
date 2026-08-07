/**
 * Migrate base64 images stored in MongoDB file_transfers → Cloudflare R2.
 *
 * Loads R2_* + MONGODB_* from project `.env` / `.env.local`.
 *
 * What it migrates:
 *  1. dataUrl image/* base64  → posts/{id}.jpg  (dataUrl becomes HTTPS URL)
 *  2. dataUrl text/html galleries with embedded data:image → rewrite srcs to R2
 *  3. thumbnailUrl data:image → thumbnails/{id}.jpg
 *  4. Sets thumbnailUrl to first R2 image when missing / still a proxy path
 *
 * Usage:
 *   npx tsx scripts/migrate-mongo-images-to-r2.ts --dry-run
 *   npx tsx scripts/migrate-mongo-images-to-r2.ts
 *   npx tsx scripts/migrate-mongo-images-to-r2.ts --limit=20
 *   npx tsx scripts/migrate-mongo-images-to-r2.ts --concurrency=2
 */
import fs from 'fs';
import path from 'path';
import { MongoClient, type Db, type Document } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const MAX_BYTES = 200 * 1024;

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function parseArgs(argv: string[]) {
  const opts = {
    dryRun: false,
    limit: 0, // 0 = all
    concurrency: 2,
    publicOnly: true,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--all') opts.publicOnly = false;
    else if (arg.startsWith('--limit=')) opts.limit = Math.max(0, Number(arg.slice('--limit='.length)) || 0);
    else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = Math.max(1, Number(arg.slice('--concurrency='.length)) || 2);
    }
  }
  return opts;
}

function transferId(doc: Document): string {
  return String(doc.id ?? doc._id ?? '');
}

function needsMigration(doc: Document): boolean {
  const dataUrl = typeof doc.dataUrl === 'string' ? doc.dataUrl : '';
  const thumb = typeof doc.thumbnailUrl === 'string' ? doc.thumbnailUrl : '';
  const mime = typeof doc.mimeType === 'string' ? doc.mimeType : '';

  if (dataUrl.startsWith('data:image/')) return true;
  if (thumb.startsWith('data:image/')) return true;
  if (
    mime === 'text/html' &&
    dataUrl.startsWith('data:text/html') &&
    dataUrl.includes('data:image/')
  ) {
    return true;
  }
  // Proxy thumb but content still base64 — migrate content + set cloud thumb
  if (
    (thumb.startsWith('/api/') || !thumb) &&
    (dataUrl.startsWith('data:image/') ||
      (mime === 'text/html' && dataUrl.startsWith('data:text/html') && dataUrl.includes('data:image/')))
  ) {
    return true;
  }
  return false;
}

async function compressJpeg(buffer: Buffer, maxDimension = 1920): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  if (buffer.length <= MAX_BYTES) {
    try {
      const meta = await sharp(buffer, { failOn: 'none' }).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w <= maxDimension && h <= maxDimension) return buffer;
    } catch {
      /* continue */
    }
  }

  const dimensions = [maxDimension, 1600, 1280, 1024, 800, 640, 480, 360];
  const qualities = [82, 74, 66, 58, 50, 42, 35, 28, 22];

  for (const dim of dimensions) {
    for (const quality of qualities) {
      const out = await sharp(buffer, { animated: false, failOn: 'none' })
        .rotate()
        .resize(dim, dim, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
        .toBuffer();
      if (out.length <= MAX_BYTES) return out;
    }
  }

  return sharp(buffer, { animated: false, failOn: 'none' })
    .rotate()
    .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 20, mozjpeg: true })
    .toBuffer();
}

function createR2Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET_NAME');
  const publicUrl = requireEnv('R2_PUBLIC_URL').replace(/\/$/, '');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  async function upload(key: string, body: Buffer, contentType = 'image/jpeg'): Promise<string> {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${publicUrl}/${key}`;
  }

  return { upload, bucket, publicUrl };
}

function parseDataImage(dataUrl: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl.startsWith('data:image/')) return null;
  const [header, b64] = dataUrl.split(',');
  if (!header || !b64) return null;
  const mime = header.replace(/^data:/i, '').replace(/;base64$/i, '').toLowerCase();
  return { mime, buffer: Buffer.from(b64, 'base64') };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function migrateOne(
  db: Db,
  doc: Document,
  r2: ReturnType<typeof createR2Client>,
  dryRun: boolean,
  index: number,
  total: number,
): Promise<{ ok: boolean; skipped?: boolean; savedBytes: number; label: string }> {
  const id = transferId(doc);
  const label = `[${index + 1}/${total}] ${id}`;
  const mime = String(doc.mimeType || '');
  let dataUrl = typeof doc.dataUrl === 'string' ? doc.dataUrl : '';
  let thumb = typeof doc.thumbnailUrl === 'string' ? doc.thumbnailUrl : '';
  let beforeBytes = 0;
  if (dataUrl.startsWith('data:')) beforeBytes += Math.floor(dataUrl.length * 0.75);
  if (thumb.startsWith('data:')) beforeBytes += Math.floor(thumb.length * 0.75);

  const patch: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  let firstImageUrl: string | undefined;
  let changed = false;

  try {
    // ── 1. Single image content ─────────────────────────────────────────────
    if (mime.startsWith('image/') && dataUrl.startsWith('data:image/')) {
      const parsed = parseDataImage(dataUrl);
      if (!parsed) {
        return { ok: false, skipped: true, savedBytes: 0, label: `${label} (bad image dataUrl)` };
      }
      const compressed = await compressJpeg(parsed.buffer, 1920);
      const key = `posts/${id}.jpg`;
      if (dryRun) {
        firstImageUrl = `${r2.publicUrl}/${key}`;
        console.log(
          `  ○ dry-run ${label}: image ${Math.round(parsed.buffer.length / 1024)} → ${Math.round(compressed.length / 1024)} KB → ${key}`,
        );
      } else {
        firstImageUrl = await r2.upload(key, compressed);
        console.log(
          `  ★ ${label}: image ${Math.round(parsed.buffer.length / 1024)} → ${Math.round(compressed.length / 1024)} KB → ${firstImageUrl}`,
        );
      }
      patch.dataUrl = firstImageUrl;
      patch.mimeType = 'image/jpeg';
      patch.sizeInBytes = compressed.length;
      changed = true;
    }

    // ── 2. HTML gallery with embedded base64 images ─────────────────────────
    if (mime === 'text/html' && dataUrl.startsWith('data:text/html') && dataUrl.includes('data:image/')) {
      const htmlB64 = dataUrl.split(',')[1];
      if (htmlB64) {
        let html = Buffer.from(htmlB64, 'base64').toString('utf-8');
        const re = /src=(["'])(data:image\/[^;]+;base64,[^"']+)\1/gi;
        const matches = Array.from(html.matchAll(re));
        let i = 0;
        for (const m of matches) {
          const full = m[2];
          if (!full) continue;
          const parsed = parseDataImage(full);
          if (!parsed) continue;
          const compressed = await compressJpeg(parsed.buffer, 1920);
          const key = `posts/${id}/${i}.jpg`;
          let url: string;
          if (dryRun) {
            url = `${r2.publicUrl}/${key}`;
          } else {
            url = await r2.upload(key, compressed);
          }
          if (!firstImageUrl) firstImageUrl = url;
          html = html.split(full).join(url);
          i += 1;
        }
        if (i > 0) {
          const out = Buffer.from(html, 'utf-8');
          const newDataUrl = `data:text/html;base64,${out.toString('base64')}`;
          patch.dataUrl = newDataUrl;
          patch.sizeInBytes = out.length;
          changed = true;
          console.log(
            `  ${dryRun ? '○ dry-run' : '★'} ${label}: gallery ${i} image(s), html ${Math.round(out.length / 1024)} KB`,
          );
        }
      }
    }

    // ── 3. thumbnailUrl as data:image ───────────────────────────────────────
    if (thumb.startsWith('data:image/')) {
      const parsed = parseDataImage(thumb);
      if (parsed) {
        const compressed = await compressJpeg(parsed.buffer, 800);
        const key = `thumbnails/${id}.jpg`;
        let url: string;
        if (dryRun) {
          url = `${r2.publicUrl}/${key}`;
          console.log(
            `  ○ dry-run ${label}: thumb ${Math.round(parsed.buffer.length / 1024)} → ${Math.round(compressed.length / 1024)} KB`,
          );
        } else {
          url = await r2.upload(key, compressed);
          console.log(
            `  ★ ${label}: thumb ${Math.round(parsed.buffer.length / 1024)} → ${Math.round(compressed.length / 1024)} KB → ${url}`,
          );
        }
        patch.thumbnailUrl = url;
        if (!firstImageUrl) firstImageUrl = url;
        changed = true;
      }
    }

    // ── 4. Ensure cloud thumbnailUrl when we have a first image ─────────────
    const currentThumb = (patch.thumbnailUrl as string | undefined) || thumb;
    if (firstImageUrl && (!currentThumb || currentThumb.startsWith('/api/') || currentThumb.startsWith('data:'))) {
      patch.thumbnailUrl = firstImageUrl;
      changed = true;
    }

    if (!changed) {
      console.log(`  ✓ skip ${label}: nothing to migrate`);
      return { ok: true, skipped: true, savedBytes: 0, label };
    }

    if (!dryRun) {
      await db.collection('file_transfers').updateOne(
        { $or: [{ id }, { _id: id as never }] },
        { $set: patch },
      );
    }

    const afterEstimate =
      (typeof patch.dataUrl === 'string' && patch.dataUrl.startsWith('data:')
        ? Math.floor(patch.dataUrl.length * 0.75)
        : 200) + 200;
    return {
      ok: true,
      savedBytes: Math.max(0, beforeBytes - afterEstimate),
      label,
    };
  } catch (err) {
    console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err);
    return { ok: false, savedBytes: 0, label };
  }
}

async function main() {
  const root = process.cwd();
  loadEnvFile(path.join(root, '.env'));
  loadEnvFile(path.join(root, '.env.local'));

  const opts = parseArgs(process.argv.slice(2));
  const mongoUri = requireEnv('MONGODB_URI');
  const mongoDbName = process.env.MONGODB_DB?.trim() || 'docrud';
  const r2 = createR2Client();

  console.log('══════════════════════════════════════════');
  console.log(' Migrate MongoDB images → Cloudflare R2');
  console.log('══════════════════════════════════════════');
  console.log(` Mongo DB:     ${mongoDbName}`);
  console.log(` R2 bucket:    ${r2.bucket}`);
  console.log(` Dry run:      ${opts.dryRun}`);
  console.log(` Public only:  ${opts.publicOnly}`);
  console.log(` Limit:        ${opts.limit || '(all)'}`);
  console.log(` Concurrency:  ${opts.concurrency}`);
  console.log('');

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(mongoDbName);
  const col = db.collection('file_transfers');

  const filter: Document = opts.publicOnly
    ? { directoryVisibility: 'public', authMode: 'public' }
    : {};

  // Candidates: anything that still has base64 image payloads
  const query: Document = {
    ...filter,
    $or: [
      { dataUrl: /^data:image\// },
      { thumbnailUrl: /^data:image\// },
      {
        mimeType: 'text/html',
        dataUrl: { $regex: 'data:image/' },
      },
    ],
  };

  console.log('Scanning file_transfers…');
  let cursor = col.find(query).sort({ createdAt: -1 });
  if (opts.limit > 0) cursor = cursor.limit(opts.limit);
  const docs = await cursor.toArray();
  const candidates = docs.filter(needsMigration);

  console.log(`Matched query: ${docs.length} · need migration: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('Nothing to do.');
    await client.close();
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  await mapPool(candidates, opts.concurrency, async (doc, i) => {
    const result = await migrateOne(db, doc, r2, opts.dryRun, i, candidates.length);
    if (!result.ok) failed += 1;
    else if (result.skipped) skipped += 1;
    else {
      migrated += 1;
      savedBytes += result.savedBytes;
    }
    return result;
  });

  // Remaining estimate
  const remaining = await col.countDocuments(query);

  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(' Summary');
  console.log('══════════════════════════════════════════');
  console.log(` Migrated:   ${migrated}${opts.dryRun ? ' (dry-run)' : ''}`);
  console.log(` Skipped:    ${skipped}`);
  console.log(` Failed:     ${failed}`);
  console.log(` Est. saved: ${(savedBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` Remaining:  ${remaining}${opts.dryRun ? ' (unchanged in dry-run)' : ''}`);
  console.log('');

  await client.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
