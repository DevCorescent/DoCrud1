export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getPollData, getAllChatMeta } from '@/lib/server/messages';
import { getProfileData } from '@/lib/server/user-profiles';
import { readJsonFile, usersPath } from '@/lib/server/storage';

interface UserRecord { id: string; name: string; }

// Simple in-process profile cache — avoids re-reading users.json + profiles on every 600ms poll.
// Entries expire after 45 seconds. This is safe because profiles rarely change mid-session.
const profileCache = new Map<string, { data: { name: string; avatarUrl: string | null; headline: string | null; docrudGo: boolean }; exp: number }>();
const PROFILE_TTL = 45_000;

async function getEnrichedProfile(userId: string, users: Record<string, UserRecord>) {
  const now = Date.now();
  const cached = profileCache.get(userId);
  if (cached && cached.exp > now) return cached.data;
  const user = users[userId];
  const profile = await getProfileData(userId);
  const data = {
    name: user?.name ?? 'Unknown User',
    avatarUrl: profile.avatarUrl ?? null,
    headline: profile.headline ?? null,
    docrudGo: profile.docrudGo ?? false,
  };
  profileCache.set(userId, { data, exp: now + PROFILE_TTL });
  return data;
}

// GET /api/messages/poll?since=TIMESTAMP&conv=CONV_ID
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const since = Number(searchParams.get('since') ?? '0');
  const convId = searchParams.get('conv') ?? '';

  // Run poll data + chatMeta fetch in parallel
  const [{ newMessages, typingUsers, conversations, deletedMessageIds }, chatMeta, usersRaw] = await Promise.all([
    getPollData(session.user.id, convId, since),
    getAllChatMeta(session.user.id),
    readJsonFile<Record<string, UserRecord>>(usersPath, {}),
  ]);

  // Build id → user lookup (users.json is keyed by array index)
  const users: Record<string, UserRecord> = {};
  for (const u of Object.values(usersRaw)) { if (u?.id) users[String(u.id)] = u; }

  // Enrich typing users (usually 0-1 entries, cheap)
  const enrichedTypingUsers = await Promise.all(
    typingUsers.map(async (uid) => {
      const p = await getEnrichedProfile(uid, users);
      return { id: uid, name: p.name, avatarUrl: p.avatarUrl };
    })
  );

  // Enrich conversations — use cache for profiles
  const enrichedConvs = await Promise.all(
    conversations.map(async (c) => {
      const otherId = c.participants.find((p) => p !== session.user.id)!;
      const profile = await getEnrichedProfile(otherId, users);
      return {
        ...c,
        otherUser: { id: otherId, ...profile },
      };
    })
  );

  return NextResponse.json({
    newMessages,
    typingUsers: enrichedTypingUsers,
    conversations: enrichedConvs,
    deletedMessageIds,
    chatMeta,
    serverTime: Date.now(),
  });
}
