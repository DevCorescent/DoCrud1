import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { ensureUserReferralCode, sendReferralInviteEmail } from '@/lib/server/referrals';
import { isValidEmail, normalizeEmail } from '@/lib/server/security';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const inviteeEmail = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';

    if (!inviteeEmail || !isValidEmail(inviteeEmail)) {
      return NextResponse.json({ error: 'A valid invitee email address is required.' }, { status: 400 });
    }

    // Cannot invite yourself
    if (inviteeEmail === normalizeEmail(session.user.email)) {
      return NextResponse.json({ error: 'You cannot send a referral invite to yourself.' }, { status: 400 });
    }

    // Prevent inviting already-registered users
    const users = await getStoredUsers();
    const alreadyExists = users.some((u) => u.email === inviteeEmail);
    if (alreadyExists) {
      return NextResponse.json({ error: 'This email is already registered on docrud.' }, { status: 409 });
    }

    const referralCode = await ensureUserReferralCode(session.user.id);
    if (!referralCode) {
      return NextResponse.json({ error: 'Could not generate your referral code. Please try again.' }, { status: 500 });
    }

    const origin = new URL(request.url).origin;
    const referrerUser = users.find((u) => u.id === session.user.id);

    await sendReferralInviteEmail({
      referrerUserId: session.user.id,
      referrerName: referrerUser?.name || session.user.name || 'A Docrud user',
      referrerEmail: session.user.email,
      inviteeEmail,
      referralCode,
      origin,
    });

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${inviteeEmail}.`,
    });
  } catch (error) {
    console.error('[referrals/invite]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send invite.' },
      { status: 500 },
    );
  }
}
