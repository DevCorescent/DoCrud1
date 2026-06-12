export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getUserCredits, MILESTONES } from '@/lib/server/credits';

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const credits = await getUserCredits(session.user.id);
    return NextResponse.json({ credits, milestones: MILESTONES });
  } catch (error) {
    console.error('Error fetching credits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
