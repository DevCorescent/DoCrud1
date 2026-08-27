export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getHomepageConfig, saveHomepageConfig, type HomepageConfig } from '@/lib/server/homepage-config';

/* The shape, defaults and merge live in lib/server/homepage-config so this
   route and the public one can never disagree about them. */
export type { HomepageConfig };

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ config: await getHomepageConfig() });
  } catch (err) {
    console.error('[super-admin/homepage-config GET]', err);
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({})) as { config?: Partial<HomepageConfig> };
    // Saving clears the shared cache, so the admin sees their own change at once.
    const config = await saveHomepageConfig(body.config ?? {});
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    console.error('[super-admin/homepage-config POST]', err);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
