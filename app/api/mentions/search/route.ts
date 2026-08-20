/**
 * Typeahead source for @mentions.
 *
 * Anyone on Docrud can be mentioned — the follow graph is deliberately not
 * consulted. Existing endpoints could not be reused: /api/users is admin only
 * and /api/public/people returns the whole directory joined against gigs,
 * upraises and follow counts, which is far too heavy to hit per keystroke.
 * This returns only what a suggestion row draws.
 *
 * Signed-in callers only, so the member directory is not enumerable by
 * anonymous traffic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getAllProfiles } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

const LIMIT = 8;

export type MentionCandidate = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
};

/** Same visibility rule the rest of the public surface applies. */
function isVisible(u: StoredUser | undefined): u is StoredUser {
  if (!u) return false;
  if (u.isActive === false) return false;
  if (u.deactivatedAt) return false;
  if (u.pendingDeletion) return false;
  if (u.inviteStatus === 'disabled') return false;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    const meId = session?.user ? await resolveSessionUserId(session) : null;
    if (!meId) return NextResponse.json({ people: [] }, { status: 401 });

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

    const [users, profiles] = await Promise.all([getStoredUsers(), getAllProfiles()]);

    const scored: Array<{ c: MentionCandidate; rank: number }> = [];
    for (const u of users) {
      if (!isVisible(u)) continue;
      const name = (u.name ?? '').trim();
      if (!name) continue;

      const lower = name.toLowerCase();
      /* Prefix matches first, then anything containing the query. An empty
         query just returns the first names alphabetically. */
      let rank: number;
      if (!q) rank = 2;
      else if (lower.startsWith(q)) rank = 0;
      else if (lower.includes(q)) rank = 1;
      else continue;

      const p = (profiles[u.id] ?? {}) as { avatarUrl?: unknown; headline?: unknown };
      scored.push({
        rank,
        c: {
          userId: u.id,
          name,
          avatarUrl: (typeof p.avatarUrl === 'string' && p.avatarUrl) || null,
          headline: (typeof p.headline === 'string' && p.headline.trim()) || null,
        },
      });
    }

    scored.sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name));
    return NextResponse.json(
      { people: scored.slice(0, LIMIT).map((s) => s.c) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[mentions/search] GET error', error);
    return NextResponse.json({ people: [] }, { status: 200 });
  }
}
