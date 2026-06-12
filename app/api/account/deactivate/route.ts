export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { verifyAccountActionOtp } from '@/lib/server/otp-sessions';
import { sendDeactivationConfirmEmail } from '@/lib/server/account-emails';

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sessionId?: string; otp?: string; durationDays?: number | null };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { sessionId, otp, durationDays } = body;

  if (!sessionId || !otp) {
    return NextResponse.json({ error: 'sessionId and otp are required' }, { status: 400 });
  }

  // durationDays: null = indefinite, number = days until auto-delete
  if (durationDays !== null && durationDays !== undefined) {
    if (!Number.isInteger(durationDays) || durationDays < 7 || durationDays > 365) {
      return NextResponse.json({ error: 'durationDays must be between 7 and 365, or null for indefinite' }, { status: 400 });
    }
  }

  try {
    const users = await getStoredUsers();
    const user  = users.find((u) => u.id === session.user.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify OTP
    await verifyAccountActionOtp({
      sessionId,
      email: user.email,
      userId: user.id,
      action: 'deactivate',
      otp,
    });

    // Calculate deadline
    const now          = new Date();
    const deactivatedAt = now.toISOString();
    let deadline: string | null = null;
    if (typeof durationDays === 'number' && durationDays > 0) {
      const d = new Date(now);
      d.setDate(d.getDate() + durationDays);
      deadline = d.toISOString();
    }

    // Update user record
    const updated = users.map((u) =>
      u.id === session.user.id
        ? {
            ...u,
            isActive: false,
            deactivatedAt,
            deactivationDeadline: deadline ?? undefined,
            deactivationWarningEmailSentAt: undefined,
            pendingDeletion: false,
          }
        : u,
    );
    await saveStoredUsers(updated);

    // Send confirmation email (non-blocking)
    sendDeactivationConfirmEmail({
      to: user.email,
      name: user.name,
      deadline,
    }).catch(() => {});

    return NextResponse.json({ success: true, deadline });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to deactivate account';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
