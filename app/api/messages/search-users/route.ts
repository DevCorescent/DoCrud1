export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getAllProfiles, isFollowing } from '@/lib/server/user-profiles';

function scoreMatch(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  // First name or last name starts with query
  const parts = n.split(' ');
  if (parts.some((p) => p.startsWith(q))) return 70;
  if (n.includes(q)) return 50;
  // Each word in query matches start of some part
  const qParts = q.split(' ').filter(Boolean);
  if (qParts.length > 1 && qParts.every((qp) => parts.some((p) => p.startsWith(qp)))) return 60;
  return 0;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') ?? '').trim();

  const [users, profiles] = await Promise.all([
    getStoredUsers(),
    getAllProfiles(),
  ]);

  // Filter out self and inactive users
  const candidates = users.filter(
    (u) => u.id !== session.user.id && u.isActive !== false
  );

  // Score each user
  const scored = candidates
    .map((u) => ({ u, score: scoreMatch(u.name, query) }))
    .filter(({ score }) => score > 0 || !query)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  // Get follow status for each result
  const results = await Promise.all(
    scored.map(async ({ u }) => {
      const profile = profiles[u.id] ?? {};
      const [iFollow, theyFollow] = await Promise.all([
        isFollowing(session.user.id, u.id),
        isFollowing(u.id, session.user.id),
      ]);
      return {
        id: u.id,
        name: u.name,
        avatarUrl: profile.avatarUrl ?? null,
        headline: profile.headline ?? null,
        docrudGo: profile.docrudGo ?? false,
        iFollow,
        theyFollow,
        isMutual: iFollow && theyFollow,
      };
    })
  );

  // Sort: mutual first, then I-follow-them, then they-follow-me, then others
  results.sort((a, b) => {
    const rankA = a.isMutual ? 3 : a.iFollow ? 2 : a.theyFollow ? 1 : 0;
    const rankB = b.isMutual ? 3 : b.iFollow ? 2 : b.theyFollow ? 1 : 0;
    return rankB - rankA;
  });

  return NextResponse.json({ users: results });
}
