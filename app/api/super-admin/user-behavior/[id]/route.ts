import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getAdminUserBehaviour } from '@/lib/server/admin-users';
import { getInfinityStatus } from '@/lib/server/infinity';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'User id required' }, { status: 400 });

  try {
    const [behaviour, infinity] = await Promise.all([
      getAdminUserBehaviour(id),
      getInfinityStatus(id),
    ]);
    if (!behaviour) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ ...behaviour, infinity });
  } catch (err) {
    console.error('[super-admin/user-behavior GET]', err);
    return NextResponse.json({ error: 'Failed to load user behaviour' }, { status: 500 });
  }
}
