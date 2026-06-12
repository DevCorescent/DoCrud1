import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUsers } from '@/lib/server/auth';
import { canUserAccessFeature } from '@/lib/server/saas';
import { getTeamWorkspaceSummary, inviteTeamWorkspaceMember, updateTeamWorkspaceMember } from '@/lib/server/team-workspace';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((user) => user.email.toLowerCase() === (session.user.email || '').toLowerCase());

    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    if (storedUser.role !== 'admin') {
      const accessAllowed = await canUserAccessFeature(storedUser, 'team_workspace');
      if (!accessAllowed || (storedUser.role !== 'client' && storedUser.role !== 'member')) {
        return NextResponse.json({ error: 'Your current plan does not include team workspace collaboration.' }, { status: 403 });
      }
    }

    if (storedUser.role !== 'admin' && storedUser.role !== 'client' && storedUser.role !== 'member') {
      return NextResponse.json({ error: 'Your current plan does not include team workspace collaboration.' }, { status: 403 });
    }

    const summary = await getTeamWorkspaceSummary(storedUser);
    return NextResponse.json({
      ...summary,
      adminView: storedUser.role === 'admin',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load team workspace.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((user) => user.email.toLowerCase() === (session.user.email || '').toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    if (storedUser.role !== 'client' && storedUser.role !== 'admin') {
      return NextResponse.json({ error: 'Only workspace owners or super admin can create internal users.' }, { status: 403 });
    }

    const accessAllowed = storedUser.role === 'admin' ? true : await canUserAccessFeature(storedUser, 'team_workspace');
    if (!accessAllowed) {
      return NextResponse.json({ error: 'Your current plan does not include team workspace collaboration.' }, { status: 403 });
    }

    const payload = await request.json() as { name: string; email?: string; loginId?: string; permissions?: string[]; password?: string };
    const result = await inviteTeamWorkspaceMember(storedUser, payload);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to invite teammate.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'client' && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as { memberId: string; isActive?: boolean; permissions?: string[]; inviteStatus?: 'pending' | 'active' | 'disabled' };
    if (!payload.memberId) {
      return NextResponse.json({ error: 'Member ID is required.' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((user) => user.email.toLowerCase() === (session.user.email || '').toLowerCase());
    if (!storedUser && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    const actor = session.user.role === 'admin'
      ? users.find((user) => user.id === payload.memberId)?.organizationId
        ? users.find((user) => user.id === users.find((entry) => entry.id === payload.memberId)?.organizationId) || null
        : null
      : storedUser || null;

    if (!actor) {
      return NextResponse.json({ error: 'Unable to resolve workspace owner for this teammate.' }, { status: 400 });
    }

    const updated = await updateTeamWorkspaceMember(actor, payload.memberId, payload);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update teammate.' }, { status: 400 });
  }
}
