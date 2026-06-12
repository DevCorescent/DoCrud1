export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { saveFileTransfers } from '@/lib/server/file-transfers';
import { getDbPool, isDatabaseConfigured, writeAppState } from '@/lib/server/database';

const FILE_TRANSFERS_APP_STATE_KEY = 'json:data/file-transfers.json';

/** Dev-only endpoint — wipes all published/file-transfer data from every storage layer. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const cleared: string[] = [];

  try {
    const pool = getDbPool();

    if (pool) {
      // Clear dedicated file_transfers table
      const r1 = await pool.query('DELETE FROM file_transfers');
      cleared.push(`file_transfers table: ${r1.rowCount ?? 0} rows deleted`);

      // Also clear the app_state JSONB fallback entry if it exists
      const r2 = await pool.query(
        `DELETE FROM app_state WHERE key = $1`,
        [FILE_TRANSFERS_APP_STATE_KEY],
      );
      cleared.push(`app_state entry: ${r2.rowCount ?? 0} rows deleted`);
    } else if (isDatabaseConfigured()) {
      // No pg pool but DB URL configured (uses writeAppState directly)
      await writeAppState(FILE_TRANSFERS_APP_STATE_KEY, []);
      cleared.push('app_state entry written as []');
    } else {
      // Pure JSON file mode
      await saveFileTransfers([]);
      cleared.push('JSON file cleared');
    }

    return NextResponse.json({ ok: true, cleared });
  } catch (err) {
    console.error('[dev/clear-published]', err);
    return NextResponse.json({ ok: false, error: String(err), cleared }, { status: 500 });
  }
}
