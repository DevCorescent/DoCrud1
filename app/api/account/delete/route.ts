export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getAuthSession, getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { readJsonFile, writeJsonFile, userProfilesPath, followsPath } from '@/lib/server/storage';
import { verifyAccountActionOtp } from '@/lib/server/otp-sessions';
import { sendAccountDeletedEmail } from '@/lib/server/account-emails';

const CREDITS_FILE = path.join(process.cwd(), 'data', 'credits.json');

interface CreditsStore { users: Record<string, unknown>; }

export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sessionId?: string; otp?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { sessionId, otp } = body;
  if (!sessionId || !otp) {
    return NextResponse.json({ error: 'sessionId and otp are required' }, { status: 400 });
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
      action: 'delete',
      otp,
    });

    // Capture email/name before deletion for the goodbye email
    const { email: userEmail, name: userName } = user;

    // ── Purge all user data ──────────────────────────────────────────

    // 1. Remove from users.json
    await saveStoredUsers(users.filter((u) => u.id !== session.user.id));

    // 2. Remove from user-profiles.json
    const profiles = await readJsonFile<Record<string, unknown>>(userProfilesPath, {});
    delete profiles[session.user.id];
    await writeJsonFile(userProfilesPath, profiles);

    // 3. Remove from credits.json
    try {
      const raw   = await fs.readFile(CREDITS_FILE, 'utf8');
      const store = JSON.parse(raw) as CreditsStore;
      delete store.users[session.user.id];
      await fs.writeFile(CREDITS_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch { /* credits file may not exist */ }

    // 4. Remove from follows.json
    const follows = await readJsonFile<Record<string, string[]>>(followsPath, {});
    delete follows[session.user.id];
    for (const k of Object.keys(follows)) {
      follows[k] = (follows[k] || []).filter((id) => id !== session.user.id);
    }
    await writeJsonFile(followsPath, follows);

    // Send goodbye email (fire-and-forget)
    sendAccountDeletedEmail({ to: userEmail, name: userName }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete account';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
