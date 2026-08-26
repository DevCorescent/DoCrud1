import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { runApprovedAndImport } from '@/lib/server/scraper-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Run the approved-source scraper: fetch every enabled approved source
 * (Ashby / Lever public APIs), normalize, score, dedupe and persist the best
 * jobs through the EXISTING importer. Super-Admin only. Returns a summary.
 */
export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { limit?: unknown };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const totalLimit = Number(body.limit) || undefined;

  try {
    const summary = await runApprovedAndImport({ totalLimit, adminEmail: session.email || '' });

    await appendSuperAdminAudit({
      action: 'jobs.scrape',
      targetType: 'hiring_job',
      details: {
        actor: session.email || 'super-admin',
        sources: summary.sources,
        fetched: summary.fetched,
        imported: summary.imported,
        duplicates: summary.duplicates,
        rejected: summary.rejected,
        failed: summary.failed,
      },
    });

    return NextResponse.json(summary);
  } catch (error) {
    // Safe message only — never leak internal details.
    const message = error instanceof Error ? error.message : 'Scrape failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
