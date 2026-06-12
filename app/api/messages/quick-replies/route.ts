export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getQuickReplies, addQuickReply, deleteQuickReply, updateQuickReply } from '@/lib/server/messages';

// GET /api/messages/quick-replies
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const replies = await getQuickReplies(session.user.id);
  return NextResponse.json({ replies });
}

// POST /api/messages/quick-replies — add new
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { title: string; content: string };
  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: 'title and content required' }, { status: 400 });
  }

  const reply = await addQuickReply(session.user.id, body.title, body.content);
  return NextResponse.json({ reply });
}

// PATCH /api/messages/quick-replies — update existing
export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { id: string; title: string; content: string };
  if (!body.id || !body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: 'id, title and content required' }, { status: 400 });
  }

  await updateQuickReply(session.user.id, body.id, body.title, body.content);
  return NextResponse.json({ ok: true });
}

// DELETE /api/messages/quick-replies?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await deleteQuickReply(session.user.id, id);
  return NextResponse.json({ ok: true });
}
