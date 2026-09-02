import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { runCanonicalIngest } from '@/lib/server/scraper-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The platform execution window for this route.
 *
 * THIS ROUTE RUNS THE WHOLE SCRAPE INLINE and answers only when every source
 * has been attempted. Sources are processed SEQUENTIALLY, so the worst case is
 * the sum of them, and one slow board delays everything behind it.
 *
 * The fetchers allow 3 attempts at a 12 s timeout plus ~1.2 s of backoff, so a
 * single unreachable URL can cost ~37 s. Most providers are one request, but
 * Workday pages at 20/request (up to 100 pages) and Lever/SmartRecruiters up to
 * 50 — so ONE badly behaved paginated source can exceed this window on its own.
 *
 * 300 s is the Vercel maximum, and every other long route in this codebase sets
 * its own (30/45/60/300). This one had none and inherited the default, which is
 * how a long scrape became a dead request with no run state written.
 *
 * ═══ THIS IS A CEILING, NOT A GUARANTEE ═══
 *
 * A large enough source list will still exceed 300 s. That is a real limit of
 * running the scrape inside a request, and raising the number does not fix it —
 * the durable answer is to execute the run outside the request (create run →
 * return runId → poll), which is a larger change than this correctness pass.
 * Until then an operator should keep the configured source list small enough to
 * finish inside the window, and read the per-source failure state to see which
 * ones did not.
 */
export const maxDuration = 300;

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
