export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getTotalUnread } from '@/lib/server/messages';

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ unread: 0 });

  const unread = await getTotalUnread(session.user.id);
  return NextResponse.json({ unread });
}
