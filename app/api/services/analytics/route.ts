import { NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getProviderAnalytics } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const analytics = await getProviderAnalytics(actor.id);
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('[services/analytics] GET error', error);
    return NextResponse.json({ error: 'Failed to load analytics.' }, { status: 500 });
  }
}
