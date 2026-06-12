export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createAccountActionOtp } from '@/lib/server/otp-sessions';
import { sendAccountActionOtpEmail } from '@/lib/server/account-emails';

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'deactivate' && action !== 'delete') {
    return NextResponse.json({ error: 'action must be "deactivate" or "delete"' }, { status: 400 });
  }

  try {
    // Make sure user still exists and is not already pending deletion
    const users = await getStoredUsers();
    const user  = users.find((u) => u.id === session.user.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.pendingDeletion) {
      return NextResponse.json({ error: 'Account is already pending deletion.' }, { status: 409 });
    }

    const { sessionId, otp, expiresAt } = await createAccountActionOtp({
      email: user.email,
      userId: user.id,
      action,
    });

    // Send OTP email (non-blocking on failure)
    await sendAccountActionOtpEmail({
      to: user.email,
      name: user.name,
      otp,
      action,
      expiresAt,
    });

    return NextResponse.json({ sessionId, expiresAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send OTP';
    return NextResponse.json({ error: msg }, { status: 429 });
  }
}
