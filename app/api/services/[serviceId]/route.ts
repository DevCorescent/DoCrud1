import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { updateService, deleteService, type Service } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

export async function PUT(req: NextRequest, { params }: { params: { serviceId: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Partial<Service>;
    const updated = await updateService(actor.id, params.serviceId, body);
    if (!updated) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });

    return NextResponse.json({ service: updated });
  } catch (error) {
    console.error('[services/id] PUT error', error);
    return NextResponse.json({ error: 'Failed to update service.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { serviceId: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const deleted = await deleteService(actor.id, params.serviceId);
    if (!deleted) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[services/id] DELETE error', error);
    return NextResponse.json({ error: 'Failed to delete service.' }, { status: 500 });
  }
}
