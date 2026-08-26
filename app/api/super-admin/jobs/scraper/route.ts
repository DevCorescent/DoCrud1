import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getScraperStatus } from '@/lib/server/scraper-client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Status only — mode, whether configured, and the allowlisted source NAMES.
  // No URLs, keys, or filesystem paths ever reach the client.
  const status = getScraperStatus();
  return NextResponse.json(status);
}
