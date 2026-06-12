import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const users = await getStoredUsers();
    const user = users.find((u) => u.id === params.userId);
    if (!user) return NextResponse.json({ lastActiveAt: null }, { status: 404 });

    // Use lastActivityAt (presence ping) first, fall back to lastLogin
    const lastActiveAt = user.lastActivityAt ?? user.lastLogin ?? null;

    return NextResponse.json({ lastActiveAt, userId: params.userId });
  } catch {
    return NextResponse.json({ lastActiveAt: null }, { status: 500 });
  }
}
