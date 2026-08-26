import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getScraperStatus } from '@/lib/server/scraper-client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Status only — mode, whether configured, approved sources (name/provider/
  // enabled + last sync) and the last run summary. No URLs, keys, or filesystem
  // paths ever reach the client.
  const status = await getScraperStatus();
  return NextResponse.json(status);
}
