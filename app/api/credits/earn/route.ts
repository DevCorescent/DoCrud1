export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { earnCredits, checkAndGrantMilestones } from '@/lib/server/credits';

const ALLOWED_CLIENT_REASONS = new Set(['daily_post', 'profile_view', 'profile_complete']);

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { reason?: string; context?: { followers?: number; publishCount?: number } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { reason, context } = body;

  if (!reason || !ALLOWED_CLIENT_REASONS.has(reason)) {
    return NextResponse.json(
      { error: `Reason '${reason}' is not allowed from client. Allowed: ${Array.from(ALLOWED_CLIENT_REASONS).join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const credits = await earnCredits(session.user.id, reason);

    // If context provided, also check milestones
    if (context) {
      await checkAndGrantMilestones(session.user.id, context);
    }

    return NextResponse.json({ credits });
  } catch (error) {
    console.error('Error earning credits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
