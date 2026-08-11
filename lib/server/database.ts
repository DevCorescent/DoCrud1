import path from 'path';
import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var __docrudMongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __docrudMongoConnect: Promise<MongoClient> | undefined;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

/** Compatibility shim — service files test `if (!getDbPool()) return`. */
export function getDbPool(): Record<string, never> | null {
  return isDatabaseConfigured() ? ({} as Record<string, never>) : null;
}

/**
 * Connecting is the single most expensive database operation in this app —
 * measured at 3-5.7 s against the configured cluster (SRV lookup, TLS handshake,
 * server selection). So the connect *promise* is cached, not just the client:
 * concurrent callers during a cold start all await the same handshake instead of
 * finding a client that has not finished connecting.
 *
 * On failure the cached promise is cleared, so a transient network error does
 * not leave a permanently broken client behind (the previous version cached the
 * client before awaiting connect(), which did exactly that).
 */
async function getMongoClient(): Promise<MongoClient | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (global.__docrudMongoClient) return global.__docrudMongoClient;

  if (!global.__docrudMongoConnect) {
    const client = new MongoClient(uri, {
      // Keep a warm connection so routine requests never pay the handshake.
      minPoolSize: 1,
    });
    global.__docrudMongoConnect = client
      .connect()
      .then((connected) => {
        global.__docrudMongoClient = connected;
        return connected;
      })
      .catch((error) => {
        global.__docrudMongoConnect = undefined;
        throw error;
      });
  }
  return global.__docrudMongoConnect;
}

export async function getMongoDb(): Promise<Db | null> {
  const client = await getMongoClient();
  if (!client) return null;
  return client.db(process.env.MONGODB_DB || 'docrud');
}

export async function ensureDatabaseSchema(): Promise<void> {
  // No-op for MongoDB — collections are created lazily.
}

export function getAppStateKey(filePath: string) {
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return `json:${relativePath}`;
}

/**
 * Coalescing reader for `app_state`.
 *
 * Several independent code paths often read different app_state documents in
 * the same moment — /api/notifications, for example, reads the internal-mailbox
 * document and the deal-rooms document from two builders running inside one
 * Promise.all. Each was a separate findOne, and on this cluster a round trip
 * costs far more than the query itself.
 *
 * Reads issued while a batch window is open are gathered and served by ONE
 * `$in` query. This is NOT a cache: nothing is retained after the batch
 * resolves, every caller still gets its own document (or null when missing),
 * and a read issued after a write completes lands in a later batch.
 */
interface AppStateWaiter {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

let appStateBatch: Map<string, AppStateWaiter[]> | null = null;

async function flushAppStateBatch(): Promise<void> {
  const batch = appStateBatch;
  appStateBatch = null;
  if (!batch || batch.size === 0) return;

  const keys = Array.from(batch.keys());
  try {
    const db = await getMongoDb();
    if (!db) {
      Array.from(batch.values()).forEach((waiters: AppStateWaiter[]) => {
        waiters.forEach((w) => w.resolve(null));
      });
      return;
    }

    const col = db.collection<{ _id: string; value: unknown }>('app_state');
    // A single key stays a findOne so the common path is unchanged.
    const docs = keys.length === 1
      ? [await col.findOne({ _id: keys[0] })].filter((d): d is { _id: string; value: unknown } => Boolean(d))
      : await col.find({ _id: { $in: keys } }).toArray();

    const byId = new Map(docs.map((doc) => [String(doc._id), doc.value]));
    Array.from(batch.entries()).forEach(([key, waiters]: [string, AppStateWaiter[]]) => {
      const value = byId.has(key) ? byId.get(key) : null;
      waiters.forEach((w) => w.resolve(value ?? null));
    });
  } catch (error) {
    Array.from(batch.values()).forEach((waiters: AppStateWaiter[]) => {
      waiters.forEach((w) => w.reject(error));
    });
  }
}

export function readAppState<T>(key: string): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    if (!appStateBatch) {
      appStateBatch = new Map();
      // One event-loop turn is negligible next to a database round trip, and it
      // is a wide enough window to catch reads issued by sibling async builders.
      setTimeout(() => { void flushAppStateBatch(); }, 0);
    }
    const waiters = appStateBatch.get(key) ?? [];
    waiters.push({ resolve: resolve as (value: unknown) => void, reject });
    appStateBatch.set(key, waiters);
  });
}

export async function writeAppState<T>(key: string, value: T): Promise<void> {
  const db = await getMongoDb();
  if (!db) throw new Error('Database is not configured');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.collection('app_state') as any).replaceOne(
    { _id: key },
    { _id: key, value, updatedAt: new Date().toISOString() },
    { upsert: true },
  );
}
