/**
 * People you may know — ranked candidates for the signed-in user.
 *
 * Read-only, one request, deterministic. The ranking uses signals this
 * codebase already stores; nothing is invented:
 *
 *   1. Mutual connections — people the viewer follows who also follow the
 *      candidate. Derived from the real follow graph, so a zero never gets
 *      dressed up as a number.
 *   2. Shared skills and headline/domain overlap, from the stored profile.
 *   3. Same location.
 *   4. Followers, as a mild popularity tiebreak.
 *
 * Cost is bounded: one users read, one profiles read, one following read for
 * the viewer, and at most FANOUT_LIMIT following reads to walk the
 * friend-of-friend edge. The result is cached in-process for a minute, the
 * same pattern /api/public/ad-banners uses.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getAllProfiles, getFollowing } from '@/lib/server/user-profiles';
import { getFeedConfig } from '@/lib/server/feed-config';

export const dynamic = 'force-dynamic';

/** How many of the viewer's connections we walk for friend-of-friend. */
const FANOUT_LIMIT = 30;
const CACHE_TTL = 60_000;

type Cached = { payload: unknown; ts: number };
const cache = new Map<string, Cached>();

export type PersonRecommendation = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  shortBio: string | null;
  location: string | null;
  skills: string[];
  mutualCount: number;
  mutualAvatars: string[];
  isFollowing: boolean;
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

/** First sentence, capped — a card shows a line or two, never a full bio. */
function shortBio(bio: unknown): string | null {
  const text = typeof bio === 'string' ? bio.trim() : '';
  if (!text) return null;
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return (first.length > 120 ? `${first.slice(0, 117)}…` : first);
}

function tokens(s: unknown): Set<string> {
  return new Set(
    String(s ?? '')
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length > 2),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  a.forEach((t) => { if (b.has(t)) n++; });
  return n;
}

/** Deterministic per-viewer ordering key. Same inputs, same order, every time. */
function stableKey(viewerId: string, candidateId: string): number {
  let h = 2166136261;
  const s = `${viewerId}:${candidateId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export async function GET() {
  try {
    const session = await getAuthSession();
    const meId = session?.user ? await resolveSessionUserId(session) : null;
    if (!meId) return NextResponse.json({ people: [], total: 0 }, { headers: { 'Cache-Control': 'no-store' } });

    const hit = cache.get(meId);
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      return NextResponse.json(hit.payload, { headers: { 'Cache-Control': 'no-store' } });
    }

    const config = await getFeedConfig();
    if (!config.people.enabled) {
      return NextResponse.json({ people: [], total: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const [users, profiles, myFollowing] = await Promise.all([
      getStoredUsers(),
      getAllProfiles(),
      getFollowing(meId),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const followingSet = new Set(myFollowing);

    /* Friend-of-friend: walk the people the viewer follows and count how many
       of them follow each candidate. That count IS the mutual number shown. */
    const mutuals = new Map<string, string[]>();
    const fanout = myFollowing.slice(0, FANOUT_LIMIT);
    const theirFollowing = await Promise.all(fanout.map((id) => getFollowing(id).catch(() => [] as string[])));
    fanout.forEach((connectionId, i) => {
      for (const candidate of theirFollowing[i]) {
        if (candidate === meId || followingSet.has(candidate)) continue;
        const list = mutuals.get(candidate);
        if (list) list.push(connectionId);
        else mutuals.set(candidate, [connectionId]);
      }
    });

    const myProfile = profiles[meId] ?? {};
    const mySkills = new Set<string>(
      (Array.isArray((myProfile as { skills?: unknown }).skills) ? (myProfile as { skills: unknown[] }).skills : [])
        .map((s) => String(s).toLowerCase()),
    );
    const myInterests = new Set<string>(
      (Array.isArray((myProfile as { interests?: unknown }).interests) ? (myProfile as { interests: unknown[] }).interests : [])
        .map((s) => String(s).toLowerCase().trim())
        .filter(Boolean),
    );
    const myDomain = tokens((myProfile as { headline?: unknown }).headline);
    const myLocation = String((myProfile as { location?: unknown }).location ?? '').toLowerCase();

    type Scored = { rec: PersonRecommendation; score: number };
    const scored: Scored[] = [];
    /* Candidates with no overlapping signal at all. Kept aside so the module can
       still fill its row through discovery instead of collapsing — never mixed
       into the ranked tier, and never given a fabricated reason. */
    const discovery: Scored[] = [];

    for (const u of users) {
      if (u.id === meId) continue;
      if (followingSet.has(u.id)) continue;          // already connected
      if (!isVisible(u)) continue;                    // deleted / disabled

      const p = (profiles[u.id] ?? {}) as {
        avatarUrl?: unknown; headline?: unknown; bio?: unknown; location?: unknown; skills?: unknown; interests?: unknown;
      };
      const mutualIds = mutuals.get(u.id) ?? [];
      const skills = (Array.isArray(p.skills) ? p.skills : []).map((s) => String(s));
      const skillSet = new Set(skills.map((s) => s.toLowerCase()));
      const loc = String(p.location ?? '').toLowerCase();

      const interestSet = new Set<string>(
        (Array.isArray(p.interests) ? p.interests : []).map((s) => String(s).toLowerCase().trim()).filter(Boolean),
      );
      const sharedInterests = overlap(myInterests, interestSet);
      const sharedSkills = overlap(mySkills, skillSet);
      const sharedDomain = overlap(myDomain, tokens(p.headline));
      const sameLocation = myLocation && loc && myLocation === loc ? 1 : 0;

      /* Weights come from the Superadmin-editable configuration, not from
         constants. A candidate with no signal at all is not recommended. */
      const score =
        mutualIds.length * config.people.mutualWeight +
        sharedInterests * config.people.interestWeight +
        sharedSkills * config.people.skillWeight +
        sharedDomain * config.people.domainWeight +
        sameLocation * config.people.locationWeight;

      const entry: Scored = {
        score,
        rec: {
          userId: u.id,
          name: u.name?.trim() || 'Docrud member',
          avatarUrl: (typeof p.avatarUrl === 'string' && p.avatarUrl) || null,
          headline: (typeof p.headline === 'string' && p.headline.trim()) || null,
          shortBio: shortBio(p.bio),
          location: (typeof p.location === 'string' && p.location.trim()) || null,
          skills: skills.slice(0, 3),
          mutualCount: mutualIds.length,
          mutualAvatars: mutualIds
            .slice(0, 2)
            .map((id) => {
              const mp = profiles[id] as { avatarUrl?: unknown } | undefined;
              return typeof mp?.avatarUrl === 'string' ? mp.avatarUrl : '';
            })
            .filter(Boolean),
          isFollowing: false,   // filtered out above, so never true here
        },
      };
      if (score > 0) scored.push(entry);
      else discovery.push(entry);
    }

    scored.sort((a, b) => b.score - a.score || a.rec.name.localeCompare(b.rec.name));

    /* Discovery fallback: only reached when ranking did not fill the row. The
       order is a stable hash of viewer id + candidate id, so it is varied
       between viewers but identical across re-renders and re-fetches for the
       same viewer. Math.random() would make cards jump. */
    const people = scored.slice(0, config.people.maxCards).map((s) => s.rec);
    if (config.people.discoveryEnabled && people.length < config.people.maxCards) {
      const seen = new Set(people.map((r) => r.userId));
      discovery
        .map((d) => ({ d, k: stableKey(meId, d.rec.userId) }))
        .sort((a, b) => a.k - b.k || a.d.rec.name.localeCompare(b.d.rec.name))
        .forEach(({ d }) => {
          if (people.length >= config.people.maxCards || seen.has(d.rec.userId)) return;
          seen.add(d.rec.userId);
          people.push(d.rec);
        });
    }

    /* `total` is how many people actually ranked as a match, BEFORE maxCards
       trims the row — the number the homepage headline reports. Discovery
       fill is deliberately excluded: those are not matches. */
    const payload = { people, total: scored.length };

    cache.set(meId, { payload, ts: Date.now() });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[recommendations/people] GET error', error);
    return NextResponse.json({ people: [], total: 0 }, { status: 200 });
  }
}
