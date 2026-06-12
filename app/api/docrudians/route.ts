import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { canUserAccessFeature } from '@/lib/server/saas';
import {
  addDocrudiansRoomResource,
  createDocrudiansCircle,
  createDocrudiansOpportunity,
  createDocrudiansPost,
  getDocrudiansWorkspaceData,
  joinDocrudiansCircle,
  upsertDocrudianProfile,
} from '@/lib/server/docrudians';

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
    const allowed = await canUserAccessFeature(actor, 'docrudians');
    if (!allowed) {
      return { error: NextResponse.json({ error: 'Your current plan does not include Docrudians.' }, { status: 403 }) };
    }
  }

  return { actor };
}

export async function GET() {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await getDocrudiansWorkspaceData(resolved.actor);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load Docrudians.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await request.json();
    const action = String(payload?.action || '');

    if (action === 'profile') {
      const profile = await upsertDocrudianProfile(resolved.actor, payload.data || {});
      return NextResponse.json(profile, { status: 201 });
    }
    if (action === 'post') {
      const post = await createDocrudiansPost(resolved.actor, payload.data || {});
      return NextResponse.json(post, { status: 201 });
    }
    if (action === 'circle') {
      const circle = await createDocrudiansCircle(resolved.actor, payload.data || {});
      return NextResponse.json(circle, { status: 201 });
    }
    if (action === 'opportunity') {
      const opportunity = await createDocrudiansOpportunity(resolved.actor, payload.data || {});
      return NextResponse.json(opportunity, { status: 201 });
    }
    if (action === 'join-circle') {
      if (!payload?.circleId) {
        return NextResponse.json({ error: 'Circle ID is required.' }, { status: 400 });
      }
      const circle = await joinDocrudiansCircle(resolved.actor, String(payload.circleId), {
        accessCode: payload?.accessCode ? String(payload.accessCode) : undefined,
      });
      return NextResponse.json(circle);
    }
    if (action === 'room-resource') {
      if (!payload?.circleId) {
        return NextResponse.json({ error: 'Room ID is required.' }, { status: 400 });
      }
      const room = await addDocrudiansRoomResource(resolved.actor, String(payload.circleId), payload.data || {});
      return NextResponse.json(room);
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update Docrudians.' }, { status: 400 });
  }
}
