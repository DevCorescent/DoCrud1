import crypto from 'node:crypto';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { knowledgeBasePath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export type KnowledgeBaseSource = {
  title: string;
  url: string;
  snippet?: string;
  label?: string;
  category?: string;
  tags?: string[];
};

export type KnowledgeBaseEntry = {
  id: string;
  title: string;
  query: string;
  category: string;
  tags: string[];
  summary: string;
  keyPoints: string[];
  sentiment: {
    label?: 'positive' | 'neutral' | 'negative' | 'mixed';
    notes?: string;
  };
  sources: KnowledgeBaseSource[];
  publishedBy?: string | null;
  publishedByUserId?: string | null;
  visibility: 'public' | 'private';
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeBaseListResult = {
  entries: KnowledgeBaseEntry[];
  total: number;
  categories: Array<{ category: string; count: number }>;
};

export type CreateKnowledgeBaseEntryInput = Omit<KnowledgeBaseEntry, 'id' | 'createdAt' | 'updatedAt'>;

type EntryDoc = KnowledgeBaseEntry & { _id: string };
function strip({ _id: _u, ...rest }: EntryDoc): KnowledgeBaseEntry { return rest; }

export async function listKnowledgeBaseEntries(params: {
  q?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<KnowledgeBaseListResult> {
  const q = params.q?.trim() || '';
  const category = params.category?.trim() || '';
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const offset = Math.max(0, params.offset ?? 0);

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const filter: Record<string, unknown> = { visibility: 'public' };
      if (category) filter.category = category;
      if (q) {
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ title: re }, { query: re }, { summary: re }];
      }

      const [total, docs, catAgg] = await Promise.all([
        db.collection('knowledge_base_entries').countDocuments(filter),
        db.collection<EntryDoc>('knowledge_base_entries')
          .find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
        db.collection('knowledge_base_entries').aggregate<{ _id: string; count: number }>([
          { $match: { visibility: 'public' } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 30 },
        ]).toArray(),
      ]);

      return {
        entries: docs.map(strip),
        total,
        categories: catAgg.map((c) => ({ category: c._id, count: c.count })),
      };
    }
  }

  const raw = await readJsonFile<KnowledgeBaseEntry[]>(knowledgeBasePath, []);
  const qLow = q.toLowerCase();
  const filtered = raw
    .filter((entry) => entry.visibility !== 'private')
    .filter((entry) => (category ? entry.category === category : true))
    .filter((entry) => {
      if (!qLow) return true;
      return `${entry.title} ${entry.query} ${entry.summary}`.toLowerCase().includes(qLow);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const cats = filtered.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {});

  return {
    entries: filtered.slice(offset, offset + limit),
    total: filtered.length,
    categories: Object.entries(cats)
      .map(([c, count]) => ({ category: c, count }))
      .sort((l, r) => r.count - l.count),
  };
}

export async function getKnowledgeBaseEntry(id: string): Promise<KnowledgeBaseEntry | null> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<EntryDoc>('knowledge_base_entries').findOne({ _id: id });
      return doc ? strip(doc) : null;
    }
  }
  const raw = await readJsonFile<KnowledgeBaseEntry[]>(knowledgeBasePath, []);
  return raw.find((entry) => entry.id === id) || null;
}

export async function createKnowledgeBaseEntry(input: CreateKnowledgeBaseEntryInput): Promise<KnowledgeBaseEntry> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const normalized: KnowledgeBaseEntry = {
    id,
    title: input.title.trim(),
    query: input.query.trim(),
    category: input.category.trim() || 'General',
    tags: (input.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 20),
    summary: input.summary.trim(),
    keyPoints: (input.keyPoints || []).map((p) => p.trim()).filter(Boolean).slice(0, 12),
    sentiment: input.sentiment || {},
    sources: (input.sources || []).slice(0, 10),
    publishedBy: input.publishedBy ?? null,
    publishedByUserId: input.publishedByUserId ?? null,
    visibility: input.visibility === 'private' ? 'private' : 'public',
    createdAt: now,
    updatedAt: now,
  };

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<EntryDoc>('knowledge_base_entries').insertOne({ ...normalized, _id: id });
      return normalized;
    }
  }

  const existing = await readJsonFile<KnowledgeBaseEntry[]>(knowledgeBasePath, []);
  await writeJsonFile(knowledgeBasePath, [normalized, ...existing].slice(0, 4000));
  return normalized;
}
