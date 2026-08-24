import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { importJobsFromCsv } from '@/lib/server/job-import';

export const dynamic = 'force-dynamic';

// Bound the request body: ~5000 rows of job content. Rejects oversized uploads
// before parsing.
const MAX_CSV_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { csv?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const csv = typeof body.csv === 'string' ? body.csv : '';
  const mode = body.mode === 'commit' ? 'commit' : 'preview';
  if (!csv.trim()) return NextResponse.json({ error: 'No CSV content provided.' }, { status: 400 });
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
    return NextResponse.json({ error: 'CSV exceeds the maximum allowed size.' }, { status: 413 });
  }

  try {
    const summary = await importJobsFromCsv(csv, { commit: mode === 'commit', adminEmail: session.email || '' });
    if (mode === 'commit' && summary.imported > 0) {
      await appendSuperAdminAudit({
        action: 'jobs.import',
        targetType: 'hiring_job',
        details: {
          actor: session.email || 'super-admin',
          imported: summary.imported,
          duplicates: summary.duplicates,
          invalid: summary.invalid,
        },
      });
    }
    return NextResponse.json(summary);
  } catch (error) {
    // Surface only a safe validation message (e.g. bad header / too many rows);
    // never a stack trace or internal detail.
    const message = error instanceof Error ? error.message : 'Import failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
