/**
 * §26 Save Service — server-side shortlist.
 *
 * Deliberately not localStorage: a shortlist a customer builds before deciding
 * whom to contact has to survive a device change, so it lives in the same
 * Mongo-collection-with-JSON-fallback pattern as `service-leads.ts`.
 *
 * The id is deterministic (`userId__serviceId`), which is what makes saving
 * idempotent — a second save of the same service can never become a second row.
 */
import path from 'path';
import { getMongoDb } from '@/lib/server/database';
import { dataDir, readJsonFile, writeJsonFile } from '@/lib/server/storage';

const COL = 'service_saves';
const serviceSavesPath = path.join(dataDir, 'service-saves.json');

export interface ServiceSave {
  id: string;
  userId: string;
  serviceId: string;
  createdAt: string;
}

function saveId(userId: string, serviceId: string) {
  return `${userId}__${serviceId}`;
}

function normalize(v?: string) {
  return (v || '').trim();
}

/** Idempotent: saving twice returns the original record. */
export async function saveService(userId: string, serviceId: string): Promise<ServiceSave> {
  const uid = normalize(userId);
  const sid = normalize(serviceId);
  if (!uid || !sid) throw new Error('A user and a service are required.');

  const record: ServiceSave = {
    id: saveId(uid, sid),
    userId: uid,
    serviceId: sid,
    createdAt: new Date().toISOString(),
  };

  const db = await getMongoDb();
  if (db) {
    await db.collection(COL).updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: record.id as any },
      { $setOnInsert: { ...record, _id: record.id } },
      { upsert: true },
    );
    const doc = await db.collection<ServiceSave & { _id: string }>(COL).findOne({ _id: record.id });
    if (!doc) return record;
    const { _id: _unused, ...rest } = doc;
    return rest as ServiceSave;
  }

  const all = await readJsonFile<ServiceSave[]>(serviceSavesPath, []);
  const existing = all.find((s) => s.id === record.id);
  if (existing) return existing;
  await writeJsonFile(serviceSavesPath, [record, ...all].slice(0, 20000));
  return record;
}

/** Idempotent: removing something that is not saved is a no-op, not an error. */
export async function unsaveService(userId: string, serviceId: string): Promise<boolean> {
  const id = saveId(normalize(userId), normalize(serviceId));

  const db = await getMongoDb();
  if (db) {
    const res = await db.collection<ServiceSave & { _id: string }>(COL).deleteOne({ _id: id });
    return res.deletedCount > 0;
  }

  const all = await readJsonFile<ServiceSave[]>(serviceSavesPath, []);
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  await writeJsonFile(serviceSavesPath, next);
  return true;
}

export async function isServiceSaved(userId: string, serviceId: string): Promise<boolean> {
  const id = saveId(normalize(userId), normalize(serviceId));
  const db = await getMongoDb();
  if (db) {
    return (await db.collection<ServiceSave & { _id: string }>(COL).countDocuments({ _id: id })) > 0;
  }
  const all = await readJsonFile<ServiceSave[]>(serviceSavesPath, []);
  return all.some((s) => s.id === id);
}

/** Newest first. Always scoped to one user — there is no cross-user read. */
export async function listSavedServices(userId: string, limit = 100): Promise<ServiceSave[]> {
  const uid = normalize(userId);
  if (!uid) return [];

  const db = await getMongoDb();
  if (db) {
    const docs = await db.collection<ServiceSave & { _id: string }>(COL)
      .find({ userId: uid }).sort({ createdAt: -1 }).limit(limit).toArray();
    return docs.map(({ _id: _unused, ...rest }) => rest as ServiceSave);
  }

  const all = await readJsonFile<ServiceSave[]>(serviceSavesPath, []);
  return all
    .filter((s) => s.userId === uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/** Ids only — for marking cards as saved without loading every service. */
export async function listSavedServiceIds(userId: string): Promise<string[]> {
  return (await listSavedServices(userId, 500)).map((s) => s.serviceId);
}
