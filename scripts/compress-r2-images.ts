/**
 * Compress existing images in Cloudflare R2 to ≤ 200 KB.
 *
 * Loads credentials from project `.env` (R2_* vars).
 *
 * Usage:
 *   npx tsx scripts/compress-r2-images.ts
 *   npx tsx scripts/compress-r2-images.ts --dry-run
 *   npx tsx scripts/compress-r2-images.ts --prefix=profiles/
 *   npx tsx scripts/compress-r2-images.ts --min-kb=50
 */
import fs from 'fs';
import path from 'path';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  type _Object,
} from '@aws-sdk/client-s3';

const MAX_BYTES = 200 * 1024;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|bmp|tiff?)$/i;
const IMAGE_CT = /^image\/(jpeg|jpg|png|webp|gif|avif|heic|bmp|tiff?)/i;

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

function parseArgs(argv: string[]) {
  const opts = {
    dryRun: false,
    prefix: '',
    minBytes: 0, // compress anything over this (default: all images; use --min-kb=50 to skip tiny ones)
    concurrency: 3,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--prefix=')) opts.prefix = arg.slice('--prefix='.length);
    else if (arg.startsWith('--min-kb=')) opts.minBytes = Math.max(0, Number(arg.slice('--min-kb='.length)) * 1024);
    else if (arg.startsWith('--concurrency=')) opts.concurrency = Math.max(1, Number(arg.slice('--concurrency='.length)) || 3);
  }
  return opts;
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function looksLikeImage(key: string, contentType?: string): boolean {
  if (contentType && IMAGE_CT.test(contentType)) return true;
  if (contentType && contentType.toLowerCase().includes('svg')) return false;
  return IMAGE_EXT.test(key);
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  // Node.js Readable / web ReadableStream
  const chunks: Buffer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = body as any;
  if (typeof stream.transformToByteArray === 'function') {
    return Buffer.from(await stream.transformToByteArray());
  }
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function compressImage(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const dimensions = [1920, 1600, 1280, 1024, 800, 640, 480, 360];
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

async function listAllKeys(client: S3Client, bucket: string, prefix: string): Promise<_Object[]> {
  const out: _Object[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    if (res.Contents?.length) out.push(...res.Contents);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
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

async function main() {
  const root = process.cwd();
  loadEnvFile(path.join(root, '.env'));
  loadEnvFile(path.join(root, '.env.local'));

  const opts = parseArgs(process.argv.slice(2));
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET_NAME');
  // Public URL not required for rewrite, but confirm config is complete
  requireEnv('R2_PUBLIC_URL');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log('══════════════════════════════════════════');
  console.log(' R2 image compression (≤ 200 KB)');
  console.log('══════════════════════════════════════════');
  console.log(` Bucket:       ${bucket}`);
  console.log(` Prefix:       ${opts.prefix || '(all)'}`);
  console.log(` Dry run:      ${opts.dryRun}`);
  console.log(` Min size:     ${opts.minBytes ? `${Math.round(opts.minBytes / 1024)} KB` : '0 (all images)'}`);
  console.log(` Concurrency:  ${opts.concurrency}`);
  console.log('');

  console.log('Listing objects…');
  const objects = await listAllKeys(client, bucket, opts.prefix);
  console.log(`Found ${objects.length} object(s)`);

  const candidates = objects.filter((o) => {
    if (!o.Key) return false;
    if (!looksLikeImage(o.Key)) return false;
    const size = o.Size ?? 0;
    if (opts.minBytes > 0 && size < opts.minBytes) return false;
    // Always consider images over MAX_BYTES; also re-check smaller ones that may still be oversized after meta
    return true;
  });

  console.log(`Image candidates: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let scanned = 0;
  let skippedOk = 0;
  let compressed = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  await mapPool(candidates, opts.concurrency, async (obj, idx) => {
    const key = obj.Key!;
    const label = `[${idx + 1}/${candidates.length}] ${key}`;
    try {
      const get = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const ct = get.ContentType || 'application/octet-stream';
      if (!looksLikeImage(key, ct)) {
        skippedOk++;
        scanned++;
        return;
      }

      const buf = await streamToBuffer(get.Body);
      scanned++;
      bytesBefore += buf.length;

      if (buf.length <= MAX_BYTES) {
        // Still under cap — leave alone
        skippedOk++;
        bytesAfter += buf.length;
        console.log(`  ✓ skip (already ${Math.round(buf.length / 1024)} KB): ${key}`);
        return;
      }

      const out = await compressImage(buf);
      const savedPct = Math.max(0, Math.round((1 - out.length / buf.length) * 100));

      if (opts.dryRun) {
        compressed++;
        bytesAfter += out.length;
        console.log(
          `  ○ dry-run ${Math.round(buf.length / 1024)} → ${Math.round(out.length / 1024)} KB (−${savedPct}%): ${key}`,
        );
        return;
      }

      // Overwrite same key so existing public URLs / DB refs keep working.
      // Body is JPEG; Content-Type is set to image/jpeg regardless of extension.
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: out,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      compressed++;
      bytesAfter += out.length;
      console.log(
        `  ★ ${label}: ${Math.round(buf.length / 1024)} → ${Math.round(out.length / 1024)} KB (−${savedPct}%)`,
      );
    } catch (err) {
      failed++;
      scanned++;
      console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err);
    }
  });

  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(' Summary');
  console.log('══════════════════════════════════════════');
  console.log(` Scanned:     ${scanned}`);
  console.log(` Compressed:  ${compressed}${opts.dryRun ? ' (dry-run)' : ''}`);
  console.log(` Skipped OK:  ${skippedOk}`);
  console.log(` Failed:      ${failed}`);
  console.log(` Before:      ${(bytesBefore / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` After:       ${(bytesAfter / (1024 * 1024)).toFixed(2)} MB`);
  if (bytesBefore > 0) {
    console.log(` Saved:       ${(((bytesBefore - bytesAfter) / bytesBefore) * 100).toFixed(1)}%`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
