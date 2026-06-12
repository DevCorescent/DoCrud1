import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { deleteBlogPost, getBlogCategories, getBlogPosts, getBlogPostsForAuthor, getPublicBlogPosts, upsertBlogPost } from '@/lib/server/blog';
import type { BlogPost } from '@/types/document';

export const dynamic = 'force-dynamic';

function canEditPost(post: BlogPost, viewer: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>['user']) {
  return viewer.role === 'admin'
    || post.authorUserId === viewer.id
    || post.authorEmail.toLowerCase() === (viewer.email || '').toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope') || 'public';
    const session = await getAuthSession();

    if (scope === 'author') {
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const [posts, categories] = await Promise.all([
        getBlogPostsForAuthor(session.user.id, session.user.email || undefined),
        getBlogCategories(),
      ]);

      return NextResponse.json({ posts, categories });
    }

    const [posts, categories] = await Promise.all([getPublicBlogPosts(), getBlogCategories()]);
    return NextResponse.json({ posts, categories });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to load blog posts.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }

    const payload = await request.json() as Partial<BlogPost>;
    if (!payload.title?.trim() || !payload.content?.trim()) {
      return NextResponse.json({ error: 'Title and content are required.' }, { status: 400 });
    }

    const post = await upsertBlogPost({
      ...payload,
      authorUserId: session.user.id,
      authorName: session.user.name || 'Docrud Author',
      authorEmail: session.user.email || 'author@docrud.local',
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to save blog post.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }

    const payload = await request.json() as Partial<BlogPost>;
    if (!payload.id) {
      return NextResponse.json({ error: 'Post ID is required.' }, { status: 400 });
    }

    const allPosts = await getBlogPosts();
    const existing = allPosts.find((post) => post.id === payload.id);
    if (!existing || !canEditPost(existing, session.user)) {
      return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
    }

    const post = await upsertBlogPost({
      ...existing,
      ...payload,
      authorUserId: existing.authorUserId,
      authorName: existing.authorName,
      authorEmail: existing.authorEmail,
    });

    return NextResponse.json(post);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to update blog post.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Post ID is required.' }, { status: 400 });
    }

    const allPosts = await getBlogPosts();
    const target = allPosts.find((post) => post.id === id);
    if (!target || !canEditPost(target, session.user)) {
      return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
    }

    const removed = await deleteBlogPost(id);
    if (!removed) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to delete blog post.' }, { status: 500 });
  }
}
