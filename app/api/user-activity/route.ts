import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { appendUserActivityEvent } from '@/lib/server/user-intelligence';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const actor = users.find((entry) => entry.id === session.user.id || entry.email.toLowerCase() === session.user.email?.toLowerCase());
    if (!actor) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const payload = await request.json() as {
      eventType: 'login' | 'session_start' | 'tab_view' | 'feature_action' | 'feedback_submitted' | 'admin_action';
      tabId?: string;
      featureId?: string;
      detail?: string;
    };

    if (!payload?.eventType) {
      return NextResponse.json({ error: 'eventType is required' }, { status: 400 });
    }

    const event = await appendUserActivityEvent(actor, payload);
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to record activity' }, { status: 500 });
  }
}
