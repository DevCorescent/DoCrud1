export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getMessages, sendMessage, deleteMessage, triggerAutoReply } from '@/lib/server/messages';
import { readJsonFile, messagesPath } from '@/lib/server/storage';

interface MessagesData {
  conversations: Record<string, { participants: string[]; status: string }>;
}

// GET /api/messages/[conversationId] — get messages
export async function GET(
  _req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await readJsonFile<MessagesData>(messagesPath, { conversations: {} });
  const conv = data.conversations[params.conversationId];
  if (!conv || !conv.participants.includes(session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Block reading if request not yet accepted (only requester can see their own pending)
  if (conv.status === 'rejected') {
    return NextResponse.json({ error: 'Request was rejected' }, { status: 403 });
  }

  const messages = await getMessages(params.conversationId);
  return NextResponse.json({ messages });
}

// POST /api/messages/[conversationId] — send a message
export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await readJsonFile<MessagesData>(messagesPath, { conversations: {} });
  const conv = data.conversations[params.conversationId];

  if (!conv || !conv.participants.includes(session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (conv.status === 'rejected') {
    return NextResponse.json({ error: 'Cannot send to rejected conversation' }, { status: 403 });
  }
  // If still a request, only the requester may send more messages
  if (conv.status === 'request') {
    const fullData = await readJsonFile<{ conversations: Record<string, { requestFrom?: string }> }>(messagesPath, { conversations: {} });
    const requestFrom = fullData.conversations[params.conversationId]?.requestFrom;
    if (requestFrom && requestFrom !== session.user.id) {
      return NextResponse.json({ error: 'Cannot send until request is accepted' }, { status: 403 });
    }
  }

  const body = await req.json() as {
    content: string;
    type?: 'text' | 'image' | 'file';
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;
    attachmentMimeType?: string;
    replyTo?: { id: string; content: string; senderId: string; type: 'text' | 'image' | 'file'; attachmentName?: string };
  };

  if (!body.content?.trim() && body.type === 'text') {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  const message = await sendMessage(
    params.conversationId,
    session.user.id,
    body.content ?? '',
    body.type ?? 'text',
    body.type !== 'text' ? {
      attachmentUrl: body.attachmentUrl,
      attachmentName: body.attachmentName,
      attachmentSize: body.attachmentSize,
      attachmentMimeType: body.attachmentMimeType,
    } : undefined,
    body.replyTo ?? undefined
  );

  // Fire auto-reply for the recipient — non-blocking, doesn't delay response
  const recipientId = conv.participants.find(p => p !== session.user.id);
  if (recipientId && (body.type ?? 'text') === 'text' && conv.status === 'active') {
    triggerAutoReply(params.conversationId, recipientId, session.user.id).catch(() => {});
  }

  return NextResponse.json({ message });
}

// DELETE /api/messages/[conversationId] — soft-delete a message (sender only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await readJsonFile<MessagesData>(messagesPath, { conversations: {} });
  const conv = data.conversations[params.conversationId];
  if (!conv || !conv.participants.includes(session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json() as { messageId: string };
  if (!body.messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 });

  try {
    await deleteMessage(params.conversationId, body.messageId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}
