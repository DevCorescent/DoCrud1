import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getJobAdminOverview } from '@/lib/server/job-import';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const overview = await getJobAdminOverview(searchParams.get('query') || undefined);
    return NextResponse.json(overview);
  } catch {
    // Never leak internal errors to the browser.
    return NextResponse.json({ error: 'Failed to load jobs.' }, { status: 500 });
  }
}
