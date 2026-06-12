import { runPublicSearch, type PublicSearchResult } from '@/lib/public-search';
import { getHistoryEntries } from '@/lib/server/history';
import { getCustomTemplatesFromRepository } from '@/lib/server/repositories';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { listKnowledgeBaseEntries } from '@/lib/server/knowledge-base';
import { searchWebSources } from '@/lib/server/web-sources';
import { getStoredUsers } from '@/lib/server/users';
import { getAllServices } from '@/lib/server/services';
import type { Service } from '@/lib/server/services';
import { getAllProfiles } from '@/lib/server/user-profiles';

export type GlobalSearchResult = PublicSearchResult & {
  scope?: 'public' | 'workspace';
  source?: 'public' | 'history' | 'templates' | 'transfers' | 'knowledge' | 'web_sources';
  relevance?: number; // 0-100 normalised score shown in UI
};

type SearchUser = {
  id: string;
  email?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

type GlobalSearchFilters = {
  scopes?: Array<'public' | 'workspace'>;
  sources?: Array<NonNullable<GlobalSearchResult['source']>>;
  types?: Array<PublicSearchResult['type']>;
  badges?: string[];
};

// ─── Module-level data cache (30s TTL) ───────────────────────────────────────
// Avoids re-reading large JSON files on every search request.
const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000;

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as T;
  const data = await fetcher();
  _cache.set(key, { data, ts: Date.now() });
  return data;
}

function normalize(value?: string) {
  return (value || '').trim().toLowerCase();
}

function tokenize(query: string): string[] {
  return normalize(query).split(/[\s\-_,./]+/).map((t) => t.trim()).filter((t) => t.length > 0).slice(0, 10);
}

// Bigram similarity: 0.0 – 1.0
function bigramSim(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(a); const bb = bigrams(b);
  let hits = 0;
  ba.forEach((g) => { if (bb.has(g)) hits++; });
  return (2 * hits) / (ba.size + bb.size);
}

// Weighted multi-field scorer — returns raw score (normalised later)
// Fields are { text, weight } where weight 3=title, 2=description/tags, 1=body
function scoreFields(fields: Array<{ text: string; weight: number }>, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const tokens = tokenize(q);
  let total = 0;

  for (const { text, weight } of fields) {
    const t = normalize(text);
    if (!t) continue;

    // Full phrase exact match (highest signal)
    if (t === q) { total += 40 * weight; continue; }
    if (t.startsWith(q + ' ') || t.startsWith(q)) total += 22 * weight;
    else if (t.includes(q)) total += 16 * weight;

    // Per-token scoring
    const words = t.split(/\s+/);
    for (const token of tokens) {
      if (token.length < 2) continue;
      // Word-boundary exact match
      if (words.includes(token)) {
        total += (token.length >= 5 ? 12 : 8) * weight;
      } else if (t.includes(token)) {
        // Substring match (prefix on a word)
        total += (token.length >= 4 ? 6 : 4) * weight;
      } else if (token.length >= 4) {
        // Fuzzy: bigram similarity against every word
        const best = words.reduce((acc, w) => Math.max(acc, bigramSim(token, w)), 0);
        if (best >= 0.55) total += Math.round(best * 5) * weight;
      }
    }
  }
  return total;
}

// Legacy single-haystack convenience (for callers that haven't been upgraded)
function scoreMatch(haystack: string, query: string): number {
  return scoreFields([{ text: haystack, weight: 1 }], query);
}

function recencyBoost(iso?: string): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 0;
  const days = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 1) return 10;
  if (days <= 3) return 7;
  if (days <= 7) return 5;
  if (days <= 30) return 2;
  return 0;
}

// Normalise raw scores across a batch to 0-100
function normaliseScores<T extends { score: number }>(items: T[]): T[] {
  if (!items.length) return items;
  const max = Math.max(...items.map((i) => i.score));
  if (max <= 0) return items;
  return items.map((i) => ({ ...i, score: Math.round((i.score / max) * 100) }));
}

function canSeeWorkspaceWide(user?: SearchUser | null) {
  if (!user) return false;
  return Boolean(user.permissions?.includes('all') || user.role === 'admin' || user.role === 'super_admin');
}

function dedupe(results: GlobalSearchResult[]) {
  const seen = new Set<string>();
  const output: GlobalSearchResult[] = [];
  for (const item of results) {
    const key = `${item.href}|${item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function sanitizeCsv(value?: string | null) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSource(value: string): NonNullable<GlobalSearchResult['source']> | null {
  const token = normalize(value).replace(/[\s_-]+/g, '');
  if (token === 'public') return 'public';
  if (token === 'history' || token === 'docs' || token === 'documents') return 'history';
  if (token === 'templates' || token === 'template') return 'templates';
  if (token === 'transfers' || token === 'filetransfers' || token === 'filetransfer') return 'transfers';
  if (token === 'knowledge' || token === 'kb' || token === 'knowledgebase') return 'knowledge';
  if (token === 'web' || token === 'websources' || token === 'sources') return 'web_sources';
  if (token === 'workspace') {
    // Workspace is an alias; handled via scope filter, not source.
    return null;
  }
  return null;
}

function normalizeScope(value: string): 'public' | 'workspace' | null {
  const token = normalize(value).replace(/[\s_-]+/g, '');
  if (token === 'public') return 'public';
  if (token === 'workspace') return 'workspace';
  return null;
}

function normalizeType(value: string): PublicSearchResult['type'] | null {
  const token = normalize(value).replace(/[\s_-]+/g, '');
  if (token === 'feature') return 'feature';
  if (token === 'page' || token === 'pages') return 'page';
  if (token === 'file' || token === 'files') return 'file';
  if (token === 'article' || token === 'blog' || token === 'post') return 'article';
  return null;
}

function normalizeBadge(value: string) {
  const token = normalize(value).replace(/[\s_-]+/g, '');
  if (!token) return null;
  if (token === 'gig' || token === 'gigs') return 'GIG';
  if (token === 'resume' || token === 'resumes' || token === 'talent') return 'RESUME';
  if (token === 'blog') return 'BLOG';
  if (token === 'kb' || token === 'knowledge') return 'KB';
  if (token === 'person' || token === 'people') return 'PERSON';
  if (token === 'svc' || token === 'service' || token === 'services') return 'SVC';
  return value.trim().toUpperCase();
}

function parseQueryOperators(rawQuery: string) {
  const tokens = rawQuery.trim().split(/\s+/).filter(Boolean);
  const filters: GlobalSearchFilters = {};
  const kept: string[] = [];

  for (const token of tokens) {
    const match = token.match(/^([a-zA-Z_]+):(.*)$/);
    if (!match) {
      kept.push(token);
      continue;
    }

    const key = normalize(match[1]);
    const value = match[2] || '';
    if (!value) continue;

    if (key === 'in' || key === 'source' || key === 'from') {
      const sources = sanitizeCsv(value).map(normalizeSource).filter(Boolean) as Array<NonNullable<GlobalSearchResult['source']>>;
      if (sources.length) {
        filters.sources = Array.from(new Set([...(filters.sources || []), ...sources]));
        continue;
      }
      const scope = normalizeScope(value);
      if (scope) {
        filters.scopes = Array.from(new Set([...(filters.scopes || []), scope]));
        continue;
      }
    }

    if (key === 'scope') {
      const scope = normalizeScope(value);
      if (scope) {
        filters.scopes = Array.from(new Set([...(filters.scopes || []), scope]));
        continue;
      }
    }

    if (key === 'type') {
      const types = sanitizeCsv(value).map(normalizeType).filter(Boolean) as Array<PublicSearchResult['type']>;
      if (types.length) {
        filters.types = Array.from(new Set([...(filters.types || []), ...types]));
        continue;
      }
    }

    if (key === 'badge') {
      const badges = sanitizeCsv(value).map(normalizeBadge).filter(Boolean) as string[];
      if (badges.length) {
        filters.badges = Array.from(new Set([...(filters.badges || []), ...badges]));
        continue;
      }
    }

    // Unknown operator: keep it as part of the search text.
    kept.push(token);
  }

  return { query: kept.join(' ').trim(), filters };
}

function mergeFilters(left?: GlobalSearchFilters, right?: GlobalSearchFilters): GlobalSearchFilters | undefined {
  if (!left && !right) return undefined;
  const merged: GlobalSearchFilters = {};
  const scopes = [...(left?.scopes || []), ...(right?.scopes || [])];
  const sources = [...(left?.sources || []), ...(right?.sources || [])];
  const types = [...(left?.types || []), ...(right?.types || [])];
  const badges = [...(left?.badges || []), ...(right?.badges || [])];
  if (scopes.length) merged.scopes = Array.from(new Set(scopes));
  if (sources.length) merged.sources = Array.from(new Set(sources));
  if (types.length) merged.types = Array.from(new Set(types));
  if (badges.length) merged.badges = Array.from(new Set(badges));
  return merged;
}

function matchesFilters(entry: GlobalSearchResult, filters?: GlobalSearchFilters) {
  if (!filters) return true;
  if (filters.scopes?.length && (!entry.scope || !filters.scopes.includes(entry.scope))) return false;
  if (filters.sources?.length && (!entry.source || !filters.sources.includes(entry.source))) return false;
  if (filters.types?.length && !filters.types.includes(entry.type)) return false;
  if (filters.badges?.length && (!entry.badge || !filters.badges.includes(entry.badge))) return false;
  return true;
}

export async function runGlobalSearch(params: {
  query: string;
  user?: SearchUser | null;
  limit?: number;
  filters?: GlobalSearchFilters;
}) {
  const { query: operatorStrippedQuery, filters: operatorFilters } = parseQueryOperators(params.query);
  const query = operatorStrippedQuery.trim();
  const limit = Math.min(30, Math.max(6, params.limit ?? 16));
  if (!query) return [];
  const filters = mergeFilters(operatorFilters, params.filters);

  const publicResults = await cached(`public-${query}`, () => runPublicSearch(query));
  const user = params.user;
  if (!user) {
    const filtered = publicResults
      .map((entry) => ({ ...entry, scope: 'public' as const, source: 'public' as const } satisfies GlobalSearchResult))
      .filter((entry) => matchesFilters(entry, filters));
    return filtered.slice(0, limit);
  }

  const workspaceWide = canSeeWorkspaceWide(user);

  const [history, templates, transfers, kb, webSources, users, servicesStore, allProfiles] = await Promise.all([
    cached('history', getHistoryEntries),
    cached('templates', getCustomTemplatesFromRepository),
    cached('transfers', getFileTransfers),
    listKnowledgeBaseEntries({ q: query, limit: 4, offset: 0 }).catch(() => ({ entries: [], total: 0, categories: [] })),
    searchWebSources({ ownerUserId: user.id, query, limit: 6 }).catch(() => []),
    cached('users', getStoredUsers),
    cached('services', getAllServices),
    cached('profiles', getAllProfiles).catch(() => ({} as Record<string, unknown>)),
  ]);

  const historyMatches: Array<{ entry: GlobalSearchResult; score: number }> = history
    .filter((entry) => {
      if (workspaceWide) return true;
      const byEmail = normalize(entry.generatedBy) === normalize(user.email || '');
      return byEmail;
    })
    .map((entry) => {
      const title = entry.editorState?.title || entry.templateName || 'Untitled document';
      const descriptionBits = [
        entry.referenceNumber ? `Ref ${entry.referenceNumber}` : '',
        entry.category || '',
        entry.clientName || entry.employeeName || '',
      ].filter(Boolean);
      const description = descriptionBits.join(' · ') || 'Workspace document';

      const score = scoreFields([
        { text: title, weight: 3 },
        { text: entry.templateName ?? '', weight: 2 },
        { text: entry.referenceNumber ?? '', weight: 2 },
        { text: entry.category ?? '', weight: 1.5 },
        { text: [entry.clientName, entry.clientEmail, entry.employeeName, entry.employeeEmail, entry.organizationName].filter(Boolean).join(' '), weight: 2 },
        { text: entry.editorState?.internalSummary ?? '', weight: 1 },
        { text: (entry.editorState?.tags ?? []).join(' '), weight: 1.5 },
        { text: [entry.uploadedPdfFileName, entry.signedPdfFileName].filter(Boolean).join(' '), weight: 1 },
      ], query) + recencyBoost(entry.generatedAt) + (entry.signatureSignedAt ? 1 : 0);
      return {
        entry: {
          id: `history-${entry.id}`,
          title,
          description,
          href: `/workspace?historyId=${encodeURIComponent(entry.id)}`,
          type: 'page',
          category: 'Workspace',
          badge: entry.signatureSignedAt ? 'SIGNED' : 'DOC',
          scope: 'workspace',
          source: 'history',
        } satisfies GlobalSearchResult,
        score,
      };
    })
    .filter((row) => row.score > 0)
    .slice(0, 8);

  const templateMatches: Array<{ entry: GlobalSearchResult; score: number }> = templates
    .filter((tpl) => {
      if (workspaceWide) return true;
      if (tpl.createdBy && normalize(tpl.createdBy) !== normalize(user.email || '')) return false;
      return true;
    })
    .map((tpl) => {
      const score = scoreFields([
        { text: tpl.name ?? '', weight: 3 },
        { text: tpl.description ?? '', weight: 2 },
        { text: tpl.category ?? '', weight: 1.5 },
      ], query) + recencyBoost(tpl.updatedAt);
      return {
        entry: {
          id: `template-${tpl.id}`,
          title: tpl.name || 'Template',
          description: tpl.description || `${tpl.category || 'General'} template`,
          href: `/workspace?tab=generate&templateId=${encodeURIComponent(tpl.id)}`,
          type: 'page',
          category: 'Templates',
          badge: 'TPL',
          scope: 'workspace',
          source: 'templates',
        } satisfies GlobalSearchResult,
        score,
      };
    })
    .filter((row) => row.score > 0)
    .slice(0, 6);

  const transferMatches: Array<{ entry: GlobalSearchResult; score: number }> = transfers
    .filter((transfer) => {
      if (transfer.revokedAt) return false;
      if (workspaceWide) return true;
      const byUserId = transfer.uploadedByUserId ? String(transfer.uploadedByUserId) === String(user.id) : false;
      const byEmail = normalize(transfer.uploadedBy) === normalize(user.email || '');
      return byUserId || byEmail;
    })
    .map((transfer) => {
      const title = transfer.title || transfer.fileName || 'File transfer';
      const score = scoreFields([
        { text: title, weight: 3 },
        { text: transfer.fileName ?? '', weight: 2.5 },
        { text: transfer.notes ?? '', weight: 2 },
        { text: [transfer.folderName, transfer.lockerName, transfer.directoryCategory].filter(Boolean).join(' '), weight: 1.5 },
        { text: (transfer.directoryTags ?? []).join(' '), weight: 1.5 },
      ], query) + recencyBoost(transfer.updatedAt || transfer.createdAt);
      return {
        entry: {
          id: `transfer-${transfer.id}`,
          title,
          description: transfer.notes || `${transfer.fileName}${transfer.directoryCategory ? ` · ${transfer.directoryCategory}` : ''}`,
          href: transfer.shareUrl || `/transfer/${encodeURIComponent(transfer.shareId)}`,
          type: 'file',
          category: 'File transfers',
          badge: transfer.directoryVisibility === 'public' ? 'PUBLIC' : 'PRIVATE',
          scope: 'workspace',
          source: 'transfers',
        } satisfies GlobalSearchResult,
        score,
      };
    })
    .filter((row) => row.score > 0)
    .slice(0, 8);

  const kbMatches: Array<{ entry: GlobalSearchResult; score: number }> = (kb.entries || [])
    .map((entry) => {
      const score = scoreFields([
        { text: entry.title, weight: 3 },
        { text: entry.query ?? '', weight: 2.5 },
        { text: entry.summary ?? '', weight: 2 },
        { text: entry.category ?? '', weight: 1.5 },
        { text: (entry.tags ?? []).join(' '), weight: 1.5 },
      ], query) + recencyBoost(entry.updatedAt || entry.createdAt);
      return {
        entry: {
          id: `knowledge-${entry.id}`,
          title: entry.title,
          description: entry.summary || `Knowledge base · ${entry.category}`,
          href: `/knowledge?q=${encodeURIComponent(query)}`,
          type: 'article',
          category: 'Knowledge',
          badge: 'KB',
          scope: 'public',
          source: 'knowledge',
        } satisfies GlobalSearchResult,
        score,
      };
    })
    .filter((row) => row.score > 0)
    .slice(0, 4);

  const webMatches: Array<{ entry: GlobalSearchResult; score: number }> = (webSources || [])
    .map((source) => {
      const score = scoreFields([
        { text: source.title, weight: 3 },
        { text: source.snippet ?? '', weight: 2 },
        { text: source.category ?? '', weight: 1.5 },
        { text: (source.tags ?? []).join(' '), weight: 1.5 },
      ], query);
      return {
        entry: {
          id: `web-${source.url}`,
          title: source.title,
          description: source.snippet || source.url,
          href: source.url,
          type: 'page',
          category: source.category || 'Web sources',
          badge: 'SOURCE',
          scope: 'workspace',
          source: 'web_sources',
        } satisfies GlobalSearchResult,
        score,
      };
    })
    .filter((row) => row.score > 0)
    .slice(0, 6);

  const scoredPublic: Array<{ entry: GlobalSearchResult; score: number }> = publicResults
    .map((entry) => {
      const base = scoreFields([
        { text: entry.title, weight: 3 },
        { text: entry.description ?? '', weight: 2 },
        { text: entry.category ?? '', weight: 1.5 },
        { text: entry.badge ?? '', weight: 1 },
      ], query);
      const boost = entry.type === 'file' ? 2 : entry.badge === 'RESUME' || entry.badge === 'GIG' ? 3 : 0;
      return {
        entry: { ...entry, scope: 'public' as const, source: 'public' as const } satisfies GlobalSearchResult,
        score: base + boost,
      };
    })
    .filter((row) => row.score > 0);

  // People search — enriched with profile data (skills, headline, bio, location, interests)
  const profiles = allProfiles as Record<string, {
    headline?: string; bio?: string; location?: string; skills?: string[];
    interests?: string[]; openToWork?: boolean; docrudGo?: boolean;
    publicFace?: { category: string; approvedAt: string };
    avatarUrl?: string;
  }>;

  const peopleMatches: Array<{ entry: GlobalSearchResult; score: number }> = users
    .filter((u) => u.isActive !== false && !u.pendingDeletion)
    .map((u) => {
      const p = profiles[u.id] ?? {};
      const skills = p.skills ?? [];
      const interests = p.interests ?? [];
      let score = scoreFields([
        { text: u.name ?? '', weight: 3 },
        { text: u.email ?? '', weight: 1 },
        { text: u.organizationName ?? '', weight: 1.5 },
        { text: u.role ?? '', weight: 1 },
        { text: p.headline ?? '', weight: 2.5 },
        { text: p.bio ?? '', weight: 1.5 },
        { text: p.location ?? '', weight: 1 },
        { text: skills.join(' '), weight: 2 },
        { text: interests.join(' '), weight: 1.5 },
      ], query);
      if (score <= 0) return null;
      // Boosts: complete profiles surface higher
      if (p.docrudGo) score += 4;
      if (p.openToWork) score += 2;
      if (p.publicFace) score += 3;
      if (skills.length > 0) score += 1;
      if (p.headline) score += 1;
      return {
        entry: {
          id: `person-${u.id}`,
          title: u.name || u.email || 'Unknown',
          description: p.headline || u.organizationName || u.role || 'Docrud member',
          href: `/u/${u.id}`,
          type: 'page' as const,
          category: p.publicFace?.category || u.role || 'People',
          badge: 'PERSON',
          scope: 'public' as const,
          source: 'public' as const,
          meta: {
            headline: p.headline,
            location: p.location,
            skills: skills.slice(0, 6),
            avatarUrl: p.avatarUrl,
          },
        } satisfies GlobalSearchResult,
        score,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.score > 0)
    .slice(0, 10);

  // Services search — flatten userId-keyed store
  const allServices: Service[] = Object.values(servicesStore).flat();
  const serviceMatches: Array<{ entry: GlobalSearchResult; score: number }> = allServices
    .filter((s) => s.isActive)
    .map((s) => {
      const score = scoreFields([
        { text: s.title, weight: 3 },
        { text: s.tagline ?? '', weight: 2.5 },
        { text: s.description?.slice(0, 200) ?? '', weight: 2 },
        { text: s.category ?? '', weight: 1.5 },
        { text: (s.tags ?? []).join(' '), weight: 1.5 },
      ], query);
      return {
        entry: {
          id: `service-${s.id}`,
          title: s.title,
          description: s.tagline || s.description?.slice(0, 80) || s.category,
          href: `/u/${s.userId}?tab=services`,
          type: 'page' as const,
          category: 'Services',
          badge: 'SVC',
          scope: 'public' as const,
          source: 'public' as const,
        } satisfies GlobalSearchResult,
        score,
      };
    })
    .filter((r) => r.score > 0)
    .slice(0, 6);

  const allCandidates = [
    ...historyMatches,
    ...templateMatches,
    ...transferMatches,
    ...webMatches,
    ...kbMatches,
    ...scoredPublic,
    ...peopleMatches,
    ...serviceMatches,
  ];

  const filteredCandidates = filters
    ? allCandidates.filter((row) => matchesFilters(row.entry, filters))
    : allCandidates;

  const scoreMap = new Map<string, { entry: GlobalSearchResult; score: number }>();
  for (const item of filteredCandidates) {
    const key = `${item.entry.href}|${item.entry.title}`.toLowerCase();
    const existing = scoreMap.get(key);
    if (!existing || item.score > existing.score) {
      scoreMap.set(key, item);
    }
  }

  const sorted = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  const maxScore = sorted.length > 0 ? Math.max(...sorted.map((r) => r.score)) : 1;
  const withRelevance = (entry: GlobalSearchResult, score: number): GlobalSearchResult => ({
    ...entry,
    relevance: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
  });
  let picked = sorted.slice(0, limit).map((row) => withRelevance(row.entry, row.score));

  // Ensure logged-in searches still surface public modules (gigs/talent/blog/public files) when relevant.
  const minPublic = 3;
  const publicPool = sorted.filter((row) => row.entry.scope === 'public').map((row) => withRelevance(row.entry, row.score));
  const currentPublicCount = picked.filter((row) => row.scope === 'public').length;
  if (publicPool.length && currentPublicCount < Math.min(minPublic, publicPool.length)) {
    const needed = Math.min(minPublic, publicPool.length) - currentPublicCount;
    const add = publicPool.filter((row) => !picked.some((p) => p.href === row.href && p.title === row.title)).slice(0, needed);
    if (add.length) {
      const workspaceOnly = picked.filter((row) => row.scope !== 'public');
      picked = [...picked.filter((row) => row.scope === 'public'), ...workspaceOnly].slice(0, limit);
      // Replace the lowest scoring workspace slots with public entries.
      picked = picked.slice(0, Math.max(0, limit - add.length)).concat(add).slice(0, limit);
    }
  }

  return dedupe(picked).slice(0, limit);
}
