/**
 * Profile activity — visits and resume downloads.
 *
 * Two collections, both keyed by a DETERMINISTIC `_id` of
 * `{actor}_{owner}_{yyyy-mm-dd}`. That makes recording idempotent by
 * construction: a re-render loop, a double-click or a browser retry all upsert
 * the same document instead of appending duplicates, and it costs one round
 * trip with no read-before-write.
 *
 * Identity is NEVER stored pre-redacted — the raw actor id is kept so a user who
 * upgrades later can see historical activity. Redaction happens at read time,
 * against the owner's current entitlement.
 */
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { hasInfinity } from '@/lib/server/infinity';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';

const VISITS = 'profile_visits';
const DOWNLOADS = 'resume_downloads';

/** One record per actor→owner per UTC day. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export interface ProfileActivityItem {
  type: 'profile_visit' | 'resume_download';
  createdAt: string;
  anonymous: boolean;
  user: { id: string; name: string; avatarUrl: string | null; href: string } | null;
}

/* ── Write ──────────────────────────────────────────────────────────── */

/**
 * Record a profile visit. Self-visits and anonymous visitors are ignored —
 * anonymous traffic is deliberately not attributed to anyone.
 */
export async function recordProfileVisit(input: {
  profileOwnerId: string;
  visitorUserId: string;
  source?: string;
}): Promise<void> {
  const { profileOwnerId, visitorUserId } = input;
  if (!profileOwnerId || !visitorUserId || profileOwnerId === visitorUserId) return;
  if (!getDbPool()) return;

  const db = await getMongoDb();
  if (!db) return;

  const visitedAt = new Date().toISOString();
  const _id = `${visitorUserId}_${profileOwnerId}_${dayKey(visitedAt)}`;

  // $setOnInsert keeps the FIRST visit time for the day; repeated visits within
  // the window neither duplicate the row nor churn the timestamp.
  await db.collection(VISITS).updateOne(
    { _id: _id as never },
    {
      $setOnInsert: {
        _id,
        profileOwnerId,
        visitorUserId,
        visitedAt,
        source: input.source || 'profile',
      },
    },
    { upsert: true },
  );
}

/**
 * Record a resume download. MUST only be called after the entitlement check has
 * passed — an unauthorized attempt is never recorded as a download.
 */
export async function recordResumeDownload(input: {
  resumeOwnerId: string;
  downloaderUserId: string;
  resumeId?: string;
}): Promise<void> {
  const { resumeOwnerId, downloaderUserId } = input;
  if (!resumeOwnerId || !downloaderUserId || resumeOwnerId === downloaderUserId) return;
  if (!getDbPool()) return;

  const db = await getMongoDb();
  if (!db) return;

  const downloadedAt = new Date().toISOString();
  const _id = `${downloaderUserId}_${resumeOwnerId}_${dayKey(downloadedAt)}`;

  await db.collection(DOWNLOADS).updateOne(
    { _id: _id as never },
    {
      $setOnInsert: {
        _id,
        resumeOwnerId,
        downloaderUserId,
        resumeId: input.resumeId || null,
        downloadedAt,
      },
    },
    { upsert: true },
  );
}

/* ── Read ───────────────────────────────────────────────────────────── */

interface RawRow {
  actorId: string;
  createdAt: string;
  type: ProfileActivityItem['type'];
}

/**
 * Activity for ONE owner, newest first.
 *
 * Identity is resolved only when the owner holds the Docrud Infinity
 * entitlement. Without it every item is returned as `{anonymous:true,
 * user:null}` — no id, no name, no avatar, no href, so the response carries
 * nothing that could reconstruct who the visitor was.
 */
export async function getProfileActivity(
  ownerId: string,
  limit = 30,
): Promise<{ activities: ProfileActivityItem[]; canSeeIdentity: boolean }> {
  if (!ownerId || !getDbPool()) return { activities: [], canSeeIdentity: false };

  const db = await getMongoDb();
  if (!db) return { activities: [], canSeeIdentity: false };

  const capped = Math.min(Math.max(limit, 1), 100);

  // Entitlement and both activity queries are independent — one round of I/O.
  const [canSeeIdentity, visitRows, downloadRows] = await Promise.all([
    hasInfinity(ownerId).catch(() => false),
    db.collection(VISITS)
      .find({ profileOwnerId: ownerId })
      .project({ visitorUserId: 1, visitedAt: 1 })
      .sort({ visitedAt: -1 })
      .limit(capped)
      .toArray(),
    db.collection(DOWNLOADS)
      .find({ resumeOwnerId: ownerId })
      .project({ downloaderUserId: 1, downloadedAt: 1 })
      .sort({ downloadedAt: -1 })
      .limit(capped)
      .toArray(),
  ]);

  const raw: RawRow[] = [
    ...visitRows.map((r) => ({
      actorId: String(r.visitorUserId),
      createdAt: String(r.visitedAt),
      type: 'profile_visit' as const,
    })),
    ...downloadRows.map((r) => ({
      actorId: String(r.downloaderUserId),
      createdAt: String(r.downloadedAt),
      type: 'resume_download' as const,
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, capped);

  if (!canSeeIdentity) {
    return {
      canSeeIdentity: false,
      activities: raw.map((r) => ({
        type: r.type,
        createdAt: r.createdAt,
        anonymous: true,
        user: null,
      })),
    };
  }

  // Batched enrichment — avatars in one projected query, names by indexed _id.
  const actorIds = Array.from(new Set(raw.map((r) => r.actorId)));
  const [avatars, users] = await Promise.all([
    getProfileAvatars(actorIds).catch(() => new Map<string, string | null>()),
    Promise.all(actorIds.map((id) => getStoredUserById(id).catch(() => null))),
  ]);
  const nameById = new Map(actorIds.map((id, i) => [id, users[i]?.name || 'Docrud member']));

  return {
    canSeeIdentity: true,
    activities: raw.map((r) => ({
      type: r.type,
      createdAt: r.createdAt,
      anonymous: false,
      user: {
        id: r.actorId,
        name: nameById.get(r.actorId) || 'Docrud member',
        avatarUrl: avatars.get(r.actorId) ?? null,
        href: `/u/${r.actorId}`,
      },
    })),
  };
}
