import { NextRequest, NextResponse } from 'next/server';
import { markEmailOpened } from '@/lib/server/email-outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || '';
  if (id) {
    try {
      await markEmailOpened(id);
    } catch {
      // best-effort: never break the pixel response
    }
  }

  // 1x1 transparent gif
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
  return new NextResponse(gif, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

