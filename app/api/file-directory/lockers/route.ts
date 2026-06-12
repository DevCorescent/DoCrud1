import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createFileLocker, getVisibleLockersForUser, rotateLockerPassword, updateLockerSettings } from '@/lib/server/file-lockers';

function canUseLockers(role?: string) {
  return role === 'admin' || role === 'client' || role === 'individual';
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseLockers(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lockers = await getVisibleLockersForUser({
      role: session.user.role,
      userId: session.user.id,
      email: session.user.email || undefined,
    });
    return NextResponse.json(lockers);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to load lockers.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseLockers(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as {
      name?: string;
      description?: string;
      category?: string;
      password?: string;
      passwordRotationDays?: number;
    };

    if (!payload.name?.trim()) {
      return NextResponse.json({ error: 'Locker name is required.' }, { status: 400 });
    }

    const locker = await createFileLocker({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email || 'docrud@user.local',
      ownerName: session.user.name || 'docrud user',
      organizationId: session.user.role === 'client' ? session.user.id : undefined,
      organizationName: session.user.role === 'client' ? (session.user.organizationName || session.user.name || 'Business Workspace') : undefined,
      name: payload.name,
      description: payload.description,
      category: payload.category,
      password: payload.password,
      passwordRotationDays: typeof payload.passwordRotationDays === 'number' ? payload.passwordRotationDays : undefined,
    });

    return NextResponse.json(locker, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to create locker.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canUseLockers(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as {
      id?: string;
      action?: 'rotate-password' | 'update-settings';
      name?: string;
      description?: string;
      category?: string;
      passwordRotationDays?: number;
      nextPassword?: string;
    };

    if (!payload.id) {
      return NextResponse.json({ error: 'Locker ID is required.' }, { status: 400 });
    }

    const actorName = session.user.name || session.user.email || 'docrud user';
    const actorUserId = session.user.id;

    const locker = payload.action === 'rotate-password'
      ? await rotateLockerPassword(payload.id, {
          actorName,
          actorUserId,
          nextPassword: payload.nextPassword,
          rotationDays: payload.passwordRotationDays,
        })
      : await updateLockerSettings(payload.id, {
          actorName,
          actorUserId,
          name: payload.name,
          description: payload.description,
          category: payload.category,
          passwordRotationDays: payload.passwordRotationDays,
        });

    if (!locker) {
      return NextResponse.json({ error: 'Locker not found.' }, { status: 404 });
    }

    return NextResponse.json(locker);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to update locker.' }, { status: 500 });
  }
}
