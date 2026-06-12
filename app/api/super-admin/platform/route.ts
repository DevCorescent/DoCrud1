import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit, getPlatformFlags, savePlatformFlags, getSuperAdminConfig } from '@/lib/server/super-admin-auth';
import { getPlatformConfig, savePlatformConfig } from '@/lib/server/platform';
import { getAuthSettings, saveAuthSettings, getMailSettings, saveMailSettings } from '@/lib/server/settings';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [flags, platformConfig, authSettings, mailSettings] = await Promise.all([
      getPlatformFlags(),
      getPlatformConfig(),
      getAuthSettings().catch(() => null),
      getMailSettings().catch(() => null),
    ]);

    const saConfig = await getSuperAdminConfig();
    const activeSessions = saConfig.activeSessions.filter((s) => new Date(s.expiresAt) > new Date());

    return NextResponse.json({
      flags,
      featureControls: platformConfig.featureControls,
      activeSuperAdminSessions: activeSessions.map((s) => ({
        email: s.email,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        ip: s.ip,
        userAgent: s.userAgent,
      })),
      authSettings: authSettings ? {
        googleEnabled: authSettings.googleEnabled,
        aadhaarVerificationEnabled: authSettings.aadhaarVerificationEnabled,
      } : null,
      mailConfigured: Boolean(mailSettings?.host),
    });
  } catch (err) {
    console.error('[super-admin/platform GET]', err);
    return NextResponse.json({ error: 'Failed to load platform config' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, data } = body;

    await appendSuperAdminAudit({
      action: `platform_${action}`,
      details: { data },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    if (action === 'update_flags') {
      await savePlatformFlags(data);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_feature_controls') {
      const cfg = await getPlatformConfig();
      cfg.featureControls = { ...cfg.featureControls, ...data };
      await savePlatformConfig(cfg);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_auth_settings') {
      const current = await getAuthSettings().catch(() => ({}));
      await saveAuthSettings({ ...current, ...data } as never);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_mail_settings') {
      const current = await getMailSettings().catch(() => ({}));
      await saveMailSettings({ ...current, ...data } as never);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/platform POST]', err);
    return NextResponse.json({ error: 'Failed to update platform' }, { status: 500 });
  }
}
