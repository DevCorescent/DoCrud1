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
import { registerRecommendationCache, rememberViewerCount } from '@/lib/server/recommendation-cache';

export const dynamic = 'force-dynamic';

/** How many of the viewer's connections we walk for friend-of-friend. */
const FANOUT_LIMIT = 30;
const CACHE_TTL = 60_000;

type Cached = { payload: unknown; ts: number };
const cache = new Map<string, Cached>();
/* Registered so a job write can clear it — see lib/server/recommendation-cache.ts. */
registerRecommendationCache(cache);

/**
 * Why this person was recommended.
 *
 * Every variant carries the FACTS behind it, not a sentence: which skills
 * actually overlapped, which interests, how many mutuals. The wording is the
 * client's job, but the evidence is computed here, where the ranking is — a
 * reason invented at render time would eventually disagree with the score that
 * put the person in the row.
 *
 * `discovery` is the honest label for the fill tier: those candidates matched
 * on nothing, and the row says so rather than inventing a reason for them.
 */
export type PersonReason =
  | { kind: 'mutual'; count: number }
  | { kind: 'skills'; values: string[] }
  | { kind: 'interests'; values: string[] }
  | { kind: 'domain'; values: string[] }
  | { kind: 'location'; value: string }
  | { kind: 'discovery' };

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
  /** Strongest first, by the same weights that produced the score. */
  reasons: PersonReason[];
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

/**
 * Function words, dropped from headline tokens.
 *
 * The length > 2 filter alone let "with", "and", "the" through, and two
 * headlines sharing the word "and" scored as a domain match. That was noise in
 * the RANKING before it was ever wording on a card — the card just made it
 * visible, by offering to print "Similar role — with".
 */
const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'our',
  'are', 'was', 'were', 'have', 'has', 'had', 'not', 'but', 'all', 'any',
  'who', 'how', 'why', 'what', 'when', 'where', 'into', 'over', 'out',
  'about', 'across', 'building', 'building.', 'work', 'working', 'currently',
  'passionate', 'love', 'helping', 'making', 'looking',
]);

function tokens(s: unknown): Set<string> {
  return new Set(
    String(s ?? '')
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  a.forEach((t) => { if (b.has(t)) n++; });
  return n;
}

/**
 * The same intersection, but returning the matched terms as the CANDIDATE
 * spells them.
 *
 * Matching is done on lowercased sets, so the matched values have to be read
 * back off the candidate's own list or the card would print "react, typescript"
 * under a profile that wrote "React" and "TypeScript".
 */
function matchedValues(mine: Set<string>, theirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of theirs) {
    const key = value.toLowerCase().trim();
    if (!key || seen.has(key) || !mine.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
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

export async function GET(request: Request) {
  try {
    const session = await getAuthSession();
    const meId = session?.user ? await resolveSessionUserId(session) : null;
    if (!meId) return NextResponse.json({ people: [], total: 0 }, { headers: { 'Cache-Control': 'no-store' } });

    /* Scope is part of the key: the trimmed row and the full recommended set
       are different payloads for the same viewer. */
    const scope = new URL(request.url).searchParams.get('scope') === 'recommended' ? 'recommended' : 'row';
    const cacheKey = `${meId}:${scope}`;

    const hit = cache.get(cacheKey);
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
      /* Kept as the matched VALUES, not just counts — the card names them. */
      const interestValues = matchedValues(myInterests, (Array.isArray(p.interests) ? p.interests : []).map((s) => String(s)));
      const skillValues = matchedValues(mySkills, skills);
      const domainValues = matchedValues(myDomain, Array.from(tokens(p.headline)));

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

      /* The reasons, ranked by what each one actually contributed to the score
         above — the same weights, so the headline reason on the card is always
         the thing that most put this person in the row. A signal that scored
         nothing produces no reason at all. */
      const reasons: PersonReason[] = ([
        { r: { kind: 'mutual', count: mutualIds.length } as PersonReason, w: mutualIds.length * config.people.mutualWeight },
        { r: { kind: 'interests', values: interestValues } as PersonReason, w: sharedInterests * config.people.interestWeight },
        { r: { kind: 'skills', values: skillValues } as PersonReason, w: sharedSkills * config.people.skillWeight },
        { r: { kind: 'domain', values: domainValues } as PersonReason, w: sharedDomain * config.people.domainWeight },
        { r: { kind: 'location', value: (typeof p.location === 'string' && p.location.trim()) || '' } as PersonReason, w: sameLocation * config.people.locationWeight },
      ] as const)
        .filter((e) => e.w > 0)
        .slice()
        .sort((a, b) => b.w - a.w)
        .map((e) => e.r);

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
          /* Score 0 means nothing matched. Saying so is the honest card; the
             alternative is a reason the ranking never used. */
          reasons: reasons.length > 0 ? reasons : [{ kind: 'discovery' }],
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
       fill is deliberately excluded: those are not matches, just people.

       ?scope=recommended returns that whole matched set instead of the row's
       worth (and never the discovery fill), so /people?recommended=1 shows
       exactly the people the headline counted. */
    const payload = scope === 'recommended'
      ? { people: scored.map((s) => s.rec), total: scored.length }
      : { people, total: scored.length };

    cache.set(cacheKey, { payload, ts: Date.now() });
    /* Same seed the jobs route writes — see lib/server/recommendation-cache.ts. */
    rememberViewerCount(meId, 'people', payload.total);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[recommendations/people] GET error', error);
    return NextResponse.json({ people: [], total: 0 }, { status: 200 });
  }
}
