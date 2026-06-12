import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { defaultMailSettings, getMailSettings, saveMailSettings } from '@/lib/server/settings';
import type { MailSettings } from '@/types/document';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

function maskSettings(settings: MailSettings) {
  return { ...settings, password: settings.password ? '********' : '' };
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const settings = await getMailSettings();
    return NextResponse.json(maskSettings(settings));
  } catch (err) {
    console.error('[super-admin/mail/smtp GET]', err);
    return NextResponse.json({ error: 'Failed to load SMTP settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const payload = await req.json() as Partial<MailSettings>;
    const current = await getMailSettings();
    const next: MailSettings = {
      ...defaultMailSettings,
      ...current,
      ...payload,
      password: payload.password === '********' ? current.password : (payload.password ?? current.password),
    };
    await saveMailSettings(next);
    await appendSuperAdminAudit({
      action: 'settings_update_mail',
      details: { keys: Object.keys(payload) },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });
    return NextResponse.json(maskSettings(next));
  } catch (err) {
    console.error('[super-admin/mail/smtp PUT]', err);
    return NextResponse.json({ error: 'Failed to save SMTP settings' }, { status: 500 });
  }
}
