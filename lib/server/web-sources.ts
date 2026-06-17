import crypto from 'node:crypto';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { readJsonFile, webSourcesPath, writeJsonFile } from '@/lib/server/storage';

export type WebSource = {
  id: string;
  url: string;
  title?: string;
  label?: string;
  category?: string;
  tags: string[];
  notes?: string;
  contentText: string;
  ownerUserId: string;
  visibility: 'private' | 'public';
  fetchedAt: string;
  updatedAt: string;
};

export type WebSourceListItem = Pick<
  WebSource,
  'id' | 'url' | 'title' | 'label' | 'category' | 'tags' | 'notes' | 'fetchedAt' | 'updatedAt'
>;

export type WebSourcesMeta = {
  categories: Array<{ category: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
};

function stripHtmlToText(html: string, mode: 'full' | 'compact') {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const text = withoutScripts
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (mode === 'compact') {
    return text.split('\n').slice(0, 120).join('\n').slice(0, 10_000).trim();
  }
  return text;
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return '';
  return match[1].replace(/\s+/g, ' ').trim().slice(0, 140);
}

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

type SourceDoc = WebSource & { _id: string };
function strip({ _id: _u, ...rest }: SourceDoc): WebSource { return rest; }

export async function ingestWebSources(params: {
  urls: string[];
  ownerUserId: string;
  maxPages?: number;
  extractMode?: 'full' | 'compact';
  label?: string;
  category?: string;
  tags?: string[];
  notes?: string;
}) {
  const extractMode: 'full' | 'compact' = params.extractMode === 'compact' ? 'compact' : 'full';
  const maxPages = Math.min(8, Math.max(1, params.maxPages ?? 4));
  const urls = params.urls.map(normalizeUrl).filter(Boolean).slice(0, maxPages);
  if (!urls.length) return { ingested: 0, sources: [] as WebSource[] };

  const sources: WebSource[] = [];
  const details: Array<{ url: string; ok: boolean; reason?: string }> = [];
  const useFileStore = !getDbPool();
  const fileStore = useFileStore ? await readJsonFile<WebSource[]>(webSourcesPath, []) : [];
  const db = useFileStore ? null : await getMongoDb();

  const normalizedTags = (params.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 20);
  const normalizedLabel = (params.label || '').trim().slice(0, 64) || undefined;
  const normalizedCategory = (params.category || '').trim().slice(0, 48) || undefined;
  const normalizedNotes = (params.notes || '').trim().slice(0, 400) || undefined;

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'docrud/1.0 (Web Sources)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!response.ok) {
        details.push({ url, ok: false, reason: `Fetch failed (${response.status})` });
        continue;
      }
      const html = await response.text();
      const title = extractTitle(html);
      const contentText = stripHtmlToText(html, extractMode).slice(0, 24_000);
      if (!contentText) {
        details.push({ url, ok: false, reason: 'No readable text extracted' });
        continue;
      }

      const now = new Date().toISOString();

      if (useFileStore) {
        const existingIndex = fileStore.findIndex((item) => item.url === url && item.ownerUserId === params.ownerUserId);
        const record: WebSource = {
          id: existingIndex >= 0 ? fileStore[existingIndex]!.id : crypto.randomUUID(),
          url,
          title: title || undefined,
          label: normalizedLabel ?? fileStore[existingIndex]?.label,
          category: normalizedCategory ?? fileStore[existingIndex]?.category,
          tags: normalizedTags.length ? normalizedTags : (fileStore[existingIndex]?.tags || []),
          notes: normalizedNotes ?? fileStore[existingIndex]?.notes,
          contentText,
          ownerUserId: params.ownerUserId,
          visibility: 'private',
          fetchedAt: existingIndex >= 0 ? fileStore[existingIndex]!.fetchedAt : now,
          updatedAt: now,
        };
        if (existingIndex >= 0) fileStore[existingIndex] = record;
        else fileStore.unshift(record);
        sources.push(record);
        details.push({ url, ok: true });
      } else if (db) {
        const newId = crypto.randomUUID();
        const setFields: Record<string, unknown> = {
          title: title || undefined,
          contentText,
          ownerUserId: params.ownerUserId,
          visibility: 'private',
          updatedAt: now,
        };
        if (normalizedLabel !== undefined) setFields.label = normalizedLabel;
        if (normalizedCategory !== undefined) setFields.category = normalizedCategory;
        if (normalizedTags.length) setFields.tags = normalizedTags;
        if (normalizedNotes !== undefined) setFields.notes = normalizedNotes;

        const result = await db.collection<SourceDoc>('web_sources').findOneAndUpdate(
          { url, ownerUserId: params.ownerUserId },
          {
            $set: setFields,
            $setOnInsert: { _id: newId, id: newId, url, fetchedAt: now, tags: normalizedTags },
          },
          { upsert: true, returnDocument: 'after' },
        );
        if (result) {
          sources.push(strip(result));
          details.push({ url, ok: true });
        }
      }
    } catch {
      details.push({ url, ok: false, reason: 'Fetch error or timeout' });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (useFileStore) {
    await writeJsonFile(webSourcesPath, fileStore.slice(0, 4000));
  }

  return { ingested: sources.length, sources, details };
}

export async function searchWebSources(params: {
  ownerUserId: string;
  query: string;
  category?: string;
  tags?: string[];
  limit?: number;
}) {
  const q = params.query.trim();
  if (!q) return [];
  const limit = Math.min(12, Math.max(3, params.limit ?? 8));
  const filterCategory = (params.category || '').trim();
  const filterTags = (params.tags || []).map((t) => t.trim()).filter(Boolean);

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const filter: Record<string, unknown> = {
        ownerUserId: params.ownerUserId,
        $or: [{ title: re }, { url: re }, { contentText: re }, { label: re }],
      };
      if (filterCategory) filter.category = filterCategory;
      if (filterTags.length) filter.tags = { $all: filterTags };
      const docs = await db.collection<SourceDoc>('web_sources')
        .find(filter).sort({ updatedAt: -1 }).limit(limit).toArray();
      return docs.map((doc) => ({
        id: doc.id,
        url: doc.url,
        title: doc.title || doc.url,
        snippet: doc.contentText.slice(0, 220),
        tags: doc.tags || [],
        category: doc.category,
        label: doc.label,
        source: 'web_sources' as const,
      }));
    }
  }

  const raw = await readJsonFile<WebSource[]>(webSourcesPath, []);
  const qLow = q.toLowerCase();
  const filterTagsLow = filterTags.map((t) => t.toLowerCase());

  const scored = raw
    .filter((item) => item.ownerUserId === params.ownerUserId)
    .filter((item) => (filterCategory ? item.category === filterCategory : true))
    .filter((item) => (filterTagsLow.length ? filterTagsLow.every((tag) => (item.tags || []).map((t) => t.toLowerCase()).includes(tag)) : true))
    .map((item) => {
      const hay = `${item.title || ''} ${item.url} ${item.contentText}`.toLowerCase();
      if (!hay.includes(qLow) && !qLow.split(/\s+/).some((t) => t && hay.includes(t))) return null;
      let score = 0;
      if ((item.title || '').toLowerCase().includes(qLow)) score += 20;
      if (item.url.toLowerCase().includes(qLow)) score += 10;
      for (const token of qLow.split(/\s+/).filter(Boolean)) {
        if ((item.title || '').toLowerCase().includes(token)) score += 6;
        if (hay.includes(token)) score += 2;
      }
      if ((item.label || '').toLowerCase().includes(qLow)) score += 8;
      if ((item.category || '').toLowerCase().includes(qLow)) score += 4;
      if ((item.tags || []).some((t) => t.toLowerCase().includes(qLow))) score += 6;
      return { item, score };
    })
    .filter(Boolean) as Array<{ item: WebSource; score: number }>;

  return scored
    .sort((a, b) => b.score - a.score || new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime())
    .slice(0, limit)
    .map((row) => ({
      id: row.item.id,
      url: row.item.url,
      title: row.item.title || row.item.url,
      snippet: row.item.contentText.slice(0, 220),
      tags: row.item.tags || [],
      category: row.item.category,
      label: row.item.label,
      source: 'web_sources' as const,
    }));
}

export async function listWebSources(params: {
  ownerUserId: string;
  q?: string;
  category?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<{ sources: WebSourceListItem[]; total: number }> {
  const q = (params.q || '').trim();
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const offset = Math.max(0, params.offset ?? 0);
  const filterCategory = (params.category || '').trim();
  const filterTags = (params.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 20);

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const filter: Record<string, unknown> = { ownerUserId: params.ownerUserId };
      if (filterCategory) filter.category = filterCategory;
      if (filterTags.length) filter.tags = { $all: filterTags };
      if (q) {
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ title: re }, { url: re }, { label: re }, { notes: re }];
      }

      const [total, docs] = await Promise.all([
        db.collection('web_sources').countDocuments(filter),
        db.collection<SourceDoc>('web_sources')
          .find(filter, { projection: { contentText: 0 } })
          .sort({ updatedAt: -1 }).skip(offset).limit(limit).toArray(),
      ]);

      return {
        sources: docs.map((doc) => ({
          id: doc.id,
          url: doc.url,
          title: doc.title,
          label: doc.label,
          category: doc.category,
          tags: doc.tags || [],
          notes: doc.notes,
          fetchedAt: doc.fetchedAt,
          updatedAt: doc.updatedAt,
        })),
        total,
      };
    }
  }

  const raw = await readJsonFile<WebSource[]>(webSourcesPath, []);
  const qLow = q.toLowerCase();
  const filterTagsLow = filterTags.map((t) => t.toLowerCase());
  const filtered = raw
    .filter((item) => item.ownerUserId === params.ownerUserId)
    .filter((item) => (filterCategory ? item.category === filterCategory : true))
    .filter((item) => (filterTagsLow.length ? filterTagsLow.every((tag) => (item.tags || []).map((t) => t.toLowerCase()).includes(tag)) : true))
    .filter((item) => {
      if (!qLow) return true;
      const hay = `${item.title || ''} ${item.url} ${item.label || ''} ${item.category || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(qLow);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    sources: filtered.slice(offset, offset + limit).map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      label: item.label,
      category: item.category,
      tags: item.tags || [],
      notes: item.notes,
      fetchedAt: item.fetchedAt,
      updatedAt: item.updatedAt,
    })),
    total: filtered.length,
  };
}

export async function getWebSourcesMeta(params: { ownerUserId: string }): Promise<WebSourcesMeta> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const [catAgg, tagAgg] = await Promise.all([
        db.collection('web_sources').aggregate<{ _id: string; count: number }>([
          { $match: { ownerUserId: params.ownerUserId, category: { $exists: true, $ne: '' } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 40 },
        ]).toArray(),
        db.collection('web_sources').aggregate<{ _id: string; count: number }>([
          { $match: { ownerUserId: params.ownerUserId } },
          { $unwind: '$tags' },
          { $match: { tags: { $ne: '' } } },
          { $group: { _id: '$tags', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 60 },
        ]).toArray(),
      ]);
      return {
        categories: catAgg.map((c) => ({ category: c._id, count: c.count })),
        tags: tagAgg.map((t) => ({ tag: t._id, count: t.count })),
      };
    }
  }

  const raw = await readJsonFile<WebSource[]>(webSourcesPath, []);
  const owned = raw.filter((item) => item.ownerUserId === params.ownerUserId);

  const categoryCounts = owned.reduce<Record<string, number>>((acc, item) => {
    const category = (item.category || '').trim();
    if (!category) return acc;
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const tagCounts = owned.reduce<Record<string, number>>((acc, item) => {
    for (const tag of item.tags || []) {
      const normalized = String(tag || '').trim();
      if (!normalized) continue;
      acc[normalized] = (acc[normalized] || 0) + 1;
    }
    return acc;
  }, {});

  return {
    categories: Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((l, r) => r.count - l.count || l.category.localeCompare(r.category))
      .slice(0, 40),
    tags: Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((l, r) => r.count - l.count || l.tag.localeCompare(r.tag))
      .slice(0, 60),
  };
}
