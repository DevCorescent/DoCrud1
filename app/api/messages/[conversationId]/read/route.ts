export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { markAsRead } from '@/lib/server/messages';

export async function POST(
  _req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await markAsRead(params.conversationId, session.user.id);
  return NextResponse.json({ ok: true });
}
