export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { toggleMessageIndex, getMessageIndex } from '@/lib/server/messages';
import { readJsonFile, messagesPath } from '@/lib/server/storage';

interface MessagesData {
  conversations: Record<string, { participants: string[] }>;
}

async function checkAccess(convId: string, userId: string) {
  const data = await readJsonFile<MessagesData>(messagesPath, { conversations: {} });
  const conv = data.conversations[convId];
  return conv?.participants.includes(userId) ?? false;
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
