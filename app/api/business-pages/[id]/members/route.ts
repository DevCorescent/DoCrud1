import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById } from '@/lib/server/business-pages';
import { getMembersWithProfiles, removeMember, updateMemberRole } from '@/lib/server/business-members';

export const dynamic = 'force-dynamic';

/** GET — list all members with profiles */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const members = await getMembersWithProfiles(params.id);
    return NextResponse.json({ members });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** PATCH — update member role/title/department, or remove a member */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({})) as {
      userId: string;
      action?: 'remove' | 'update';
      role?: string;
      title?: string;
      department?: string;
    };

    if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    if (body.action === 'remove') {
      await removeMember(params.id, body.userId);
    } else {
      await updateMemberRole(params.id, body.userId, {
        role: body.role, title: body.title, department: body.department,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
