/**
 * Drive storage is granted exclusively through Docrud Infinity (5 GB).
 * Separate drive plans (drive-starter, drive-pro) have been removed.
 * This route now only exposes a GET endpoint to read the user's current quota.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getUserDriveQuota } from '@/lib/server/drive-storage';

export const dynamic = 'force-dynamic';

/** GET — return the current user's drive quota derived from their Infinity status */
export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const users = await getStoredUsers();
    const normalizedEmail = (session.user.email || '').trim().toLowerCase();
    const user = users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    const quota = await getUserDriveQuota(user.id);
    return NextResponse.json(quota);
  } catch (error) {
    console.error('[drive-upgrade GET]', error);
    return NextResponse.json({ error: 'Failed to load drive quota.' }, { status: 500 });
  }
}

/** POST/PUT — drive-plan purchase endpoints removed; drive storage is via Infinity only */
export async function POST() {
  return NextResponse.json(
    { error: 'Separate drive plans are no longer available. Drive storage (5 GB) is included with Docrud Infinity.' },
    { status: 410 }, // 410 Gone
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Separate drive plans are no longer available. Drive storage (5 GB) is included with Docrud Infinity.' },
    { status: 410 },
  );
}
