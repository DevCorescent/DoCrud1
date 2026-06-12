import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { canUserAccessFeature } from '@/lib/server/saas';
import {
  createVirtualIdCard,
  deleteVirtualIdCard,
  getVirtualIdWorkspaceData,
  updateVirtualIdCard,
} from '@/lib/server/virtual-ids';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const users = await getStoredUsers();
  const actor = users.find((user) => user.email.toLowerCase() === (session.user.email || '').toLowerCase());
  if (!actor) {
    return { error: NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 }) };
  }

  if (actor.role !== 'admin') {
    const allowed = await canUserAccessFeature(actor, 'virtual_id');
    if (!allowed) {
      return { error: NextResponse.json({ error: 'Your current plan does not include Virtual ID.' }, { status: 403 }) };
    }
  }

  return { actor };
}

export async function GET() {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await getVirtualIdWorkspaceData(resolved.actor);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load Virtual ID workspace.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await request.json();
    const created = await createVirtualIdCard(resolved.actor, payload);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create Virtual ID.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await request.json();
    if (!payload?.cardId) {
      return NextResponse.json({ error: 'Card ID is required.' }, { status: 400 });
    }
    const updated = await updateVirtualIdCard(resolved.actor, String(payload.cardId), payload.updates || {});
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update Virtual ID.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Card ID is required.' }, { status: 400 });
    }
    await deleteVirtualIdCard(resolved.actor, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete Virtual ID.' }, { status: 400 });
  }
}
