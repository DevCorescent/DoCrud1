/**
 * One-time, idempotent MongoDB index creation.
 *
 * Run with:  npm run db:indexes
 *
 * WHY A SCRIPT AND NOT A STARTUP HOOK
 * -----------------------------------
 * The app deploys to Vercel, so a startup hook would run on every lambda cold
 * start — a wasted round trip per container for something that only needs to
 * happen when the index set changes. `createIndex` is idempotent, so re-running
 * this script is safe and reports existing indexes as unchanged.
 *
 * WHY THIS SET AND NOT MORE
 * -------------------------
 * Measured against the live database (72 file_transfers, 47 users, 68
 * user_follows): every hot query is currently a COLLSCAN that executes in
 * 0-1 ms server-side. Indexes are NOT the current bottleneck — payload is
 * (a full file_transfers read moves 6.65 MB because avgObjSize is ~95 KB).
 *
 * So this is deliberately a small set. Each entry below matches a query that
 * actually exists in the codebase, is on a hot path, and would degrade to a
 * genuine scan as the collection grows. Indexes cost memory and slow writes,
 * so speculative ones are omitted.
 */
import { MongoClient } from 'mongodb';
import nextEnv from '@next/env';

// Same .env resolution Next.js itself uses — no extra dependency needed.
nextEnv.loadEnvConfig(process.cwd());

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required to create indexes.');
  process.exit(1);
}
const dbName = process.env.MONGODB_DB || 'docrud';

/**
 * Each spec: { collection, keys, options, why }
 * `why` names the exact call site the index serves.
 */
const SPECS = [
  // ── file_transfers ───────────────────────────────────────────────────
  {
    collection: 'file_transfers',
    keys: { shareId: 1 },
    options: { name: 'ft_shareId' },
    why: 'selectFileTransferRowById / selectFileTransferThumbMeta match $or:[{_id},{shareId}]. '
       + 'The _id branch uses the default index; without this the shareId branch scans. '
       + 'Hit by every /transfer/[id], /published/[id] and thumbnail request.',
  },
  {
    collection: 'file_transfers',
    keys: { uploadedByUserId: 1, directoryVisibility: 1, revokedAt: 1 },
    options: { name: 'ft_user_visibility_revoked' },
    why: 'aggregatePublicAnalyticsForUser + selectPublicFileTransferRowsForUser (public profile), '
       + 'and getUserDriveUsedBytes on the {uploadedByUserId, revokedAt} prefix. Equality-only.',
  },
  {
    collection: 'file_transfers',
    keys: { directoryVisibility: 1, authMode: 1, revokedAt: 1, createdAt: -1 },
    options: { name: 'ft_public_feed_createdAt' },
    why: 'selectPublicFileTransfersForFeed: three equality fields then the createdAt sort, '
       + 'so the sort is served by the index instead of an in-memory SORT stage.',
  },
  {
    collection: 'file_transfers',
    keys: { lockerId: 1 },
    options: { name: 'ft_lockerId', sparse: true },
    why: 'selectLeanFileTransferRows({lockerId}) for the public locker page and '
       + 'patchFileTransfersByLockerId. Sparse — most transfers have no locker.',
  },

  // ── users ────────────────────────────────────────────────────────────
  {
    collection: 'users',
    keys: { email: 1 },
    options: { name: 'users_email' },
    why: 'selectUserRowByEmail, reached via getStoredUserByEmail on EVERY authenticated '
       + 'request through the NextAuth jwt callback. Deliberately NOT unique: a unique '
       + 'constraint would add new failure modes to signup/OAuth-link flows, and it buys '
       + 'no lookup speed over this plain index.',
  },

  // ── user_follows ─────────────────────────────────────────────────────
  {
    collection: 'user_follows',
    keys: { targetId: 1 },
    options: { name: 'follows_targetId' },
    why: 'getFollowCounts followers count + getFollowers. Public profile, every view.',
  },
  {
    collection: 'user_follows',
    keys: { followerId: 1, targetId: 1 },
    options: { name: 'follows_follower_target' },
    why: 'isFollowing({followerId,targetId}) and getFollowing({followerId}) on the prefix.',
  },

  // ── profile activity ─────────────────────────────────────────────────
  {
    collection: 'profile_visits',
    keys: { profileOwnerId: 1, visitedAt: -1 },
    options: { name: 'visits_owner_visitedAt' },
    why: 'getProfileActivity() reads one owner\'s visits newest-first; equality '
       + 'then the sort field, so the sort is index-served. The visitor-side '
       + 'dedup needs no index — records use a deterministic _id.',
  },
  {
    collection: 'resume_downloads',
    keys: { resumeOwnerId: 1, downloadedAt: -1 },
    options: { name: 'downloads_owner_downloadedAt' },
    why: 'Same shape for the resume-download half of getProfileActivity().',
  },

  // ── messaging (polled every 5-15 s by the client) ────────────────────
  {
    collection: 'messages',
    keys: { conversationId: 1, sentAt: 1 },
    options: { name: 'messages_conv_sentAt' },
    why: 'getMessages({conversationId}) sorted by sentAt, and the poll query '
       + '{conversationId, sentAt:{$gt}} — equality then range, matching the sort.',
  },
  {
    collection: 'conversations',
    keys: { participants: 1, updatedAt: -1 },
    options: { name: 'conversations_participants_updatedAt' },
    why: 'getConversations({participants: userId}) sorted by updatedAt, polled '
       + 'alongside the message poll. Multikey on the participants array.',
  },
];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

let created = 0;
let existing = 0;
for (const spec of SPECS) {
  const col = db.collection(spec.collection);
  // indexes() throws "ns does not exist" for a collection that has never been
  // written to. createIndex() creates it, so treat that as "no indexes yet".
  const before = new Set(
    await col.indexes().then((list) => list.map((i) => i.name)).catch(() => []),
  );
  try {
    const name = await col.createIndex(spec.keys, spec.options);
    if (before.has(name)) {
      existing += 1;
      console.log(`= ${spec.collection}.${name} (already present)`);
    } else {
      created += 1;
      console.log(`+ ${spec.collection}.${name} ${JSON.stringify(spec.keys)}`);
    }
  } catch (error) {
    // A unique index fails loudly if the data violates it — surface that rather
    // than silently skipping, since it means real duplicates exist.
    console.error(`! ${spec.collection}.${spec.options.name} FAILED: ${error.message}`);
  }
}

console.log(`\n${created} created, ${existing} already present, ${SPECS.length} total.`);
await client.close();
