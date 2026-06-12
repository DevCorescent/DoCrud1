import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById, getPageEvents, createEvent } from '@/lib/server/business-pages';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const events = await getPageEvents(params.id);
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as {
      title?: string; description?: string; eventType?: string; startAt?: string;
      endAt?: string; location?: string; isOnline?: boolean; registrationUrl?: string; coverUrl?: string;
    };
    if (!body.title?.trim() || !body.startAt) return NextResponse.json({ error: 'Title and start date required' }, { status: 400 });

    const event = await createEvent({ id: randomUUID(), pageId: params.id, title: body.title.trim(), ...body, startAt: body.startAt });
    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
