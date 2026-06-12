import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUsers } from '@/lib/server/auth';
import { getCatalogueSettings, saveCatalogueSettings, type CatalogueSettings } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    const settings = await getCatalogueSettings(userId);
    return NextResponse.json({ settings: settings ?? {} });
  } catch (error) {
    console.error('[services/catalogue] GET error', error);
    return NextResponse.json({ settings: {} });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json() as Partial<CatalogueSettings>;
    const settings = await saveCatalogueSettings(actor.id, body);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('[services/catalogue] PUT error', error);
    return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 });
  }
}
