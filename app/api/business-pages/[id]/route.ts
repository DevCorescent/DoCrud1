import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import {
  getBusinessPageById, getBusinessPageBySlug, updateBusinessPage,
  recordBusinessPageView, isFollowingPage,
  getPagePosts, getPageJobs, getPageProducts, getPageEvents,
} from '@/lib/server/business-pages';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const session = await getAuthSession();

    const page = id.match(/^[0-9a-f-]{36}$/)
      ? await getBusinessPageById(id)
      : await getBusinessPageBySlug(id);

    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Record view in background
    void recordBusinessPageView(page.id);

    const userId = session?.user?.id;
    const [posts, jobs, products, events, following] = await Promise.all([
      getPagePosts(page.id, 10),
      getPageJobs(page.id, 'open'),
      getPageProducts(page.id),
      getPageEvents(page.id),
      userId ? isFollowingPage(page.id, userId) : Promise.resolve(false),
    ]);

    const isOwner = userId === page.ownerUserId;

    return NextResponse.json({ page, posts, jobs, products, events, following, isOwner });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as Parameters<typeof updateBusinessPage>[1];
    const updated = await updateBusinessPage(params.id, body);
    return NextResponse.json({ page: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
