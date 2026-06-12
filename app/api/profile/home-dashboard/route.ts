import { NextResponse } from 'next/server';
import { getHomeDashboardSnapshot } from '@/lib/server/home-dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await getHomeDashboardSnapshot();
    if (!snapshot) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load home dashboard.' }, { status: 500 });
  }
}
