export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import {
  getConversations,
  getOrCreateConversation,
  sendMessage,
  getMessageRequests,
} from '@/lib/server/messages';
import { getProfileData } from '@/lib/server/user-profiles';
import { readJsonFile, usersPath } from '@/lib/server/storage';
import { hasInfinity } from '@/lib/server/infinity';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  accountType?: string;
}

async function enrichConversations(convs: Awaited<ReturnType<typeof getConversations>>, currentUserId: string) {
  const usersRaw = await readJsonFile<Record<string, UserRecord>>(usersPath, {});
  // users.json is keyed by position index, not by user id — build a proper lookup map
  const users: Record<string, UserRecord> = {};
  for (const u of Object.values(usersRaw)) { if (u?.id) users[String(u.id)] = u; }
  const profiles = await Promise.all(
    convs.map(async (c) => {
      const otherId = c.participants.find((p) => p !== currentUserId)!;
      const user = users[String(otherId)];
      const profile = await getProfileData(otherId);
      return {
        ...c,
        otherUser: {
          id: otherId,
          name: user?.name ?? 'Unknown User',
          avatarUrl: profile.avatarUrl ?? null,
          headline: profile.headline ?? null,
          docrudGo: profile.docrudGo ?? false,
        },
      };
    })
  );
  return profiles;
}

// GET /api/messages — list conversations
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  const infinityOk = await hasInfinity(userId);
  if (!infinityOk) {
    return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'chat' }, { status: 403 });
  }
  const [conversations, requests] = await Promise.all([
    getConversations(userId),
    getMessageRequests(userId),
  ]);

  const activeConvs = conversations.filter((c) => c.status === 'active');
  const [enrichedActive, enrichedRequests] = await Promise.all([
    enrichConversations(activeConvs, userId),
    enrichConversations(requests, userId),
  ]);

  return NextResponse.json({ conversations: enrichedActive, requests: enrichedRequests });
}

// POST /api/messages — start or resume a conversation (returns enriched conversation)
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { toUserId: string; content?: string; source?: 'service' };
  const { toUserId, content, source } = body;

  if (!toUserId) return NextResponse.json({ error: 'toUserId required' }, { status: 400 });
  if (toUserId === session.user.id) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 });

  const infinity = await hasInfinity(session.user.id);
  if (!infinity) {
    return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'chat' }, { status: 403 });
  }

  const { conversation } = await getOrCreateConversation(session.user.id, toUserId, source);

  // Send initial message if provided
  if (content?.trim()) {
    await sendMessage(conversation.id, session.user.id, content.trim());
  }

  // Return enriched with other user's profile so client can display immediately
  const [enriched] = await enrichConversations([conversation], session.user.id);
  return NextResponse.json({ conversation: enriched ?? conversation });
}
