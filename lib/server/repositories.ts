import { ContactRequest, DocumentHistory, DocumentTemplate, BusinessSettings, SaasPlan } from '@/types/document';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import {
  businessSettingsPath,
  contactRequestsPath,
  customTemplatesPath,
  dropdownOptionsPath,
  historyFilePath,
  readJsonFile,
  saasPlansPath,
  usersPath,
  writeJsonFile,
} from '@/lib/server/storage';
import { bulkReplaceHistoryRows, selectAllHistoryRows } from '@/lib/server/db/history-rows';

type StoredUserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  organizationId?: string;
  passwordHash?: string;
  passwordSalt?: string;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string;
};

type DropdownOptionMap = Record<string, string[]>;

export async function getStoredUsersFromRepository<T extends StoredUserRecord>(fallback: T[]): Promise<T[]> {
  if (!getDbPool()) {
    return readJsonFile<T[]>(usersPath, fallback);
  }

  const db = await getMongoDb();
  if (!db) return fallback;
  const docs = await db.collection<T & { _id: string }>('users')
    .find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  if (docs.length === 0) return fallback;
  return docs.map(({ _id: _unused, ...rest }) => rest as unknown as T);
}

export async function saveStoredUsersToRepository<T extends StoredUserRecord>(users: T[]) {
  if (!getDbPool()) {
    await writeJsonFile(usersPath, users);
    return;
  }

  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection('users');
  await col.deleteMany({});
  if (users.length > 0) {
    await (col as any).bulkWrite(
      users.map((user) => ({
        replaceOne: {
          filter: { _id: user.id },
          replacement: { ...user, _id: user.id, email: String(user.email).toLowerCase() },
          upsert: true,
        },
      })),
    );
  }
}

export async function getBusinessSettingsFromRepository(): Promise<BusinessSettings[]> {
  if (!getDbPool()) {
    return readJsonFile<BusinessSettings[]>(businessSettingsPath, []);
  }

  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<BusinessSettings & { _id: string }>('organizations')
    .find({}).sort({ updatedAt: -1, _id: 1 }).toArray();
  return docs.map(({ _id: _unused, ...rest }) => rest as BusinessSettings);
}

export async function saveBusinessSettingsToRepository(settings: BusinessSettings) {
  if (!getDbPool()) {
    const existing = await readJsonFile<BusinessSettings[]>(businessSettingsPath, []);
    const index = existing.findIndex((entry) => entry.organizationId === settings.organizationId);
    const next = index === -1 ? [...existing, settings] : existing.map((entry, i) => i === index ? settings : entry);
    await writeJsonFile(businessSettingsPath, next);
    return;
  }

  const db = await getMongoDb();
  if (!db) return;
  await db.collection('organizations').replaceOne(
    { _id: settings.organizationId as any },
    { ...settings, _id: settings.organizationId },
    { upsert: true },
  );
}

let _templatesCache: { data: DocumentTemplate[]; expiresAt: number } | null = null;
const TEMPLATES_CACHE_TTL = 60_000;

export function invalidateTemplatesCache(): void {
  _templatesCache = null;
}

export async function getCustomTemplatesFromRepository(): Promise<DocumentTemplate[]> {
  if (_templatesCache && _templatesCache.expiresAt > Date.now()) {
    return _templatesCache.data;
  }
  let data: DocumentTemplate[];
  if (!getDbPool()) {
    data = await readJsonFile<DocumentTemplate[]>(customTemplatesPath, []);
  } else {
    const db = await getMongoDb();
    if (!db) {
      data = await readJsonFile<DocumentTemplate[]>(customTemplatesPath, []);
    } else {
      const docs = await db.collection<DocumentTemplate & { _id: string }>('templates')
        .find({}).sort({ updatedAt: -1, _id: 1 }).toArray();
      data = docs.map(({ _id: _unused, ...rest }) => rest as DocumentTemplate);
    }
  }
  _templatesCache = { data, expiresAt: Date.now() + TEMPLATES_CACHE_TTL };
  return data;
}

export async function saveCustomTemplatesToRepository(templates: DocumentTemplate[]) {
  invalidateTemplatesCache();
  if (!getDbPool()) {
    await writeJsonFile(customTemplatesPath, templates);
    return;
  }

  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection('templates');
  const incomingIds = templates.map((t) => t.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (templates.length > 0) {
    await (col as any).bulkWrite(
      templates.map((t) => ({
        replaceOne: {
          filter: { _id: t.id },
          replacement: { ...t, _id: t.id },
          upsert: true,
        },
      })),
    );
  }
}

export async function getHistoryEntriesFromRepository(): Promise<DocumentHistory[]> {
  if (!getDbPool()) {
    return readJsonFile<DocumentHistory[]>(historyFilePath, []);
  }
  return selectAllHistoryRows();
}

export async function saveHistoryEntriesToRepository(entries: DocumentHistory[]) {
  if (!getDbPool()) {
    await writeJsonFile(historyFilePath, entries);
    return;
  }
  await bulkReplaceHistoryRows(entries);
}

export async function getSaasPlansFromRepository(fallback: SaasPlan[]): Promise<SaasPlan[]> {
  if (!getDbPool()) {
    return readJsonFile<SaasPlan[]>(saasPlansPath, fallback);
  }

  const db = await getMongoDb();
  if (!db) return fallback;
  const docs = await db.collection<SaasPlan & { _id: string }>('saas_plans')
    .find({}).sort({ updatedAt: -1, _id: 1 }).toArray();
  return docs.length > 0 ? docs.map(({ _id: _unused, ...rest }) => rest as SaasPlan) : fallback;
}

export async function saveSaasPlansToRepository(plans: SaasPlan[]) {
  if (!getDbPool()) {
    await writeJsonFile(saasPlansPath, plans);
    return;
  }

  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection('saas_plans');
  const incomingIds = plans.map((p) => p.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (plans.length > 0) {
    await (col as any).bulkWrite(
      plans.map((plan) => ({
        replaceOne: {
          filter: { _id: plan.id },
          replacement: { ...plan, _id: plan.id },
          upsert: true,
        },
      })),
    );
  }
}

export async function getSettingsValueFromRepository<T>(scope: string, key: string, fallback: T): Promise<T> {
  if (!getDbPool()) return fallback;

  const db = await getMongoDb();
  if (!db) return fallback;
  const doc = await db.collection<{ _id: string; value: T }>('settings_store')
    .findOne({ _id: `${scope}:${key}` });
  return doc?.value ?? fallback;
}

export async function saveSettingsValueToRepository<T>(scope: string, key: string, value: T) {
  if (!getDbPool()) return;

  const db = await getMongoDb();
  if (!db) return;
  await db.collection('settings_store').replaceOne(
    { _id: `${scope}:${key}` as any },
    { _id: `${scope}:${key}`, scope, key, value, updatedAt: new Date().toISOString() },
    { upsert: true },
  );
}

export async function getDropdownOptionsFromRepository(): Promise<DropdownOptionMap> {
  if (!getDbPool()) {
    return readJsonFile<DropdownOptionMap>(dropdownOptionsPath, {});
  }

  const db = await getMongoDb();
  if (!db) return {};
  const docs = await db.collection<{ _id: string; options: string[] }>('dropdown_options')
    .find({}).toArray();
  return Object.fromEntries(docs.map((d) => [d._id, d.options]));
}

export async function saveDropdownOptionsToRepository(options: DropdownOptionMap) {
  if (!getDbPool()) {
    await writeJsonFile(dropdownOptionsPath, options);
    return;
  }

  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection('dropdown_options');
  await col.deleteMany({});
  const entries = Object.entries(options);
  if (entries.length > 0) {
    await (col as any).bulkWrite(
      entries.map(([fieldKey, values]) => ({
        replaceOne: {
          filter: { _id: fieldKey },
          replacement: { _id: fieldKey, options: values, updatedAt: new Date().toISOString() },
          upsert: true,
        },
      })),
    );
  }
}

export async function getContactRequestsFromRepository(): Promise<ContactRequest[]> {
  if (!getDbPool()) {
    return readJsonFile<ContactRequest[]>(contactRequestsPath, []);
  }

  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<ContactRequest & { _id: string }>('contact_requests')
    .find({}).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(({ _id: _unused, ...rest }) => rest as ContactRequest);
}

export async function addContactRequestToRepository(request: ContactRequest) {
  if (!getDbPool()) {
    const existing = await readJsonFile<ContactRequest[]>(contactRequestsPath, []);
    await writeJsonFile(contactRequestsPath, [request, ...existing]);
    return;
  }

  const db = await getMongoDb();
  if (!db) return;
  await db.collection('contact_requests').replaceOne(
    { _id: request.id as any },
    { ...request, _id: request.id },
    { upsert: true },
  );
}
