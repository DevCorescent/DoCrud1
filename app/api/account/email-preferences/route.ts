export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers, saveStoredUsers } from '@/lib/server/auth';

const ALLOWED_KEYS = ['follows', 'likes', 'comments', 'mentions', 'gig_applied', 'messages', 'billing', 'system'] as const;
type PrefKey = typeof ALLOWED_KEYS[number];

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const users = await getStoredUsers();
    const user = users.find((u) => u.id === session.user!.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ emailPreferences: user.emailPreferences ?? {} });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as Record<string, boolean> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    // Only allow whitelisted keys with boolean values
    const prefs: Partial<Record<PrefKey, boolean>> = {};
    for (const key of ALLOWED_KEYS) {
      if (typeof body[key] === 'boolean') prefs[key] = body[key];
    }

    const users = await getStoredUsers();
    const idx = users.findIndex((u) => u.id === session.user!.id);
    if (idx < 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const updated = [...users];
    updated[idx] = {
      ...updated[idx],
      emailPreferences: { ...(updated[idx].emailPreferences ?? {}), ...prefs },
    };
    await saveStoredUsers(updated);

    return NextResponse.json({ emailPreferences: updated[idx].emailPreferences });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
