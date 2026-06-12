import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { recordView, toggleLike, deleteRecent, getRecentById } from '@/lib/server/recents';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recent = await getRecentById(id);
  if (!recent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ recent });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { action?: string };

  if (body.action === 'view') {
    const updated = await recordView(id, userId);
    return updated
      ? NextResponse.json({ recent: updated })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (body.action === 'like') {
    const updated = await toggleLike(id, userId);
    return updated
      ? NextResponse.json({ recent: updated })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await deleteRecent(id, userId);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
}
