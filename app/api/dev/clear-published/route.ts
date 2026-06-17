export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { saveFileTransfers } from '@/lib/server/file-transfers';
import { getDbPool, getMongoDb, isDatabaseConfigured, writeAppState } from '@/lib/server/database';

const FILE_TRANSFERS_APP_STATE_KEY = 'json:data/file-transfers.json';

/** Dev-only endpoint — wipes all published/file-transfer data from every storage layer. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const cleared: string[] = [];

  try {
    if (getDbPool()) {
      const db = await getMongoDb();
      if (db) {
        const r1 = await db.collection('file_transfers').deleteMany({});
        cleared.push(`file_transfers collection: ${r1.deletedCount} documents deleted`);
        const r2 = await db.collection('app_state').deleteOne({ _id: FILE_TRANSFERS_APP_STATE_KEY as any });
        cleared.push(`app_state entry: ${r2.deletedCount} documents deleted`);
      }
    } else if (isDatabaseConfigured()) {
      await writeAppState(FILE_TRANSFERS_APP_STATE_KEY, []);
      cleared.push('app_state entry written as []');
    } else {
      await saveFileTransfers([]);
      cleared.push('JSON file cleared');
    }

    return NextResponse.json({ ok: true, cleared });
  } catch (err) {
    console.error('[dev/clear-published]', err);
    return NextResponse.json({ ok: false, error: String(err), cleared }, { status: 500 });
  }
}
