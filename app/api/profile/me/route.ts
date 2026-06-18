import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getProfileData, updateProfileData, type UserProfileData } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await getProfileData(actor.id);
    return NextResponse.json({ profile, user: { id: actor.id, name: actor.name, email: actor.email, role: actor.role, accountType: actor.accountType } });
  } catch (error) {
    console.error('[profile/me] GET error', error);
    return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Partial<UserProfileData>;

    if (body.bio && body.bio.length > 500) {
      return NextResponse.json({ error: 'Bio must be 500 characters or fewer.' }, { status: 400 });
    }

    if (body.skills && body.skills.length > 20) {
      return NextResponse.json({ error: 'You can add up to 20 skills.' }, { status: 400 });
    }

    if (body.website && body.website !== '') {
      try {
        new URL(body.website.startsWith('http') ? body.website : `https://${body.website}`);
      } catch {
        return NextResponse.json({ error: 'Website must be a valid URL.' }, { status: 400 });
      }
    }

    // Strip fields that should not be directly set via this endpoint
    const { updatedAt: _updatedAt, ...safeBody } = body as UserProfileData & { updatedAt?: string };

    await updateProfileData(actor.id, safeBody);
    const updated = await getProfileData(actor.id);
    return NextResponse.json({ profile: updated });
  } catch (error) {
    console.error('[profile/me] PATCH error', error);
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }
}
