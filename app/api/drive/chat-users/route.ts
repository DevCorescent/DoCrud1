import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { readJsonFile, usersPath } from '@/lib/server/storage';
import { getProfileData } from '@/lib/server/user-profiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  accountType?: string;
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUserId = session.user.id;
    const usersRaw = await readJsonFile<Record<string, UserRecord>>(usersPath, {});

    // Build a lookup map (users.json is keyed by position index)
    const users: UserRecord[] = [];
    for (const u of Object.values(usersRaw)) {
      if (u?.id && u.id !== currentUserId) {
        users.push(u);
      }
    }

    // Enrich with profile data (avatarUrl)
    const enriched = await Promise.all(
      users.slice(0, 50).map(async (u) => {
        const profile = await getProfileData(u.id).catch(() => ({ avatarUrl: null }));
        return {
          id: u.id,
          name: u.name ?? 'Unknown User',
          email: u.email ?? '',
          avatarUrl: (profile as { avatarUrl?: string | null }).avatarUrl ?? null,
        };
      })
    );

    return NextResponse.json({ users: enriched });
  } catch (err) {
    console.error('[drive/chat-users]', err);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}
