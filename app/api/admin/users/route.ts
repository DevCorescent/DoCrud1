import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { listAdminUsers, adminDeleteUser, adminDisableUser, adminEnableUser, adminSuspendUser, adminUnsuspendUser } from '@/lib/server/admin-users';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const query = request.nextUrl.searchParams.get('query') || '';
    const statusRaw = request.nextUrl.searchParams.get('status') || 'all';
    const status = statusRaw === 'active' || statusRaw === 'suspended' || statusRaw === 'disabled' ? statusRaw : 'all';
    const limit = Number(request.nextUrl.searchParams.get('limit') || '260');

    return NextResponse.json(await listAdminUsers({ query, status, limit }));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const payload = await request.json().catch(() => null) as any;
    const action = String(payload?.action || '').trim();
    const userId = String(payload?.userId || '').trim();
    const reason = payload?.reason ? String(payload.reason).trim().slice(0, 800) : undefined;

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const actorUserId = session?.user?.id || 'admin';
    const actorEmail = session?.user?.email || undefined;
    const actorRole = session?.user?.role || undefined;

    if (action === 'suspend') {
      const days = payload?.days ? Number(payload.days) : 7;
      const result = await adminSuspendUser({ actorUserId, actorEmail, actorRole, targetUserId: userId, days, reason });
      return NextResponse.json({ ok: true, result });
    }
    if (action === 'unsuspend') {
      await adminUnsuspendUser({ actorUserId, actorEmail, actorRole, targetUserId: userId, reason });
      return NextResponse.json({ ok: true });
    }
    if (action === 'disable') {
      await adminDisableUser({ actorUserId, actorEmail, actorRole, targetUserId: userId, reason });
      return NextResponse.json({ ok: true });
    }
    if (action === 'enable') {
      await adminEnableUser({ actorUserId, actorEmail, actorRole, targetUserId: userId, reason });
      return NextResponse.json({ ok: true });
    }
    if (action === 'delete') {
      await adminDeleteUser({ actorUserId, actorEmail, actorRole, targetUserId: userId, reason });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to apply action' }, { status: 500 });
  }
}

