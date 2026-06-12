import { NextRequest, NextResponse } from 'next/server';
import { runPublicSearch } from '@/lib/public-search';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('query') || '';
    const results = await runPublicSearch(query);
    return NextResponse.json({ results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to search the portal.' }, { status: 500 });
  }
}
