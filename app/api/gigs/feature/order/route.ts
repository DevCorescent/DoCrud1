import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createGigUrgentOrder } from '@/lib/server/gigs';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  const normalizedEmail = (session.user.email || '').trim().toLowerCase();
  return users.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail) || null;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const gigId = typeof body?.gigId === 'string' ? body.gigId : '';
    const durationDays = Number(body?.durationDays);

    if (!gigId || !Number.isFinite(durationDays)) {
      return NextResponse.json({ error: 'Gig and duration are required.' }, { status: 400 });
    }

    const checkout = await createGigUrgentOrder(actor, gigId, durationDays);
    return NextResponse.json(checkout);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create urgent checkout.' }, { status: 400 });
  }
}
