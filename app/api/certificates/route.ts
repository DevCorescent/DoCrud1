import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { canUserAccessFeature } from '@/lib/server/saas';
import {
  createCertificate,
  deleteCertificate,
  getCertificatesWorkspaceData,
  updateCertificate,
} from '@/lib/server/certificates';

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
    const allowed = await canUserAccessFeature(actor, 'e_certificates');
    if (!allowed) {
      return { error: NextResponse.json({ error: 'Your current plan does not include E-Certificates.' }, { status: 403 }) };
    }
  }

  return { actor };
}

export async function GET() {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await getCertificatesWorkspaceData(resolved.actor);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load certificate workspace.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await request.json();
    const created = await createCertificate(resolved.actor, payload);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create certificate.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const payload = await request.json();
    if (!payload?.certificateId) {
      return NextResponse.json({ error: 'Certificate ID is required.' }, { status: 400 });
    }
    const updated = await updateCertificate(resolved.actor, String(payload.certificateId), payload.updates || {});
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update certificate.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) return resolved.error;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Certificate ID is required.' }, { status: 400 });
    }
    await deleteCertificate(resolved.actor, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete certificate.' }, { status: 400 });
  }
}
