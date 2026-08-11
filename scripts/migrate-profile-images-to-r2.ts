/**
 * Migrate legacy base64 profile images stored in MongoDB `user_profiles`
 * → Cloudflare R2.
 *
 * WHY THIS EXISTS SEPARATELY FROM migrate-mongo-images-to-r2.ts
 * ------------------------------------------------------------
 * That script only queries `file_transfers`. It has no `user_profiles` path.
 *
 * WHAT IT MIGRATES
 * ----------------
 * `profile.coverGradient` is dual-purpose. Normally it holds a CSS gradient
 * ("linear-gradient(...)"), but older profile edits stored the cover photo in it
 * as a base64 data URL. Current uploads go to `bannerUrl` instead, and the
 * profile editor already clears these on save:
 *
 *   app/u/[userId]/page.tsx:1431
 *     "Use bannerUrl for uploaded images; clear any stale base64 in coverGradient"
 *
 * This script performs that same transition now, without waiting for the user
 * to re-save:
 *
 *   decode base64 -> compress -> upload to R2
 *   $set   bannerUrl     = <R2 url>
 *   $unset coverGradient
 *
 * SAFETY
 * ------
 *  - ONLY values matching /^data:image\// are touched. Legitimate CSS gradients
 *    (linear-gradient / radial-gradient / conic-gradient) are never migrated.
 *  - A profile that already has a non-empty `bannerUrl` is SKIPPED, so an
 *    existing banner is never overwritten.
 *  - The decoded bytes must carry real JPEG/PNG/GIF/WebP magic bytes; anything
 *    that fails that check is skipped rather than uploaded.
 *  - --dry-run performs no R2 upload and no Mongo write.
 *  - Every migrated document's previous value is written to a local backup file
 *    before the update, so the change can be reversed.
 *
 * Usage:
 *   npx tsx scripts/migrate-profile-images-to-r2.ts --dry-run
 *   npx tsx scripts/migrate-profile-images-to-r2.ts
 *   npx tsx scripts/migrate-profile-images-to-r2.ts --user=<profileId>
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MongoClient, type Db, type Document } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const COL = 'user_profiles';
const MAX_BYTES = 200 * 1024;

/* ── env ─────────────────────────────────────────────────────────────── */

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === '') process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/* ── args ────────────────────────────────────────────────────────────── */

function parseArgs(argv: string[]) {
  const opts = { dryRun: false, user: '' };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--user=')) opts.user = arg.slice('--user='.length).trim();
  }
  return opts;
}

/* ── image handling ──────────────────────────────────────────────────── */

/** Real file-signature check — never trust the data: header alone. */
function sniffImage(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function parseDataImage(value: string): { declaredMime: string; buffer: Buffer } | null {
  if (!/^data:image\//i.test(value)) return null;
  const comma = value.indexOf(',');
  if (comma < 0) return null;
  const header = value.slice(0, comma);
  const b64 = value.slice(comma + 1);
  if (!b64) return null;
  const declaredMime = header.replace(/^data:/i, '').replace(/;base64$/i, '').toLowerCase();
  return { declaredMime, buffer: Buffer.from(b64, 'base64') };
}

/** Mirrors lib/server/r2.ts compressImageForR2 (kept standalone so the script has no app imports). */
async function compressForR2(buffer: Buffer, maxDimension = 1920): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  if (buffer.length <= MAX_BYTES) {
    try {
      const meta = await sharp(buffer, { failOn: 'none' }).metadata();
      if ((meta.width ?? 0) <= maxDimension && (meta.height ?? 0) <= maxDimension) return buffer;
    } catch { /* fall through to re-encode */ }
  }
  for (const dim of [maxDimension, 1600, 1280, 1024, 800, 640, 480]) {
    for (const quality of [82, 74, 66, 58, 50, 42, 35, 28]) {
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
    .resize(360, 360, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 22, mozjpeg: true })
    .toBuffer();
}

function createR2Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const bucket = requireEnv('R2_BUCKET_NAME');
  const publicUrl = requireEnv('R2_PUBLIC_URL').replace(/\/$/, '');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  async function upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body, ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${publicUrl}/${key}`;
  }
  return { upload, bucket, publicUrl };
}

/**
 * Same key shape the live upload route produces
 * (app/api/profile/upload-image/route.ts): profiles/{type}_{uid}_{suffix}.{ext}
 *
 * The suffix is DETERMINISTIC here, unlike the random one the upload route uses.
 * If a run uploads to R2 but then fails to update MongoDB, the profile still has
 * its coverGradient, so a re-run retries it — and must land on the same key so
 * it overwrites the orphan instead of creating a second object.
 *
 * The hash covers the FULL profile id, not `uid`: uid truncates to 12 chars, so
 * "individual-1781753283087" and "individual-1781999999999" both reduce to
 * "individual17" and would otherwise collide onto one key.
 */
function buildKey(profileId: string) {
  const uid = profileId.replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const suffix = crypto.createHash('sha1').update(profileId).digest('hex').slice(0, 12);
  return `profiles/banner_${uid}_${suffix}.jpg`;
}

/* ── main ────────────────────────────────────────────────────────────── */

async function main() {
  const root = process.cwd();
  loadEnvFile(path.join(root, '.env'));
  loadEnvFile(path.join(root, '.env.local'));

  const opts = parseArgs(process.argv.slice(2));
  const mongoUri = requireEnv('MONGODB_URI');
  const mongoDbName = process.env.MONGODB_DB?.trim() || 'docrud';
  const r2 = createR2Client();

  console.log('══════════════════════════════════════════════');
  console.log(' Migrate user_profiles base64 images → R2');
  console.log('══════════════════════════════════════════════');
  console.log(` Mongo DB:    ${mongoDbName}`);
  console.log(` R2 bucket:   ${r2.bucket}`);
  console.log(` Dry run:     ${opts.dryRun}`);
  if (opts.user) console.log(` Single user: ${opts.user}`);
  console.log('');

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db: Db = client.db(mongoDbName);
  const col = db.collection(COL);

  // Only base64 IMAGE data URLs. CSS gradients can never match this regex.
  const query: Document = { coverGradient: { $regex: '^data:image/' } };
  if (opts.user) query._id = opts.user;

  const docs = await col.find(query).toArray();
  console.log(`Candidates: ${docs.length}\n`);
  if (docs.length === 0) {
    console.log('Nothing to do.');
    await client.close();
    return;
  }

  const backups: Array<{ _id: string; coverGradient: string; bannerUrl: unknown }> = [];
  const backupFile = path.join(root, `profile-image-migration-backup-${Date.now()}.json`);
  /** Flush to disk BEFORE the document is modified, so a crash can never lose it. */
  function persistBackups() {
    fs.writeFileSync(backupFile, JSON.stringify(backups, null, 2), 'utf8');
  }

  const orphans: Array<{ id: string; key: string; url: string }> = [];
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    const id = String(doc._id);
    const label = `[${i + 1}/${docs.length}] ${id}`;
    const value = String(doc.coverGradient ?? '');
    // Set once the object is in R2; cleared once Mongo commits. Non-null inside
    // the catch means the upload succeeded but the document was not updated.
    let uploadedKey: string | null = null;
    let uploadedUrl: string | null = null;

    try {
      // Never overwrite an existing banner.
      const existingBanner = typeof doc.bannerUrl === 'string' ? doc.bannerUrl.trim() : '';
      if (existingBanner && !existingBanner.startsWith('blob:')) {
        console.log(`  ✓ skip ${label}: bannerUrl already set (${existingBanner.slice(0, 48)}…)`);
        skipped += 1;
        continue;
      }

      const parsed = parseDataImage(value);
      if (!parsed) {
        console.log(`  ✓ skip ${label}: not a base64 image data URL`);
        skipped += 1;
        continue;
      }

      const sniffed = sniffImage(parsed.buffer);
      if (!sniffed) {
        console.log(`  ✗ skip ${label}: bytes are not a recognised image (declared ${parsed.declaredMime})`);
        skipped += 1;
        continue;
      }

      const compressed = await compressForR2(parsed.buffer);
      const key = buildKey(id);
      const before = parsed.buffer.length;

      let url: string;
      if (opts.dryRun) {
        url = `${r2.publicUrl}/${key}`;
        console.log(`  ○ dry-run ${label}`);
      } else {
        url = await r2.upload(key, compressed, 'image/jpeg');
        console.log(`  ★ ${label}`);
      }
      console.log(`      declared=${parsed.declaredMime} sniffed=${sniffed}`);
      console.log(`      ${Math.round(before / 1024)} KB → ${Math.round(compressed.length / 1024)} KB → ${key}`);
      console.log(`      $set bannerUrl = ${url}`);
      console.log(`      $unset coverGradient (was ${value.length} chars)`);

      if (!opts.dryRun) {
        // Backup hits the disk before the document changes, not after the loop.
        backups.push({ _id: id, coverGradient: value, bannerUrl: doc.bannerUrl ?? null });
        persistBackups();
        uploadedKey = key;
        uploadedUrl = url;

        await col.updateOne(
          { _id: id as never },
          {
            $set: { bannerUrl: url, updatedAt: new Date().toISOString() },
            $unset: { coverGradient: '' },
          },
        );
        uploadedKey = null; // committed — no longer an orphan risk
        uploadedUrl = null;
      }

      migrated += 1;
      savedBytes += value.length;
    } catch (err) {
      console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err);
      if (uploadedKey) {
        // Upload succeeded, document did not update. The object is orphaned:
        // nothing references it, and coverGradient is still intact.
        orphans.push({ id, key: uploadedKey, url: uploadedUrl ?? '' });
        console.error(`      ⚠ ORPHANED R2 OBJECT — uploaded but MongoDB was NOT updated`);
        console.error(`        key: ${uploadedKey}`);
        console.error(`        url: ${uploadedUrl}`);
        console.error(`        coverGradient on ${id} is UNCHANGED — the profile still renders.`);
        console.error(`        Re-running this script retries the same deterministic key and`);
        console.error(`        overwrites this object, so no duplicate is created.`);
      }
      failed += 1;
    }
  }

  if (backups.length > 0) {
    console.log(`\nBackup of previous values written to:\n  ${backupFile}`);
  }

  if (orphans.length > 0) {
    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log(' ⚠ ORPHANED R2 OBJECTS');
    console.log('══════════════════════════════════════════════');
    for (const o of orphans) console.log(` ${o.id}\n   ${o.key}\n   ${o.url}`);
    console.log(' Each profile above still holds its original coverGradient.');
    console.log(' Re-run this script to retry — the keys are deterministic.');
  }

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log(' Summary');
  console.log('══════════════════════════════════════════════');
  console.log(` Migrated:   ${migrated}${opts.dryRun ? ' (dry-run — nothing written)' : ''}`);
  console.log(` Skipped:    ${skipped}`);
  console.log(` Failed:     ${failed}`);
  console.log(` Removed:    ${(savedBytes / 1024).toFixed(1)} KB of base64 from MongoDB`);
  console.log('');

  await client.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
