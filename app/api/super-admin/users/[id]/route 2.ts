import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getAdminUserBehaviour } from '@/lib/server/admin-users';
import { getStoredUsers } from '@/lib/server/auth';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const users = await getStoredUsers();
    const user = users.find((u) => u.id === params.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const behaviour = await getAdminUserBehaviour(params.id).catch(() => null);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        permissions: user.permissions,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        subscription: user.subscription,
        safety: user.safety,
        policyAcceptance: user.policyAcceptance,
      },
      behaviour,
    });
  } catch (err) {
    console.error('[super-admin/users/[id]]', err);
    return NextResponse.json({ error: 'Failed to load user' }, { status: 500 });
  }
}
