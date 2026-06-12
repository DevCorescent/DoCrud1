import crypto from 'node:crypto';
import { getDbPool } from '@/lib/server/database';
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
  // Very lightweight extraction: remove scripts/styles, keep basic text.
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
    // Keep it searchable but lighter for faster scoring.
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
  const pool = getDbPool();
  const useFileStore = !pool;
  const extractMode: 'full' | 'compact' = params.extractMode === 'compact' ? 'compact' : 'full';

  const maxPages = Math.min(8, Math.max(1, params.maxPages ?? 4));
  const urls = params.urls
    .map(normalizeUrl)
    .filter(Boolean)
    .slice(0, maxPages);

  if (!urls.length) {
    return { ingested: 0, sources: [] as WebSource[] };
  }

  const sources: WebSource[] = [];
  const details: Array<{ url: string; ok: boolean; reason?: string }> = [];
  const fileStore = useFileStore
    ? await readJsonFile<WebSource[]>(webSourcesPath, [])
    : [];

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

      const contentHash = crypto.createHash('sha256').update(contentText).digest('hex');
      const id = crypto.randomUUID();

      // Upsert by URL.
      const now = new Date().toISOString();
      if (useFileStore) {
        const existingIndex = fileStore.findIndex((item) => item.url === url && item.ownerUserId === params.ownerUserId);
        const record: WebSource = {
          id: existingIndex >= 0 ? fileStore[existingIndex]!.id : id,
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
      } else {
        const result = await pool!.query(
          `
            INSERT INTO web_sources (id, url, title, label, category, tags, notes, content_text, content_hash, owner_user_id, visibility, fetched_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,'private',NOW(),NOW())
            ON CONFLICT (url)
            DO UPDATE SET
              title = EXCLUDED.title,
              label = COALESCE(EXCLUDED.label, web_sources.label),
              category = COALESCE(EXCLUDED.category, web_sources.category),
              tags = CASE WHEN jsonb_array_length(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE web_sources.tags END,
              notes = COALESCE(EXCLUDED.notes, web_sources.notes),
              content_text = EXCLUDED.content_text,
              content_hash = EXCLUDED.content_hash,
              owner_user_id = EXCLUDED.owner_user_id,
              updated_at = NOW()
            RETURNING id, url, title, label, category, tags, notes, content_text, fetched_at, updated_at
          `,
          [
            id,
            url,
            title || null,
            normalizedLabel || null,
            normalizedCategory || null,
            JSON.stringify(normalizedTags),
            normalizedNotes || null,
            contentText,
            contentHash,
            params.ownerUserId,
          ],
        );
        const row = result.rows[0];
        if (!row) continue;

        sources.push({
          id: String(row.id),
          url: String(row.url),
          title: row.title ? String(row.title) : undefined,
          label: row.label ? String(row.label) : undefined,
          category: row.category ? String(row.category) : undefined,
          tags: Array.isArray(row.tags) ? row.tags : [],
          notes: row.notes ? String(row.notes) : undefined,
          contentText: String(row.content_text || ''),
          ownerUserId: params.ownerUserId,
          visibility: 'private',
          fetchedAt: String(row.fetched_at || now),
          updatedAt: String(row.updated_at || now),
        });
        details.push({ url, ok: true });
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
  const pool = getDbPool();
  if (!pool) {
    const raw = await readJsonFile<WebSource[]>(webSourcesPath, []);
    const q = params.query.trim().toLowerCase();
    if (!q) return [];
    const limit = Math.min(12, Math.max(3, params.limit ?? 8));
    const filterCategory = (params.category || '').trim();
    const filterTags = (params.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);

    const scored = raw
      .filter((item) => item.ownerUserId === params.ownerUserId)
      .filter((item) => (filterCategory ? item.category === filterCategory : true))
      .filter((item) => (filterTags.length ? filterTags.every((tag) => (item.tags || []).map((t) => t.toLowerCase()).includes(tag)) : true))
      .map((item) => {
        const hay = `${item.title || ''} ${item.url} ${item.contentText}`.toLowerCase();
        if (!hay.includes(q) && !q.split(/\s+/).some((t) => t && hay.includes(t))) return null;
        let score = 0;
        if ((item.title || '').toLowerCase().includes(q)) score += 20;
        if (item.url.toLowerCase().includes(q)) score += 10;
        for (const token of q.split(/\s+/).filter(Boolean)) {
          if ((item.title || '').toLowerCase().includes(token)) score += 6;
          if (hay.includes(token)) score += 2;
        }
        if ((item.label || '').toLowerCase().includes(q)) score += 8;
        if ((item.category || '').toLowerCase().includes(q)) score += 4;
        if ((item.tags || []).some((t) => t.toLowerCase().includes(q))) score += 6;
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

  const q = params.query.trim();
  if (!q) return [];
  const limit = Math.min(12, Math.max(3, params.limit ?? 8));
  const filterCategory = (params.category || '').trim();
  const filterTags = (params.tags || []).map((t) => t.trim()).filter(Boolean);

  const like = `%${q}%`;
  const result = await pool.query(
    `
      SELECT id, url, title, label, category, tags, notes, content_text, fetched_at, updated_at
      FROM web_sources
      WHERE owner_user_id = $1
        AND ($4::text IS NULL OR category = $4)
        AND ($5::jsonb IS NULL OR tags @> $5::jsonb)
        AND (title ILIKE $2 OR url ILIKE $2 OR content_text ILIKE $2 OR label ILIKE $2)
      ORDER BY updated_at DESC
      LIMIT $3
    `,
    [
      params.ownerUserId,
      like,
      limit,
      filterCategory || null,
      filterTags.length ? JSON.stringify(filterTags) : null,
    ],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    url: String(row.url),
    title: row.title ? String(row.title) : String(row.url),
    snippet: String(row.content_text || '').slice(0, 220),
    tags: Array.isArray(row.tags) ? row.tags : [],
    category: row.category ? String(row.category) : undefined,
    label: row.label ? String(row.label) : undefined,
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
  const pool = getDbPool();
  const q = (params.q || '').trim();
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const offset = Math.max(0, params.offset ?? 0);
  const filterCategory = (params.category || '').trim();
  const filterTags = (params.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 20);

  if (!pool) {
    const raw = await readJsonFile<WebSource[]>(webSourcesPath, []);
    const owned = raw.filter((item) => item.ownerUserId === params.ownerUserId);
    const filtered = owned
      .filter((item) => (filterCategory ? item.category === filterCategory : true))
      .filter((item) => (
        filterTags.length
          ? filterTags.every((tag) => (item.tags || []).map((t) => t.toLowerCase()).includes(tag.toLowerCase()))
          : true
      ))
      .filter((item) => {
        if (!q) return true;
        const hay = `${item.title || ''} ${item.url} ${item.label || ''} ${item.category || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const page = filtered.slice(offset, offset + limit).map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      label: item.label,
      category: item.category,
      tags: item.tags || [],
      notes: item.notes,
      fetchedAt: item.fetchedAt,
      updatedAt: item.updatedAt,
    }));

    return { sources: page, total: filtered.length };
  }

  const where: string[] = ['owner_user_id = $1'];
  const values: any[] = [params.ownerUserId];

  if (filterCategory) {
    values.push(filterCategory);
    where.push(`category = $${values.length}`);
  }
  if (filterTags.length) {
    values.push(JSON.stringify(filterTags));
    where.push(`tags @> $${values.length}::jsonb`);
  }
  if (q) {
    values.push(`%${q}%`);
    const idx = values.length;
    where.push(`(title ILIKE $${idx} OR url ILIKE $${idx} OR label ILIKE $${idx} OR notes ILIKE $${idx})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM web_sources ${whereSql}`,
    values,
  );

  values.push(limit);
  values.push(offset);
  const listResult = await pool.query(
    `
      SELECT id, url, title, label, category, tags, notes, fetched_at, updated_at
      FROM web_sources
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values,
  );

  return {
    sources: listResult.rows.map((row) => ({
      id: String(row.id),
      url: String(row.url),
      title: row.title ? String(row.title) : undefined,
      label: row.label ? String(row.label) : undefined,
      category: row.category ? String(row.category) : undefined,
      tags: Array.isArray(row.tags) ? row.tags : [],
      notes: row.notes ? String(row.notes) : undefined,
      fetchedAt: String(row.fetched_at || ''),
      updatedAt: String(row.updated_at || ''),
    })),
    total: Number(totalResult.rows[0]?.count || 0),
  };
}

export async function getWebSourcesMeta(params: { ownerUserId: string }): Promise<WebSourcesMeta> {
  const pool = getDbPool();
  if (!pool) {
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

  const [categoriesResult, tagsResult] = await Promise.all([
    pool.query<{ category: string; count: string }>(
      `
        SELECT category, COUNT(*)::text AS count
        FROM web_sources
        WHERE owner_user_id = $1 AND category IS NOT NULL AND category <> ''
        GROUP BY category
        ORDER BY COUNT(*) DESC, category ASC
        LIMIT 40
      `,
      [params.ownerUserId],
    ),
    pool.query<{ tag: string; count: string }>(
      `
        SELECT tag, COUNT(*)::text AS count
        FROM (
          SELECT jsonb_array_elements_text(tags) AS tag
          FROM web_sources
          WHERE owner_user_id = $1
        ) AS tag_list
        WHERE tag <> ''
        GROUP BY tag
        ORDER BY COUNT(*) DESC, tag ASC
        LIMIT 60
      `,
      [params.ownerUserId],
    ),
  ]);

  return {
    categories: categoriesResult.rows.map((row) => ({ category: row.category, count: Number(row.count || 0) })),
    tags: tagsResult.rows.map((row) => ({ tag: row.tag, count: Number(row.count || 0) })),
  };
}
