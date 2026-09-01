import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { runCanonicalIngest } from '@/lib/server/scraper-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Run the approved-source scraper through the CANONICAL pipeline.
 *
 *   registry -> adapter (paginated) -> normalizeSourceJob -> identity
 *   -> dedupe/upsert -> classification -> lastSeenAt
 *
 * Switched from the legacy CSV importer in Stage 2. The behavioural difference
 * that matters: a posting whose SOURCE CONTENT CHANGED is now updated in place
 * rather than skipped as a duplicate, so stored jobs stop going stale. Job ids,
 * ownership, status and applications are preserved by the upsert.
 *
 * Super-Admin only. Returns the same summary shape the dashboard already reads.
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
    const summary = await runCanonicalIngest({ totalLimit });

    await appendSuperAdminAudit({
      action: 'jobs.scrape',
      targetType: 'hiring_job',
      details: {
        actor: session.email || 'super-admin',
        sources: summary.sources,
        discovered: summary.discovered,
        inserted: summary.inserted,
        updated: summary.updated,
        unchanged: summary.unchanged,
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
