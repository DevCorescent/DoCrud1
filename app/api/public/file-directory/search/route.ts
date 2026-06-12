import { NextRequest, NextResponse } from 'next/server';
import { getDirectoryCategories, searchPrivateDirectory, searchPublicDirectory } from '@/lib/server/file-directory';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope') === 'private' ? 'private' : 'public';
    const query = request.nextUrl.searchParams.get('query') || '';
    const category = request.nextUrl.searchParams.get('category') || '';
    const password = request.nextUrl.searchParams.get('password') || '';

    const [categories, results] = await Promise.all([
      getDirectoryCategories(),
      scope === 'private'
        ? searchPrivateDirectory({ query, category, password })
        : searchPublicDirectory({ query, category }),
    ]);

    return NextResponse.json({
      scope,
      categories,
      requiresPassword: scope === 'private',
      results,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to search file directory.' }, { status: 500 });
  }
}
