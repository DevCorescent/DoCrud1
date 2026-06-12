import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { deleteGigListing, getGigCategories, getGigInterests, getGigWorkspaceData, upsertGigListing, updateGigConnectionStatus } from '@/lib/server/gigs';
import type { GigConnectionRequest, GigListing } from '@/types/document';
import { canUserAccessFeature, isSubscriptionPeriodExpired } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return null;
  }

  const users = await getStoredUsers();
  return users.find((entry) => entry.email.toLowerCase() === session.user!.email!.toLowerCase()) || null;
}

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Gigs.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'gigs');
    if (!ok) {
      return NextResponse.json({ error: 'Gigs access is not included on your plan.' }, { status: 402 });
    }

    const [workspace, categories, interests] = await Promise.all([
      getGigWorkspaceData(actor),
      getGigCategories(),
      getGigInterests(),
    ]);

    return NextResponse.json({
      ...workspace,
      categories,
      interests,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to load gigs workspace.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Gigs.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'gigs');
    if (!ok) {
      return NextResponse.json({ error: 'Gigs access is not included on your plan.' }, { status: 402 });
    }

    const payload = await request.json() as Partial<GigListing>;
    if (!payload.title?.trim() || !payload.summary?.trim() || !payload.category?.trim()) {
      return NextResponse.json({ error: 'Title, summary, and category are required.' }, { status: 400 });
    }

    const gig = await upsertGigListing(actor, payload as Partial<GigListing> & { title: string; summary: string; category: string });
    return NextResponse.json(gig, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save gig.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Gigs.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'gigs');
    if (!ok) {
      return NextResponse.json({ error: 'Gigs access is not included on your plan.' }, { status: 402 });
    }

    const payload = await request.json() as { type?: 'connection'; id?: string; status?: GigConnectionRequest['status'] };
    if (payload.type !== 'connection' || !payload.id || !payload.status) {
      return NextResponse.json({ error: 'Connection update payload is incomplete.' }, { status: 400 });
    }

    const connection = await updateGigConnectionStatus(payload.id, actor, payload.status);
    return NextResponse.json(connection);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update gig data.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Gigs.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'gigs');
    if (!ok) {
      return NextResponse.json({ error: 'Gigs access is not included on your plan.' }, { status: 402 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Gig ID is required.' }, { status: 400 });
    }

    const removed = await deleteGigListing(id, actor);
    return NextResponse.json({ success: removed });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete gig.' }, { status: 400 });
  }
}
