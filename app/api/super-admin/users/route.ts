import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { listAdminUsers, adminSuspendUser, adminUnsuspendUser, adminDisableUser, adminEnableUser, adminDeleteUser } from '@/lib/server/admin-users';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || '';
  const status = (searchParams.get('status') || 'all') as 'all' | 'active' | 'suspended' | 'disabled';
  const limit = parseInt(searchParams.get('limit') || '500');
  const accountType = searchParams.get('accountType') || '';
  const role = searchParams.get('role') || '';
  const planId = searchParams.get('planId') || '';

  try {
    const result = await listAdminUsers({ query, status, limit });
    let users = result.users;

    if (accountType) users = users.filter((u) => u.accountType === accountType);
    if (role) users = users.filter((u) => u.role === role);
    if (planId) {
      const allUsers = await getStoredUsers();
      const matchingIds = new Set(allUsers.filter((u) => u.subscription?.planId === planId).map((u) => u.id));
      users = users.filter((u) => matchingIds.has(u.id));
    }

    // Enrich with full subscription data
    const allUsers = await getStoredUsers();
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const enriched = users.map((u) => {
      const full = userMap.get(u.id);
      return {
        ...u,
        subscription: full?.subscription,
        policyAcceptance: full?.policyAcceptance,
        safety: full?.safety,
        organizationId: full?.organizationId,
      };
    });

    return NextResponse.json({ users: enriched, total: enriched.length });
  } catch (err) {
    console.error('[super-admin/users GET]', err);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, userId, reason, days, field, value } = body;

    if (!action || !userId) {
      return NextResponse.json({ error: 'action and userId required' }, { status: 400 });
    }

    await appendSuperAdminAudit({
      action: `user_${action}`,
      targetType: 'user',
      targetId: userId,
      details: { reason, days, field, value },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    const actorUserId = 'super-admin';
    const actorEmail = session.email || 'super-admin';

    switch (action) {
      case 'suspend':
        await adminSuspendUser({ actorUserId, actorEmail, targetUserId: userId, days: days || 7, reason: reason || 'Super admin action' });
        return NextResponse.json({ success: true });
      case 'unsuspend':
        await adminUnsuspendUser({ actorUserId, actorEmail, targetUserId: userId, reason: reason || 'Super admin action' });
        return NextResponse.json({ success: true });
      case 'disable':
        await adminDisableUser({ actorUserId, actorEmail, targetUserId: userId, reason: reason || 'Super admin action' });
        return NextResponse.json({ success: true });
      case 'enable':
        await adminEnableUser({ actorUserId, actorEmail, targetUserId: userId, reason: reason || 'Super admin action' });
        return NextResponse.json({ success: true });
      case 'delete':
        await adminDeleteUser({ actorUserId, actorEmail, targetUserId: userId, reason: reason || 'Super admin action' });
        return NextResponse.json({ success: true });
      case 'update_role': {
        const users = await getStoredUsers();
        const user = users.find((u) => u.id === userId);
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        user.role = value;
        await saveStoredUsers(users);
        return NextResponse.json({ success: true });
      }
      case 'update_plan': {
        const users = await getStoredUsers();
        const user = users.find((u) => u.id === userId);
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (!user.subscription) user.subscription = {} as never;
        user.subscription = { ...user.subscription, planId: value, planName: field || value };
        await saveStoredUsers(users);
        return NextResponse.json({ success: true });
      }
      case 'flag_scam': {
        const users = await getStoredUsers();
        const user = users.find((u) => u.id === userId);
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        user.safety = { ...user.safety, scamWarning: true, flaggedAt: new Date().toISOString() };
        await saveStoredUsers(users);
        return NextResponse.json({ success: true });
      }
      case 'clear_flag': {
        const users = await getStoredUsers();
        const user = users.find((u) => u.id === userId);
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        user.safety = { ...user.safety, scamWarning: false, flaggedAt: undefined };
        await saveStoredUsers(users);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[super-admin/users POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
