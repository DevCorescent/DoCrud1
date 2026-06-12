import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createHomepageAiThread, listHomepageAiThreads } from '@/lib/server/homepage-ai-chats';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const threads = await listHomepageAiThreads(session.user.id);
  return NextResponse.json({ threads });
}

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { title?: string } | null;
  const title = payload?.title?.trim();
  const thread = await createHomepageAiThread(session.user.id, title || undefined);
  return NextResponse.json({ thread });
}

