import crypto from 'node:crypto';
import { getDbPool } from '@/lib/server/database';
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

export type CreateKnowledgeBaseEntryInput = Omit<
  KnowledgeBaseEntry,
  'id' | 'createdAt' | 'updatedAt'
>;

function mapRow(row: any): KnowledgeBaseEntry {
  return {
    id: row.id,
    title: row.title,
    query: row.query,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    summary: row.summary,
    keyPoints: Array.isArray(row.key_points) ? row.key_points : [],
    sentiment: row.sentiment || {},
    sources: Array.isArray(row.sources) ? row.sources : [],
    publishedBy: row.published_by ?? null,
    publishedByUserId: row.published_by_user_id ?? null,
    visibility: row.visibility === 'private' ? 'private' : 'public',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listKnowledgeBaseEntries(params: {
  q?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<KnowledgeBaseListResult> {
  const pool = getDbPool();
  if (!pool) {
    const raw = await readJsonFile<KnowledgeBaseEntry[]>(knowledgeBasePath, []);
    const q = params.q?.trim().toLowerCase() || '';
    const category = params.category?.trim() || '';
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const offset = Math.max(0, params.offset ?? 0);

    const filtered = raw
      .filter((entry) => entry.visibility !== 'private')
      .filter((entry) => (category ? entry.category === category : true))
      .filter((entry) => {
        if (!q) return true;
        const hay = `${entry.title} ${entry.query} ${entry.summary}`.toLowerCase();
        return hay.includes(q);
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

  const q = params.q?.trim() || '';
  const category = params.category?.trim() || '';
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const offset = Math.max(0, params.offset ?? 0);

  const where: string[] = ["visibility = 'public'"];
  const values: any[] = [];

  if (category) {
    values.push(category);
    where.push(`category = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    const idx = values.length;
    where.push(`(title ILIKE $${idx} OR query ILIKE $${idx} OR summary ILIKE $${idx})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM knowledge_base_entries ${whereSql}`,
    values,
  );

  values.push(limit);
  values.push(offset);
  const listResult = await pool.query(
    `
      SELECT
        id,
        title,
        query,
        category,
        tags,
        summary,
        key_points,
        sentiment,
        sources,
        published_by,
        published_by_user_id,
        visibility,
        created_at,
        updated_at
      FROM knowledge_base_entries
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values,
  );

  const categoriesResult = await pool.query<{ category: string; count: string }>(
    `
      SELECT category, COUNT(*)::text AS count
      FROM knowledge_base_entries
      WHERE visibility = 'public'
      GROUP BY category
      ORDER BY COUNT(*) DESC, category ASC
      LIMIT 30
    `,
  );

  return {
    entries: listResult.rows.map(mapRow),
    total: Number(totalResult.rows[0]?.count || 0),
    categories: categoriesResult.rows.map((row) => ({ category: row.category, count: Number(row.count || 0) })),
  };
}

export async function getKnowledgeBaseEntry(id: string): Promise<KnowledgeBaseEntry | null> {
  const pool = getDbPool();
  if (!pool) {
    const raw = await readJsonFile<KnowledgeBaseEntry[]>(knowledgeBasePath, []);
    return raw.find((entry) => entry.id === id) || null;
  }

  const result = await pool.query(
    `
      SELECT
        id,
        title,
        query,
        category,
        tags,
        summary,
        key_points,
        sentiment,
        sources,
        published_by,
        published_by_user_id,
        visibility,
        created_at,
        updated_at
      FROM knowledge_base_entries
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0]);
}

export async function createKnowledgeBaseEntry(input: CreateKnowledgeBaseEntryInput): Promise<KnowledgeBaseEntry> {
  const pool = getDbPool();
  if (!pool) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
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

    const existing = await readJsonFile<KnowledgeBaseEntry[]>(knowledgeBasePath, []);
    await writeJsonFile(knowledgeBasePath, [normalized, ...existing].slice(0, 4000));
    return normalized;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const normalized = {
    ...input,
    title: input.title.trim(),
    query: input.query.trim(),
    category: input.category.trim(),
    tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    keyPoints: (input.keyPoints || []).map((point) => point.trim()).filter(Boolean).slice(0, 12),
    sources: (input.sources || []).slice(0, 10),
    summary: input.summary.trim(),
    visibility: input.visibility === 'private' ? 'private' : 'public',
  } satisfies CreateKnowledgeBaseEntryInput;

  await pool.query(
    `
      INSERT INTO knowledge_base_entries (
        id,
        title,
        query,
        category,
        tags,
        summary,
        key_points,
        sentiment,
        sources,
        published_by,
        published_by_user_id,
        visibility,
        created_at,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14
      )
    `,
    [
      id,
      normalized.title,
      normalized.query,
      normalized.category,
      JSON.stringify(normalized.tags),
      normalized.summary,
      JSON.stringify(normalized.keyPoints),
      JSON.stringify(normalized.sentiment || {}),
      JSON.stringify(normalized.sources),
      normalized.publishedBy || null,
      normalized.publishedByUserId || null,
      normalized.visibility,
      now,
      now,
    ],
  );

  return {
    id,
    title: normalized.title,
    query: normalized.query,
    category: normalized.category,
    tags: normalized.tags,
    summary: normalized.summary,
    keyPoints: normalized.keyPoints,
    sentiment: normalized.sentiment || {},
    sources: normalized.sources,
    publishedBy: normalized.publishedBy ?? null,
    publishedByUserId: normalized.publishedByUserId ?? null,
    visibility: normalized.visibility,
    createdAt: now,
    updatedAt: now,
  };
}
