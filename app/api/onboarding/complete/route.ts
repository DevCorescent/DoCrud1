import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getProfileData, updateProfileData, type UserProfileData } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Individual accounts must verify their email before completing onboarding.
    // Non-individual accounts (admin, client, employee) are exempt.
    if (actor.accountType === 'individual') {
      const profile = await getProfileData(actor.id);
      if (profile?.emailVerified !== true) {
        return NextResponse.json(
          { error: 'Email not verified. Please verify your email to continue.' },
          { status: 403 },
        );
      }
    }

    const body = (await req.json()) as { profile?: Partial<UserProfileData> };
    const profilePayload = body.profile ?? {};

    await updateProfileData(actor.id, {
      ...profilePayload,
      onboardingDone: true,
      profileSetupDone: true,
    });

    return NextResponse.json({ done: true });
  } catch (error) {
    console.error('[onboarding/complete] POST error', error);
    return NextResponse.json({ error: 'Failed to complete onboarding.' }, { status: 500 });
  }
}
