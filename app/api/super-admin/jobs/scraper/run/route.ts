import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { runScraper } from '@/lib/server/scraper-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { source?: unknown; limit?: unknown; resume?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const result = await runScraper({
      source: String(body.source || ''),
      limit: Number(body.limit),
      resume: Boolean(body.resume),
    });

    await appendSuperAdminAudit({
      action: 'jobs.scrape',
      targetType: 'hiring_job',
      details: {
        actor: session.email || 'super-admin',
        source: String(body.source || ''),
        scanned: result.scanned,
        valid: result.valid,
        invalid: result.invalid,
        duplicates: result.duplicates,
      },
    });

    // The CSV is public job content (13 columns only). The browser hands it to
    // the EXISTING /api/super-admin/jobs/import for preview + commit.
    return NextResponse.json(result);
  } catch (error) {
    // Safe message only — never leak service URLs, keys, or filesystem paths.
    const message = error instanceof Error ? error.message : 'Scrape failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
