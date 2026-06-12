import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById } from '@/lib/server/business-pages';
import { createInvite, getInvitesByPage, revokeInvite, deleteInvite } from '@/lib/server/business-members';

export const dynamic = 'force-dynamic';

function isOwner(page: { ownerUserId: string }, userId: string) {
  return page.ownerUserId === userId;
}

/** GET — list all invites for this page */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    if (!isOwner(page, session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const invites = await getInvitesByPage(params.id);
    return NextResponse.json({ invites });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST — create a new invite link */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    if (!isOwner(page, session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({})) as { label?: string; maxUses?: number; expiresIn?: number };

    const expiresAt = body.expiresIn
      ? new Date(Date.now() + body.expiresIn * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const invite = await createInvite({
      businessPageId: params.id,
      createdBy: session.user.id,
      label: body.label,
      maxUses: body.maxUses ?? null,
      expiresAt,
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** PATCH — revoke or delete an invite */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    if (!isOwner(page, session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({})) as { inviteId: string; action: 'revoke' | 'delete' };
    if (!body.inviteId || !['revoke', 'delete'].includes(body.action)) {
      return NextResponse.json({ error: 'inviteId and action required' }, { status: 400 });
    }

    if (body.action === 'revoke') await revokeInvite(body.inviteId);
    else await deleteInvite(body.inviteId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
