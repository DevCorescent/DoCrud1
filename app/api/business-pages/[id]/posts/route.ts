import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById, getPagePosts, createPost } from '@/lib/server/business-pages';
import { randomUUID } from 'crypto';
import { PUBLICATION_BODY_ERROR, isPublicationBodyOverLimit } from '@/lib/publication-body';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const posts = await getPagePosts(params.id, limit, offset);
    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as { content?: string; mediaUrls?: string[]; postType?: string };
    if (!body.content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });
    /* Page posts cross-publish to the feed, so they answer to the same body
       limit as any other publication — enforced here as well as in the
       composer so a direct request cannot exceed it. */
    if (isPublicationBodyOverLimit(body.content, 'post')) {
      return NextResponse.json({ error: PUBLICATION_BODY_ERROR }, { status: 400 });
    }

    const post = await createPost({
      id: randomUUID(),
      pageId: params.id,
      authorUserId: session.user.id,
      content: body.content.trim(),
      mediaUrls: body.mediaUrls,
      postType: body.postType,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
