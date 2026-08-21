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

      const ctaHref = typeof data?.ctaHref === 'string' ? data.ctaHref.trim() : '';
      if (ctaHref && !ctaHref.startsWith('/')) {
        return NextResponse.json({ error: 'CTA link must be a relative path starting with /' }, { status: 400 });
      }

      const subtitle = typeof data?.subtitle === 'string' ? data.subtitle.trim() : '';
      if (subtitle.length > 120) {
        return NextResponse.json({ error: 'Subtitle must be 120 characters or fewer' }, { status: 400 });
      }
      const ctaLabel = typeof data?.ctaLabel === 'string' ? data.ctaLabel.trim() : '';
      if (ctaLabel.length > 24) {
        return NextResponse.json({ error: 'CTA label must be 24 characters or fewer' }, { status: 400 });
      }

      /* Dates arrive as ISO strings (or '' for open-ended). Reject anything
         unparseable here so the stored config can be trusted downstream. */
      const parseWindow = (v: unknown, field: string): string | { error: string } => {
        if (typeof v !== 'string' || !v.trim()) return '';
        const t = Date.parse(v);
        return Number.isNaN(t) ? { error: `${field} is not a valid date` } : new Date(t).toISOString();
      };
      const startAt = parseWindow(data?.startAt, 'Start date');
      if (typeof startAt !== 'string') return NextResponse.json({ error: startAt.error }, { status: 400 });
      const endAt = parseWindow(data?.endAt, 'End date');
      if (typeof endAt !== 'string') return NextResponse.json({ error: endAt.error }, { status: 400 });
      if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
        return NextResponse.json({ error: 'End date must be after the start date' }, { status: 400 });
      }

      await saveNavAnnouncementSettings({
        enabled: data?.enabled !== false,
        text,
        href,
        subtitle,
        ctaLabel,
        ctaHref,
        showProfileProgress: data?.showProfileProgress !== false,
        showSpotsLeft: data?.showSpotsLeft !== false,
        startAt,
        endAt,
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
