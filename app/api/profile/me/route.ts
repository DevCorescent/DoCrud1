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

    let body: Partial<UserProfileData>;
    try {
      body = (await req.json()) as Partial<UserProfileData>;
    } catch (parseErr) {
      console.error('[profile/me] PATCH body parse error — payload may be too large:', parseErr);
      return NextResponse.json({ error: 'Request body could not be parsed. Image may be too large.' }, { status: 400 });
    }

    const avatarType = body.avatarUrl?.startsWith('data:') ? 'dataUrl' : body.avatarUrl?.startsWith('http') ? 'httpUrl' : body.avatarUrl ? 'other' : 'empty';
    const coverType  = body.coverGradient?.startsWith('data:') ? 'dataUrl' : body.coverGradient?.startsWith('http') ? 'httpUrl' : body.coverGradient ? 'cssGradient' : 'empty';
    console.log('[profile/me] PATCH received:', {
      userId: actor.id,
      avatarUrlType: avatarType,
      avatarUrlLength: body.avatarUrl?.length ?? 0,
      coverGradientType: coverType,
      coverGradientLength: body.coverGradient?.length ?? 0,
      bannerUrl: body.bannerUrl?.slice(0, 80),
    });

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

    try {
      await updateProfileData(actor.id, safeBody);
    } catch (dbErr) {
      console.error('[profile/me] PATCH DB upsert error:', dbErr);
      return NextResponse.json({ error: 'Failed to save profile to database.' }, { status: 500 });
    }

    const updated = await getProfileData(actor.id);
    console.log('[profile/me] PATCH success:', {
      avatarUrl: updated?.avatarUrl?.slice(0, 80),
      bannerUrl: updated?.bannerUrl?.slice(0, 80),
      coverGradient: updated?.coverGradient?.slice(0, 80),
    });
    return NextResponse.json({ profile: updated });
  } catch (error) {
    console.error('[profile/me] PATCH error', error);
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }
}
