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
import { getMongoDb } from '@/lib/server/database';

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

/** Escapes a user-typed query for safe use inside a MongoDB regex. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    const meId = session?.user ? await resolveSessionUserId(session) : null;
    if (!meId) return NextResponse.json({ people: [] }, { status: 401 });

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

    /* Fast path: let the database do the matching.
       Reading every user and every profile to filter them in memory made this
       endpoint take seconds on a few hundred accounts, which a typeahead
       cannot afford — and it would only get worse. The query below touches a
       bounded number of documents and never loads the directory. */
    const db = await getMongoDb();
    if (db) {
      const filter: Record<string, unknown> = {
        isActive: { $ne: false },
        deactivatedAt: { $in: [null, undefined] },
        pendingDeletion: { $in: [null, undefined] },
        inviteStatus: { $ne: 'disabled' },
        id: { $ne: meId },            // never suggest the reader to themselves
        name: q
          ? { $regex: escapeRegex(q), $options: 'i' }
          : { $exists: true, $ne: '' },
      };
      /* A few more than needed, so prefix matches can be promoted before the
         list is cut to LIMIT. */
      const rows = await db.collection('users')
        .find(filter, { projection: { _id: 0, id: 1, name: 1 } })
        .limit(LIMIT * 4)
        .toArray() as unknown as Array<{ id: string; name?: string }>;

      const ids = rows.map((r) => r.id);
      const profileRows = ids.length
        ? await db.collection('user_profiles')
            .find({ _id: { $in: ids } } as never, { projection: { avatarUrl: 1, headline: 1 } })
            .toArray() as unknown as Array<{ _id: unknown; avatarUrl?: unknown; headline?: unknown }>
        : [];
      const byId = new Map(profileRows.map((p) => [String(p._id), p]));

      const ranked = rows
        .map((r) => {
          const name = (r.name ?? '').trim();
          const lower = name.toLowerCase();
          const p = byId.get(r.id);
          return {
            rank: !q ? 2 : lower.startsWith(q) ? 0 : 1,
            c: {
              userId: r.id,
              name,
              avatarUrl: (typeof p?.avatarUrl === 'string' && p.avatarUrl) || null,
              headline: (typeof p?.headline === 'string' && p.headline.trim()) || null,
            } as MentionCandidate,
          };
        })
        .filter((r) => r.c.name)
        .sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name));

      return NextResponse.json(
        { people: ranked.slice(0, LIMIT).map((r) => r.c) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    /* Fallback for the file-backed store, which has no query engine. */
    const [users, profiles] = await Promise.all([getStoredUsers(), getAllProfiles()]);

    const scored: Array<{ c: MentionCandidate; rank: number }> = [];
    for (const u of users) {
      if (u.id === meId) continue;
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
