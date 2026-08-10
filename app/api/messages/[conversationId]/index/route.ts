export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getConversations, toggleMessageIndex, getMessageIndex } from '@/lib/server/messages';

async function checkAccess(convId: string, userId: string) {
  // Read through the service layer so the check honours the active storage
  // backend (Mongo collection or JSON). getConversations() already filters to
  // conversations the user participates in.
  const conversations = await getConversations(userId);
  return conversations.some((conversation) => conversation.id === convId);
}

// GET /api/messages/[conversationId]/index — get bookmarked message IDs
export async function GET(
  _req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkAccess(params.conversationId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ids = await getMessageIndex(params.conversationId, session.user.id);
  return NextResponse.json({ indexedIds: ids });
}

// POST /api/messages/[conversationId]/index — toggle bookmark on a message
export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkAccess(params.conversationId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { messageId } = await req.json() as { messageId: string };
  if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  const result = await toggleMessageIndex(params.conversationId, messageId, session.user.id);
  return NextResponse.json(result);
}
