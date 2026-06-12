import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { defaultMailSettings, getMailSettings, saveMailSettings } from '@/lib/server/settings';
import { MailSettings } from '@/types/document';

export const dynamic = 'force-dynamic';

function maskSettings(settings: MailSettings) {
  return {
    ...settings,
    password: settings.password ? '********' : '',
  };
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = await getMailSettings();
    return NextResponse.json(maskSettings(settings));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load mail settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as MailSettings;
    const current = await getMailSettings();
    const nextSettings: MailSettings = {
      ...defaultMailSettings,
      ...current,
      ...payload,
      password: payload.password === '********' ? current.password : payload.password,
    };

    await saveMailSettings(nextSettings);
    return NextResponse.json(maskSettings(nextSettings));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save mail settings' }, { status: 500 });
  }
}
