export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import {
  getConversations,
  getOrCreateConversation,
  sendMessage,
  getMessageRequests,
} from '@/lib/server/messages';
import { getProfileData } from '@/lib/server/user-profiles';
import { getStoredUsers } from '@/lib/server/users';
import { hasInfinity } from '@/lib/server/infinity';

async function enrichConversations(convs: Awaited<ReturnType<typeof getConversations>>, currentUserId: string) {
  const allUsers = await getStoredUsers();
  const users: Record<string, { id: string; name: string }> = {};
  for (const u of allUsers) {
    if (u?.id) users[String(u.id)] = { id: u.id, name: u.name };
  }
  return Promise.all(
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
    }),
  );
}

// GET /api/messages — list conversations
export async function GET() {
  const session = await getAuthSession();
  const userId = await resolveSessionUserId(session);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const userId = await resolveSessionUserId(session);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { toUserId: string; content?: string; source?: 'service' };
  const { toUserId, content, source } = body;

  if (!toUserId) return NextResponse.json({ error: 'toUserId required' }, { status: 400 });
  if (toUserId === userId) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 });

  const infinity = await hasInfinity(userId);
  if (!infinity) {
    return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'chat' }, { status: 403 });
  }

  const { conversation } = await getOrCreateConversation(userId, toUserId, source);

  if (content?.trim()) {
    await sendMessage(conversation.id, userId, content.trim());
  }

  const [enriched] = await enrichConversations([conversation], userId);
  return NextResponse.json({ conversation: enriched ?? conversation });
}
