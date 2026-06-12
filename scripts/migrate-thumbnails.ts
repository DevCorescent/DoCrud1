/**
 * One-time migration: extract base64 thumbnailUrl values from file-transfers.json
 * and save them as real files in data/thumbnails/. Updates the JSON in place.
 *
 * Run with: npx ts-node --project tsconfig.scripts.json scripts/migrate-thumbnails.ts
 * Or just: npx tsx scripts/migrate-thumbnails.ts
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const TRANSFERS_PATH = path.join(DATA_DIR, 'file-transfers.json');

interface Transfer {
  id: string;
  thumbnailUrl?: string;
  [key: string]: unknown;
}

function run() {
  if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

  const raw = fs.readFileSync(TRANSFERS_PATH, 'utf-8');
  const transfers: Transfer[] = JSON.parse(raw);

  let migrated = 0;
  let cleared = 0;

  for (const t of transfers) {
    if (!t.thumbnailUrl?.startsWith('data:image/')) continue;

    const [header, base64] = t.thumbnailUrl.split(',');
    if (!header || !base64) { t.thumbnailUrl = undefined; cleared++; continue; }

    const mime = header.replace('data:', '').replace(';base64', '').toLowerCase();
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'image/gif': 'gif',
    };
    const ext = extMap[mime] ?? 'jpg';

    try {
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > 3 * 1024 * 1024) {
        console.log(`  SKIP ${t.id} — thumbnail too large (${(buffer.length / 1024).toFixed(0)} KB)`);
        t.thumbnailUrl = undefined;
        cleared++;
        continue;
      }
      fs.writeFileSync(path.join(THUMBNAILS_DIR, `${t.id}.${ext}`), buffer);
      t.thumbnailUrl = `/api/public/thumbnail/${t.id}`;
      migrated++;
      console.log(`  ✓ ${t.id}.${ext} (${(buffer.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.error(`  ✗ ${t.id}:`, err);
      t.thumbnailUrl = undefined;
      cleared++;
    }
  }

  fs.writeFileSync(TRANSFERS_PATH, JSON.stringify(transfers, null, 2), 'utf-8');
  console.log(`\nDone — migrated: ${migrated}, cleared: ${cleared}`);
}

run();
