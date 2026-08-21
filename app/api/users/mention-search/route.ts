/**
 * People search for the @mention picker.
 *
 * Ranked so the author's own network comes first: people they follow or who
 * follow them, then everyone else on Docrud. The follow graph is the product's
 * existing relationship system (lib/server/user-profiles.ts) — no second
 * notion of "connected" is introduced here.
 *
 * Only what the picker draws leaves the server: id, display name, headline and
 * avatar. Emails, roles and every other profile field stay behind.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getFollowers, getFollowing, getProfileFields, getProfileAvatars, getAllProfiles } from '@/lib/server/user-profiles';
import type { MentionUser } from '@/lib/mentions';

export const dynamic = 'force-dynamic';

/** Enough to fill the picker twice over; never the whole user base. */
const GROUP_LIMIT = 6;
const MAX_QUERY = 32;

/**
 * Prefix matches beat substring matches, and a match on any word of the name
 * beats one buried mid-word — the same shape of ranking the messages people
 * search already uses, so results feel consistent between the two.
 */
function scoreName(name: string, query: string): number {
  if (!query) return 1;
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.some((p) => p.startsWith(q))) return 70;
  const qParts = q.split(/\s+/).filter(Boolean);
  if (qParts.length > 1 && qParts.every((qp) => parts.some((p) => p.startsWith(qp)))) return 60;
  if (n.includes(q)) return 40;
  return 0;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const viewerId = session?.user?.id;
    if (!viewerId) {
      return NextResponse.json({ error: 'Sign in to mention people.' }, { status: 401 });
    }

    const query = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);

    /* Three bulk reads, never one per candidate: the user list, then the two
       halves of this viewer's follow graph. */
    const [users, following, followers] = await Promise.all([
      getStoredUsers().catch(() => [] as StoredUser[]),
      getFollowing(viewerId).catch(() => [] as string[]),
      getFollowers(viewerId).catch(() => [] as string[]),
    ]);

    const iFollow = new Set(following.map(String));
    const followsMe = new Set(followers.map(String));

    type Candidate = { user: StoredUser; score: number; rank: number };
    const connected: Candidate[] = [];
    const others: Candidate[] = [];

    for (const user of users) {
      const id = String(user?.id ?? '');
      const name = typeof user?.name === 'string' ? user.name.trim() : '';
      if (!id || !name || user.isActive === false) continue;

      const score = scoreName(name, query);
      if (score === 0) continue;

      /* Mutual first, then people the viewer follows, then their followers. */
      const mutual = iFollow.has(id) && followsMe.has(id);
      const rank = mutual ? 3 : iFollow.has(id) ? 2 : followsMe.has(id) ? 1 : 0;
      (rank > 0 ? connected : others).push({ user, score, rank });
    }

    const byRelevance = (a: Candidate, b: Candidate) =>
      b.rank - a.rank || b.score - a.score || a.user.name.localeCompare(b.user.name);

    const top = [
      ...connected.sort(byRelevance).slice(0, GROUP_LIMIT),
      ...others.sort(byRelevance).slice(0, GROUP_LIMIT),
    ];

    /* Profile detail is fetched only for the handful actually returned. */
    const ids = top.map((c) => String(c.user.id));
    const [avatars, profiles] = await Promise.all([
      getProfileAvatars(ids).catch(() => new Map<string, string | null>()),
      getAllProfiles().catch(() => ({} as Record<string, { headline?: string }>)),
    ]);

    const shape = (c: Candidate): MentionUser => ({
      id: String(c.user.id),
      name: c.user.name.trim(),
      headline: profiles[String(c.user.id)]?.headline ?? null,
      avatarUrl: avatars.get(String(c.user.id)) ?? null,
    });

    return NextResponse.json(
      {
        connected: top.filter((c) => c.rank > 0).map(shape),
        others: top.filter((c) => c.rank === 0).map(shape),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ connected: [], others: [] });
  }
}
