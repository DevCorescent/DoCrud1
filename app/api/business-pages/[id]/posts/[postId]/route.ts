import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById, deletePost, togglePostLike } from '@/lib/server/business-pages';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; postId: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await deletePost(params.postId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; postId: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { action?: string };
    if (body.action === 'like') {
      const result = await togglePostLike(params.postId, session.user.id);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
