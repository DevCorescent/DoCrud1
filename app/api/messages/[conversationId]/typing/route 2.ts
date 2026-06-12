export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { setTyping } from '@/lib/server/messages';

export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { typing: boolean };
  await setTyping(params.conversationId, session.user.id, body.typing ?? false);
  return NextResponse.json({ ok: true });
}
