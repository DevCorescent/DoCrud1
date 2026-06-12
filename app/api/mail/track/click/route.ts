import { NextRequest, NextResponse } from 'next/server';
import { markEmailClicked } from '@/lib/server/email-outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || '';
  const url = request.nextUrl.searchParams.get('url') || '';

  if (id) {
    try {
      await markEmailClicked(id);
    } catch {
      // best-effort
    }
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.redirect(new URL('/', request.nextUrl.origin));
  }

  return NextResponse.redirect(url);
}

