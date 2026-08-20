/** Superadmin: read and update the persistent feed/recommendation configuration. */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { DEFAULT_FEED_CONFIG, getFeedConfig, saveFeedConfig } from '@/lib/server/feed-config';

export const dynamic = 'force-dynamic';

/** getSuperAdminSessionFromRequest returns { valid }, so the flag must be
    checked — the object itself is always truthy. */
async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return NextResponse.json({ config: await getFeedConfig(), defaults: DEFAULT_FEED_CONFIG });
}

export async function PUT(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => null);
    const config = await saveFeedConfig(body, 'superadmin');
    return NextResponse.json({ config });
  } catch (error) {
    console.error('[super-admin/feed-config] PUT error', error);
    return NextResponse.json({ error: 'Failed to save configuration.' }, { status: 500 });
  }
}
