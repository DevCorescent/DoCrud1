export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getAutoReply, setAutoReply } from '@/lib/server/messages';

// GET /api/messages/auto-reply
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await getAutoReply(session.user.id);
  return NextResponse.json({ settings });
}

// PATCH /api/messages/auto-reply
export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    enabled?: boolean;
    message?: string;
    cooldownMinutes?: number;
  };

  const settings = await setAutoReply(session.user.id, {
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    ...(body.message !== undefined ? { message: body.message } : {}),
    ...(body.cooldownMinutes !== undefined ? { cooldownMinutes: body.cooldownMinutes } : {}),
  });

  return NextResponse.json({ settings });
}
