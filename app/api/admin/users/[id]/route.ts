import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getAdminUserBehaviour } from '@/lib/server/admin-users';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const params = await ctx.params;
    const id = String(params?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'User id is required' }, { status: 400 });

    const payload = await getAdminUserBehaviour(id);
    if (!payload) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load user overview' }, { status: 500 });
  }
}

