import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { deleteHomepageAiThread, getHomepageAiThread } from '@/lib/server/homepage-ai-chats';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thread = await getHomepageAiThread(session.user.id, params.id);
  if (!thread) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ thread });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await deleteHomepageAiThread(session.user.id, params.id);
  return NextResponse.json({ ok: true });
}

