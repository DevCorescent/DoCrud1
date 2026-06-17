import path from 'path';
import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var __docrudMongoClient: MongoClient | undefined;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

/** Compatibility shim — service files test `if (!getDbPool()) return`. */
export function getDbPool(): Record<string, never> | null {
  return isDatabaseConfigured() ? ({} as Record<string, never>) : null;
}

async function getMongoClient(): Promise<MongoClient | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!global.__docrudMongoClient) {
    global.__docrudMongoClient = new MongoClient(uri);
    await global.__docrudMongoClient.connect();
  }
  return global.__docrudMongoClient;
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

export async function readAppState<T>(key: string): Promise<T | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<{ _id: string; value: T }>('app_state').findOne({ _id: key });
  return doc?.value ?? null;
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
