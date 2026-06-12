import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getBillingOverview } from '@/lib/server/billing';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const normalizedEmail = (session.user.email || '').trim().toLowerCase();
    const storedUser = users.find((user) => user.email.trim().toLowerCase() === normalizedEmail);
    if (!storedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const overview = await getBillingOverview(storedUser);
    return NextResponse.json(overview);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load billing overview' }, { status: 500 });
  }
}
