import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getThemeSettings, saveThemeSettings } from '@/lib/server/settings';
import { ThemeSettings } from '@/types/document';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

function isAllowedTheme(value: unknown): value is ThemeSettings['activeTheme'] {
  return value === 'ember'
    || value === 'sapphire'
    || value === 'slate'
    || value === 'ocean'
    || value === 'forest'
    || value === 'midnight'
    || value === 'rose'
    || value === 'graphite';
}

export async function GET() {
  try {
    return NextResponse.json(await getThemeSettings());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load theme settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as Partial<ThemeSettings>;
    const current = await getThemeSettings();
    const next: ThemeSettings = {
      activeTheme: isAllowedTheme(payload.activeTheme) ? payload.activeTheme : 'sapphire',
      softwareName: payload.softwareName?.trim() || current.softwareName,
      accentLabel: payload.accentLabel?.trim() || current.accentLabel,
    };

    await saveThemeSettings(next);
    return NextResponse.json(next);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save theme settings' }, { status: 500 });
  }
}
