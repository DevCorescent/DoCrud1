import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { defaultCollaborationSettings, getCollaborationSettings, saveCollaborationSettings } from '@/lib/server/settings';
import { CollaborationSettings } from '@/types/document';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getCollaborationSettings());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load collaboration settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as CollaborationSettings;
    const nextSettings = { ...defaultCollaborationSettings, ...payload };
    await saveCollaborationSettings(nextSettings);

    return NextResponse.json(nextSettings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save collaboration settings' }, { status: 500 });
  }
}
