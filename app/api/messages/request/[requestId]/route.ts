export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { acceptRequest, rejectRequest } from '@/lib/server/messages';

// PATCH /api/messages/request/[requestId] — accept or reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: { requestId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { action: 'accept' | 'reject' };
  if (!['accept', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action must be accept or reject' }, { status: 400 });
  }

  try {
    if (body.action === 'accept') {
      await acceptRequest(params.requestId, session.user.id);
    } else {
      await rejectRequest(params.requestId, session.user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
