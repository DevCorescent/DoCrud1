import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit, getSuperAdminEmail, setSuperAdminEmail } from '@/lib/server/super-admin-auth';
import { getAuthSettings, saveAuthSettings, getMailSettings, saveMailSettings, getNavAnnouncementSettings, saveNavAnnouncementSettings } from '@/lib/server/settings';
import { getStoredUsers } from '@/lib/server/auth';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [authSettings, mailSettings, users, announcement] = await Promise.all([
      getAuthSettings().catch(() => null),
      getMailSettings().catch(() => null),
      getStoredUsers(),
      getNavAnnouncementSettings().catch(() => null),
    ]);

    // Scrub sensitive values
    const safeMailSettings = mailSettings ? {
      host: mailSettings.host,
      port: mailSettings.port,
      secure: mailSettings.secure,
      requireAuth: mailSettings.requireAuth,
      username: mailSettings.username,
      fromName: mailSettings.fromName,
      fromEmail: mailSettings.fromEmail,
      replyTo: mailSettings.replyTo,
      // password is omitted
    } : null;

    const safeAuthSettings = authSettings ? {
      googleEnabled: authSettings.googleEnabled,
      googleClientId: authSettings.googleClientId,
      aadhaarVerificationEnabled: authSettings.aadhaarVerificationEnabled,
      aadhaarEnvironment: authSettings.aadhaarEnvironment,
      // secrets omitted
    } : null;

    const adminUsers = users.filter((u) => u.role === 'admin').map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
    }));

    return NextResponse.json({
      superAdminEmail: await getSuperAdminEmail(),
      authSettings: safeAuthSettings,
      mailSettings: safeMailSettings,
      adminUsers,
      announcement,
    });
  } catch (err) {
    console.error('[super-admin/settings GET]', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, data } = await req.json();

    await appendSuperAdminAudit({
      action: `settings_${action}`,
      details: { keys: data ? Object.keys(data) : [] },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    if (action === 'update_mail') {
      const current = await getMailSettings().catch(() => ({}));
      await saveMailSettings({ ...current, ...data } as never);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_auth') {
      const current = await getAuthSettings().catch(() => ({}));
      await saveAuthSettings({ ...current, ...data } as never);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_announcement') {
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      if (!text) return NextResponse.json({ error: 'Announcement text is required' }, { status: 400 });
      if (text.length > 120) return NextResponse.json({ error: 'Announcement text must be 120 characters or fewer' }, { status: 400 });

      /* Only a same-origin path is accepted. An absolute URL here would let the
         bar point every signed-in user at an external destination. */
      const href = typeof data?.href === 'string' ? data.href.trim() : '';
      if (href && !href.startsWith('/')) {
        return NextResponse.json({ error: 'Link must be a relative path starting with /' }, { status: 400 });
      }

      await saveNavAnnouncementSettings({
        enabled: data?.enabled !== false,
        text,
        href,
        updatedAt: new Date().toISOString(),
        updatedBy: session.email || 'super-admin',
      });
      return NextResponse.json({ success: true, announcement: await getNavAnnouncementSettings() });
    }

    if (action === 'update_super_admin_email') {
      if (!data?.email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
      await setSuperAdminEmail(data.email);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/settings POST]', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
