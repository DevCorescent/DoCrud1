import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getLandingSettings, saveLandingSettings, getThemeSettings, saveThemeSettings } from '@/lib/server/settings';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [landing, theme] = await Promise.all([
      getLandingSettings().catch(() => null),
      getThemeSettings().catch(() => null),
    ]);

    return NextResponse.json({ landing, theme });
  } catch (err) {
    console.error('[super-admin/content GET]', err);
    return NextResponse.json({ error: 'Failed to load content settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, data } = await req.json();

    await appendSuperAdminAudit({
      action: `content_${action}`,
      details: { keys: data ? Object.keys(data) : [] },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    if (action === 'update_landing') {
      const current = await getLandingSettings().catch(() => ({}));
      await saveLandingSettings({ ...current, ...data } as never);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_theme') {
      const current = await getThemeSettings().catch(() => ({}));
      await saveThemeSettings({ ...current, ...data } as never);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/content POST]', err);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}
