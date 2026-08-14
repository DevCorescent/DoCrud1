/**
 * Docrud intelligent global search — hybrid ranking over real portal data.
 *
 * Reuses, does not replace:
 *   • runGlobalSearch()  — the existing lexical engine (features, blog, gigs,
 *     resumes, public files, workspace history/templates/transfers/KB, people,
 *     services). Called with the *cleaned* query so a full sentence no longer
 *     drags stopwords through its scorer.
 *   • The existing stores for people, services, business pages and hiring jobs.
 *   • lib/server/ai.ts (Groq) for optional query expansion only.
 *
 * Adds: query understanding, concept expansion, business pages + published
 * jobs as first-class results, a weighted hybrid score, entity grouping,
 * match explanations, and a relaxed "related results" pass when nothing
 * matches strictly.
 *
 * Contains no realtime/socket code and imports none.
 */

import { runGlobalSearch, type GlobalSearchResult } from '@/lib/server/global-search';
import { getStoredUsers } from '@/lib/server/users';
import { getAllProfiles } from '@/lib/server/user-profiles';
import { getAllServices, type Service } from '@/lib/server/services';
import { listBusinessPages, listJobsForPages, listProductsForPages, listEventsForPages } from '@/lib/server/business-pages';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import {
  understandQuery, buildLocationVocabulary, searchVocabulary, bigramSimilarity, matchLocation,
  type QueryUnderstanding, type SearchEntityType, type LocationTier,
} from '@/lib/server/search-intelligence';

export interface SearchResultItem {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle: string;
  description: string;
  image: string | null;
  location: string | null;
  score: number;              // 0–100, relative to the best result in this response
  /** How well this result matches THIS query, on an absolute 0–100 scale. */
  matchPercent: number;
  matchedFields: string[];
  /** Short, plain-language reason. Never AI-generated prose. */
  why: string;
  url: string;
  badge?: string;
  meta?: Record<string, unknown>;
}

export interface IntelligentSearchResponse {
  query: string;
  understanding: {
    intent: QueryUnderstanding['intent'];
    entityTypes: SearchEntityType[];
    roles: string[];
    skills: string[];
    domains: string[];
    locations: string[];
    experience: QueryUnderstanding['experience'];
    expandedTerms: string[];
    source: QueryUnderstanding['source'];
  };
  results: SearchResultItem[];
  groups: Record<string, SearchResultItem[]>;
  /** True when strict matching found nothing and constraints were relaxed. */
  relaxed: boolean;
  total: number;
  tookMs: number;
  degraded: string[];         // non-fatal failures (a store or the LLM was down)
}

/* ── Corpus cache — the stores are files/collections, not per-request data ── */
const corpusCache = new Map<string, { data: unknown; ts: number }>();
const CORPUS_TTL = 30_000;

async function cached<T>(key: string, fetcher: () => Promise<T>, fallback: T, degraded: string[]): Promise<T> {
  const hit = corpusCache.get(key);
  if (hit && Date.now() - hit.ts < CORPUS_TTL) return hit.data as T;
  try {
    const data = await fetcher();
    corpusCache.set(key, { data, ts: Date.now() });
    return data;
  } catch {
    // One store being unavailable must not fail the whole search.
    degraded.push(key);
    return fallback;
  }
}

const norm = (v?: string | null) => (v ?? '').toLowerCase();

/* ── Lexical scoring ───────────────────────────────────────────────────────
   Weighted fields, exact-phrase > word > prefix. Deliberately simple and
   deterministic so results are explainable and reproducible. */
interface Field { name: string; text: string; weight: number }

function lexicalScore(
  fields: Field[], terms: string[], phrase: string,
  opts: { fuzzy?: boolean } = {},
): { score: number; matched: Set<string> } {
  const matched = new Set<string>();
  let score = 0;
  const p = phrase.trim();

  for (const f of fields) {
    const text = norm(f.text);
    if (!text) continue;
    const wordList = text.split(/[^a-z0-9+#.]+/).filter(Boolean);
    const words = new Set(wordList);

    if (p.length >= 3 && text.includes(p)) { score += 12 * f.weight; matched.add(f.name); }

    for (const term of terms) {
      if (term.length < 2) continue;
      if (words.has(term)) { score += (term.length >= 5 ? 5 : 3.5) * f.weight; matched.add(f.name); }
      else if (term.length >= 4 && text.includes(term)) { score += 2 * f.weight; matched.add(f.name); }
      else if (opts.fuzzy && term.length >= 5) {
        // Typo tolerance — only in the relaxed pass, and only for longer terms,
        // so "develpoer" can still reach "developer" without loosening the
        // strict pass into noise.
        let best = 0;
        for (const w of wordList) {
          if (Math.abs(w.length - term.length) > 3) continue;
          best = Math.max(best, bigramSimilarity(term, w));
          if (best >= 0.9) break;
        }
        if (best >= 0.62) { score += best * 3 * f.weight; matched.add(f.name); }
      }
    }
  }
  return { score, matched };
}

/** Concept-expansion score — the "semantic" half of the hybrid. */
function conceptScore(fields: Field[], expanded: string[]): { score: number; hits: string[] } {
  if (!expanded.length) return { score: 0, hits: [] };
  const blob = fields.map((f) => norm(f.text)).join(' ');
  const words = new Set(blob.split(/[^a-z0-9+#.]+/).filter(Boolean));
  const hits: string[] = [];
  let score = 0;
  for (const term of expanded) {
    if (term.includes(' ')) { if (blob.includes(term)) { score += 4; hits.push(term); } }
    else if (words.has(term)) { score += 3; hits.push(term); }
  }
  return { score, hits };
}

/* Tier → points inside the 10% location component. */
const TIER_POINTS: Record<LocationTier, number> = {
  exact: 10, alias: 10, region: 7, partial: 6, none: 0, unknown: 0,
};

/**
 * Multiplier applied to the whole score when the user stated an explicit
 * location constraint ("React developer **in Delhi**").
 *
 * A 10% weighted component cannot reorder a list when the semantic signal
 * differs by more than that, which is why a Gujarat React developer outranked
 * a Delhi one. Constraints therefore act as a pre-ranking gate: matches are
 * lifted, records that are demonstrably elsewhere are pushed down, and records
 * with no stored location sit in between rather than being discarded — a
 * strong skill match with an unknown location can still surface.
 */
const CONSTRAINT_FACTOR: Record<LocationTier, number> = {
  exact: 1.45, alias: 1.45, region: 1.25, partial: 1.2, unknown: 0.8, none: 0.45,
};

function locationSignal(entityLocation: string | null, u: QueryUnderstanding): { tier: LocationTier; points: number; factor: number } {
  if (!u.locations.length) return { tier: 'unknown', points: 0, factor: 1 };
  const tier = matchLocation(entityLocation, u.locations);
  return {
    tier,
    points: TIER_POINTS[tier],
    factor: u.locationConstraint ? CONSTRAINT_FACTOR[tier] : 1,
  };
}

function freshnessScore(iso?: string | null): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 0;
  const days = (Date.now() - ts) / 86_400_000;
  if (days <= 7) return 10;
  if (days <= 30) return 6;
  if (days <= 90) return 3;
  return 0;
}

/* Weights from the brief — semantic-first, popularity never dominates. */
const W = { semantic: 0.40, keyword: 0.25, structured: 0.15, location: 0.10, quality: 0.05, freshness: 0.05 };

interface Scored { item: SearchResultItem; raw: number }

/** Relaxed pass turns on typo tolerance. */
interface ScoreOpts { fuzzy?: boolean }

function combine(parts: {
  semantic: number; keyword: number; structured: number;
  location: number; quality: number; freshness: number;
}): number {
  // Each part is capped before weighting so one huge lexical hit cannot swamp
  // the rest of the signal mix.
  const cap = (v: number, max: number) => Math.min(v, max) / max;
  return (
    cap(parts.semantic, 20) * W.semantic +
    cap(parts.keyword, 40) * W.keyword +
    cap(parts.structured, 20) * W.structured +
    cap(parts.location, 10) * W.location +
    cap(parts.quality, 10) * W.quality +
    cap(parts.freshness, 10) * W.freshness
  ) * 100;
}

/**
 * Turn the internal relevance score into a user-facing "% match".
 *
 * combine() returns an absolute value: each component is capped, divided by
 * its cap and weighted, and the weights sum to 1. But those caps are tuned for
 * *ranking*, not for reading as a percentage — real lexical scores land far
 * below the cap, so raw values for genuinely good matches cluster around
 * 25–40 rather than near 100. Reporting raw directly told the user a strong
 * "React developer in Delhi" hit was a 37% match, which is misleading in the
 * opposite direction.
 *
 * So raw is mapped onto a human scale through the fixed anchor table below.
 * Two properties matter:
 *   • It is STRICTLY MONOTONIC, so the displayed order can never disagree with
 *     the ranking order. Nothing about ranking changes.
 *   • It is ABSOLUTE, not relative to the best hit in the response. A mediocre
 *     top result reports ~55–65%; it is never promoted to 100% for placing
 *     first, and a weak relaxed/fuzzy match stays low because its raw is low.
 *
 * Anchors were calibrated against real Docrud data (see the report), not
 * chosen to make numbers look good. Adjust the table if the corpus changes.
 */
const MATCH_ANCHORS: Array<[raw: number, percent: number]> = [
  [0, 0], [5, 30], [10, 45], [18, 60], [25, 72], [32, 82], [45, 92], [70, 100],
];

export function normalizeSearchMatchScore(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  for (let i = 1; i < MATCH_ANCHORS.length; i++) {
    const [x1, y1] = MATCH_ANCHORS[i - 1];
    const [x2, y2] = MATCH_ANCHORS[i];
    if (raw <= x2) {
      const t = (raw - x1) / (x2 - x1);
      return Math.max(1, Math.min(100, Math.round(y1 + t * (y2 - y1))));
    }
  }
  return 100;
}

function explain(u: QueryUnderstanding, matched: string[], conceptHits: string[], loc: string | null, locScore = 0): string {
  const bits: string[] = [];
  const skills = u.skills.filter((s) => conceptHits.some((h) => h.includes(s)) || matched.includes('skills'));
  if (skills.length) bits.push(skills.slice(0, 2).join(' + '));
  const concepts = conceptHits.filter((h) => !skills.includes(h)).slice(0, 2);
  if (concepts.length) bits.push(concepts.join(' + '));
  // Only claim a place when the location actually matched — otherwise the row
  // would read "Matches ... Gujarat" for a query that asked for Delhi.
  if (loc && locScore > 0) bits.push(loc.split(',')[0].trim());
  if (!bits.length && matched.length) bits.push(matched.slice(0, 2).join(' + '));
  return bits.length ? `Matches ${bits.slice(0, 3).join(' · ')}` : 'Related match';
}

/* ── Entity builders ─────────────────────────────────────────────────────── */

type ProfileMap = Record<string, {
  headline?: string; bio?: string; location?: string; skills?: string[];
  interests?: string[]; openToWork?: boolean; docrudGo?: boolean; avatarUrl?: string;
  publicFace?: { category: string }; updatedAt?: string; profileSetupDone?: boolean;
}>;

function scorePeople(
  users: Awaited<ReturnType<typeof getStoredUsers>>,
  profiles: ProfileMap,
  u: QueryUnderstanding, terms: string[], expanded: string[], opts: ScoreOpts,
): Scored[] {
  const out: Scored[] = [];
  for (const user of users) {
    // Visibility: deactivated and pending-deletion accounts are never surfaced.
    if (user.isActive === false || user.pendingDeletion) continue;
    const p = profiles[user.id] ?? {};
    const skills = p.skills ?? [];
    const fields: Field[] = [
      { name: 'name', text: user.name ?? '', weight: 3 },
      { name: 'headline', text: p.headline ?? '', weight: 3 },
      { name: 'skills', text: skills.join(' '), weight: 2.5 },
      { name: 'bio', text: p.bio ?? '', weight: 1.5 },
      { name: 'interests', text: (p.interests ?? []).join(' '), weight: 1.5 },
      { name: 'organization', text: user.organizationName ?? '', weight: 1 },
      { name: 'location', text: p.location ?? '', weight: 1 },
    ];
    const lex = lexicalScore(fields, terms, u.cleaned, opts);
    const con = conceptScore(fields, expanded);
    const locSig = locationSignal(p.location ?? null, u);
    const loc = locSig.points;
    if (lex.score <= 0 && con.score <= 0 && loc <= 0) continue;

    // Structured: the query asked for a person and this row looks like one.
    let structured = 0;
    if (u.entityTypes.includes('person')) structured += 6;
    if (u.roles.some((r) => norm(p.headline).includes(r))) structured += 6;
    if (u.skills.some((s) => skills.some((k) => norm(k).includes(s)))) structured += 8;

    let quality = 0;
    if (p.headline) quality += 3;
    if (skills.length >= 3) quality += 3;
    if (p.avatarUrl) quality += 1;
    if (p.docrudGo) quality += 2;
    if (p.openToWork) quality += 1;

    const raw = locSig.factor * combine({ semantic: con.score, keyword: lex.score, structured, location: loc, quality, freshness: freshnessScore(p.updatedAt) });
    out.push({
      raw,
      item: {
        id: `person-${user.id}`, type: 'person',
        title: user.name || 'Docrud member',
        subtitle: p.headline || user.organizationName || 'Docrud member',
        description: (p.bio ?? '').slice(0, 160),
        image: p.avatarUrl ?? null,
        location: p.location ?? null,
        score: 0,
        matchPercent: 0,
        matchedFields: Array.from(lex.matched),
        why: explain(u, Array.from(lex.matched), con.hits, p.location ?? null, loc),
        url: `/u/${user.id}`,
        badge: p.openToWork ? 'OPEN TO WORK' : undefined,
        meta: { skills: skills.slice(0, 6) },
      },
    });
  }
  return out;
}

function scoreServices(store: Record<string, Service[]>, u: QueryUnderstanding, terms: string[], expanded: string[], profiles: ProfileMap, opts: ScoreOpts): Scored[] {
  const out: Scored[] = [];
  for (const list of Object.values(store)) {
    for (const s of list ?? []) {
      if (!s.isActive) continue;               // unpublished services stay hidden
      const providerLocation = profiles[s.userId]?.location ?? null;
      const fields: Field[] = [
        { name: 'title', text: s.title, weight: 3 },
        { name: 'tagline', text: s.tagline ?? '', weight: 2.5 },
        { name: 'description', text: (s.description ?? '').slice(0, 400), weight: 1.5 },
        { name: 'category', text: String(s.category ?? ''), weight: 2 },
        { name: 'tags', text: (s.tags ?? []).join(' '), weight: 2 },
      ];
      const lex = lexicalScore(fields, terms, u.cleaned, opts);
      const con = conceptScore(fields, expanded);
      const locSig = locationSignal(providerLocation, u);
    const loc = locSig.points;
      if (lex.score <= 0 && con.score <= 0) continue;

      let structured = 0;
      if (u.entityTypes.includes('service')) structured += 8;
      if (u.intent === 'find_provider') structured += 4;
      if (u.domains.some((d) => norm(s.title + ' ' + s.description).includes(d))) structured += 6;

      const raw = locSig.factor * combine({
        semantic: con.score, keyword: lex.score, structured, location: loc,
        quality: s.featured ? 6 : 2, freshness: 0,
      });
      out.push({
        raw,
        item: {
          id: `service-${s.id}`, type: 'service',
          title: s.title,
          subtitle: s.tagline || String(s.category ?? 'Service'),
          description: (s.description ?? '').slice(0, 160),
          image: s.imageUrl ?? null,
          location: providerLocation,
          score: 0,
          matchPercent: 0,
          matchedFields: Array.from(lex.matched),
          why: explain(u, Array.from(lex.matched), con.hits, providerLocation, loc),
          url: `/u/${s.userId}?tab=services`,
          badge: 'SERVICE',
          meta: { tags: (s.tags ?? []).slice(0, 5), category: s.category },
        },
      });
    }
  }
  return out;
}

function scoreBusinesses(pages: Awaited<ReturnType<typeof listBusinessPages>>['pages'], u: QueryUnderstanding, terms: string[], expanded: string[], opts: ScoreOpts): Scored[] {
  const out: Scored[] = [];
  for (const b of pages) {
    if (b.status !== 'active') continue;       // listBusinessPages already filters; belt and braces
    const where = b.location || [b.city, b.country].filter(Boolean).join(', ') || null;
    const fields: Field[] = [
      { name: 'name', text: b.name, weight: 3 },
      { name: 'tagline', text: b.tagline ?? '', weight: 2.5 },
      { name: 'description', text: (b.description ?? '').slice(0, 400), weight: 1.5 },
      { name: 'industry', text: b.industry ?? '', weight: 2.5 },
      { name: 'location', text: where ?? '', weight: 1 },
    ];
    const lex = lexicalScore(fields, terms, u.cleaned, opts);
    const con = conceptScore(fields, expanded);
    const locSig = locationSignal(where, u);
    const loc = locSig.points;
    if (lex.score <= 0 && con.score <= 0) continue;

    let structured = 0;
    if (u.entityTypes.includes('business')) structured += 10;
    if (u.domains.some((d) => norm(`${b.industry} ${b.description} ${b.tagline}`).includes(d))) structured += 6;

    const raw = locSig.factor * combine({
      semantic: con.score, keyword: lex.score, structured, location: loc,
      quality: (b.verified ? 5 : 0) + Math.min(3, Math.log10((b.followerCount || 0) + 1) * 2),
      freshness: freshnessScore(b.updatedAt),
    });
    out.push({
      raw,
      item: {
        id: `business-${b.id}`, type: 'business',
        title: b.name,
        subtitle: b.tagline || b.industry || 'Business',
        description: (b.description ?? '').slice(0, 160),
        image: b.logoUrl ?? null,
        location: where,
        score: 0,
        matchPercent: 0,
        matchedFields: Array.from(lex.matched),
        why: explain(u, Array.from(lex.matched), con.hits, where, loc),
        url: `/businesses/${b.slug}`,
        badge: b.verified ? 'VERIFIED' : 'BUSINESS',
        meta: { industry: b.industry, followers: b.followerCount },
      },
    });
  }
  return out;
}

function scoreJobs(jobs: Awaited<ReturnType<typeof getPublishedHiringJobs>>, u: QueryUnderstanding, terms: string[], expanded: string[], opts: ScoreOpts): Scored[] {
  const out: Scored[] = [];
  for (const j of jobs) {
    if (j.status !== 'published') continue;    // drafts and closed roles stay hidden
    const fields: Field[] = [
      { name: 'title', text: j.title, weight: 3 },
      { name: 'skills', text: [...(j.preferredSkills ?? []), ...(j.targetRoleKeywords ?? [])].join(' '), weight: 2.5 },
      { name: 'description', text: (j.description ?? '').slice(0, 400), weight: 1.5 },
      { name: 'requirements', text: (j.requirements ?? []).join(' '), weight: 1.5 },
      { name: 'company', text: j.organizationName ?? '', weight: 1.5 },
      { name: 'location', text: j.location ?? '', weight: 1 },
      { name: 'department', text: j.department ?? '', weight: 1 },
    ];
    const lex = lexicalScore(fields, terms, u.cleaned, opts);
    const con = conceptScore(fields, expanded);
    const locSig = locationSignal(j.location ?? null, u);
    const loc = locSig.points;
    if (lex.score <= 0 && con.score <= 0) continue;

    let structured = 0;
    if (u.entityTypes.includes('job')) structured += 10;
    if (u.intent === 'find_work') structured += 6;
    // Experience alignment, when the query stated one.
    if (u.experience && j.experienceLevel) {
      const map: Record<string, string[]> = { fresher: ['entry'], junior: ['entry', 'associate'], mid: ['associate', 'mid'], senior: ['senior', 'lead'] };
      if (map[u.experience]?.includes(j.experienceLevel)) structured += 6;
    }

    const raw = locSig.factor * combine({
      semantic: con.score, keyword: lex.score, structured, location: loc,
      quality: 2, freshness: freshnessScore(j.updatedAt || j.createdAt),
    });
    out.push({
      raw,
      item: {
        id: `job-${j.id}`, type: 'job',
        title: j.title,
        subtitle: [j.organizationName, j.employmentType?.replace('_', ' ')].filter(Boolean).join(' · '),
        description: (j.description ?? '').slice(0, 160),
        image: null,
        location: j.location ?? null,
        score: 0,
        matchPercent: 0,
        matchedFields: Array.from(lex.matched),
        why: explain(u, Array.from(lex.matched), con.hits, j.location ?? null, loc),
        url: j.shareUrl || `/jobs/${j.id}`,
        badge: 'JOB',
        meta: { experienceLevel: j.experienceLevel, workMode: j.workMode, skills: (j.preferredSkills ?? []).slice(0, 5) },
      },
    });
  }
  return out;
}

/**
 * Business-owned content: jobs, products and events.
 *
 * Fetched with three bulk `$in` queries over the already-visible page set, so
 * cost is constant in the number of businesses. Location and owning-business
 * name come from the parent page, which is the only place they are stored.
 */
function scoreBusinessContent(
  rows: Array<{
    kind: 'job' | 'product' | 'event';
    id: string; pageId: string; title: string; body: string; extra: string;
    slug: string; pageName: string; location: string | null; createdAt?: string;
  }>,
  u: QueryUnderstanding, terms: string[], expanded: string[], opts: ScoreOpts,
): Scored[] {
  const out: Scored[] = [];
  for (const r of rows) {
    const fields: Field[] = [
      { name: 'title', text: r.title, weight: 3 },
      { name: 'description', text: r.body.slice(0, 400), weight: 1.5 },
      { name: 'skills', text: r.extra, weight: 2.5 },
      { name: 'company', text: r.pageName, weight: 1.5 },
      { name: 'location', text: r.location ?? '', weight: 1 },
    ];
    const lex = lexicalScore(fields, terms, u.cleaned, opts);
    const con = conceptScore(fields, expanded);
    const locSig = locationSignal(r.location, u);
    const loc = locSig.points;
    if (lex.score <= 0 && con.score <= 0) continue;

    const type: SearchEntityType = r.kind === 'job' ? 'job' : r.kind === 'product' ? 'product' : 'event';
    let structured = 0;
    if (u.entityTypes.includes(type)) structured += 10;
    if (r.kind === 'job' && u.intent === 'find_work') structured += 6;

    const raw = locSig.factor * combine({
      semantic: con.score, keyword: lex.score, structured, location: loc,
      quality: 2, freshness: freshnessScore(r.createdAt),
    });
    out.push({
      raw,
      item: {
        id: `${r.kind}-${r.id}`, type,
        title: r.title,
        subtitle: r.pageName,
        description: r.body.slice(0, 160),
        image: null,
        location: r.location,
        score: 0,
        matchPercent: 0,
        matchedFields: Array.from(lex.matched),
        why: explain(u, Array.from(lex.matched), con.hits, r.location, loc),
        url: `/businesses/${r.slug}`,
        badge: r.kind.toUpperCase(),
      },
    });
  }
  return out;
}

/** Map an existing GlobalSearchResult onto the unified shape. */
function adaptLegacy(entry: GlobalSearchResult, u: QueryUnderstanding, expanded: string[]): Scored | null {
  const badge = entry.badge ?? '';
  const type: SearchEntityType =
    badge === 'GIG' ? 'gig'
    : badge === 'BLOG' ? 'post'
    : badge === 'RESUME' ? 'person'
    : badge === 'PERSON' ? 'person'
    : badge === 'SVC' ? 'service'
    : entry.type === 'file' ? 'file'
    : entry.type === 'article' ? 'post'
    : entry.type === 'feature' ? 'feature'
    : 'post';

  const meta = (entry.meta ?? {}) as Record<string, unknown>;
  const fields: Field[] = [
    { name: 'title', text: entry.title, weight: 3 },
    { name: 'description', text: entry.description ?? '', weight: 2 },
    { name: 'category', text: entry.category ?? '', weight: 1.5 },
    { name: 'skills', text: Array.isArray(meta.skills) ? (meta.skills as string[]).join(' ') : '', weight: 2 },
    { name: 'tags', text: Array.isArray(meta.tags) ? (meta.tags as string[]).join(' ') : '', weight: 1.5 },
  ];
  const con = conceptScore(fields, expanded);
  const lexRelevance = typeof entry.relevance === 'number' ? entry.relevance : 40;
  const location = typeof meta.location === 'string' ? meta.location : null;
  const locSig = locationSignal(location, u);
    const loc = locSig.points;

  let structured = 0;
  if (u.entityTypes.includes(type)) structured += 8;

  const raw = locSig.factor * combine({
    semantic: con.score,
    keyword: lexRelevance * 0.4,   // legacy relevance is already 0–100
    structured, location: loc, quality: 2, freshness: 0,
  });
  return {
    raw,
    item: {
      id: entry.id, type,
      title: entry.title,
      subtitle: entry.category ?? '',
      description: (entry.description ?? '').slice(0, 160),
      image: typeof meta.avatarUrl === 'string' ? meta.avatarUrl : null,
      location,
      score: 0,
      matchPercent: 0,
      matchedFields: [],
      why: explain(u, ['title'], con.hits, location, loc),
      url: entry.href,
      badge: entry.badge,
      meta,
    },
  };
}

/* ── Orchestrator ────────────────────────────────────────────────────────── */

export interface IntelligentSearchParams {
  query: string;
  user?: { id: string; email?: string | null; role?: string | null; permissions?: string[] | null } | null;
  limit?: number;
  types?: SearchEntityType[];
  /** Location for "near me" — supplied by the caller, never inferred. */
  viewerLocation?: string | null;
  /** Skip the LLM (typeahead). Rules-only understanding still applies. */
  useAi?: boolean;
}

export async function runIntelligentSearch(params: IntelligentSearchParams): Promise<IntelligentSearchResponse> {
  const started = Date.now();
  const degraded: string[] = [];
  const rawQuery = (params.query ?? '').trim().slice(0, 400);
  const limit = Math.min(60, Math.max(5, params.limit ?? 24));

  const empty = (u?: QueryUnderstanding): IntelligentSearchResponse => ({
    query: rawQuery,
    understanding: {
      intent: u?.intent ?? 'browse', entityTypes: u?.entityTypes ?? [], roles: u?.roles ?? [],
      skills: u?.skills ?? [], domains: u?.domains ?? [], locations: u?.locations ?? [],
      experience: u?.experience ?? null, expandedTerms: u?.expanded ?? [], source: u?.source ?? 'rules',
    },
    results: [], groups: {}, relaxed: false, total: 0, tookMs: Date.now() - started, degraded,
  });

  if (!rawQuery) return empty();

  /* Load corpora in parallel. Each is independently fault-tolerant. */
  const [users, profilesRaw, servicesStore, businessResult, jobs] = await Promise.all([
    cached('users', getStoredUsers, [], degraded),
    cached('profiles', getAllProfiles, {} as ProfileMap, degraded),
    cached('services', getAllServices, {} as Record<string, Service[]>, degraded),
    cached('businesses', () => listBusinessPages({ limit: 200 }), { pages: [], total: 0 }, degraded),
    cached('jobs', getPublishedHiringJobs, [], degraded),
  ]);
  const profiles = profilesRaw as ProfileMap;
  const businesses = businessResult.pages;

  /* Business-owned content — three bulk queries over the visible pages only.
     Failures degrade to "no business content" rather than failing the search. */
  const pageIds = businesses.map((b) => b.id);
  const pageById = new Map(businesses.map((b) => [b.id, b]));
  const [bizJobs, bizProducts, bizEvents] = await Promise.all([
    cached(`biz-jobs:${pageIds.length}`, () => listJobsForPages(pageIds), [], degraded),
    cached(`biz-products:${pageIds.length}`, () => listProductsForPages(pageIds), [], degraded),
    cached(`biz-events:${pageIds.length}`, () => listEventsForPages(pageIds), [], degraded),
  ]);
  const whereOf = (pageId: string) => {
    const b = pageById.get(pageId);
    if (!b) return null;
    return b.location || [b.city, b.country].filter(Boolean).join(', ') || null;
  };
  const businessContentRows = [
    ...bizJobs.map((j) => ({
      kind: 'job' as const, id: j.id, pageId: j.pageId, title: j.title, body: j.description ?? '',
      extra: (j.skills ?? []).join(' '), slug: pageById.get(j.pageId)?.slug ?? '',
      pageName: pageById.get(j.pageId)?.name ?? '', location: j.location || whereOf(j.pageId), createdAt: j.createdAt,
    })),
    ...bizProducts.map((p) => ({
      kind: 'product' as const, id: p.id, pageId: p.pageId, title: p.name, body: p.description ?? '',
      extra: p.category ?? '', slug: pageById.get(p.pageId)?.slug ?? '',
      pageName: pageById.get(p.pageId)?.name ?? '', location: whereOf(p.pageId), createdAt: p.createdAt,
    })),
    ...bizEvents.map((e) => ({
      kind: 'event' as const, id: e.id, pageId: e.pageId, title: e.title, body: e.description ?? '',
      extra: e.eventType ?? '', slug: pageById.get(e.pageId)?.slug ?? '',
      pageName: pageById.get(e.pageId)?.name ?? '', location: e.location || whereOf(e.pageId), createdAt: e.createdAt,
    })),
  ].filter((r) => r.slug);   // a row whose page is not visible is dropped

  /* Location vocabulary is derived from the data itself. */
  const locationVocab = buildLocationVocabulary([
    ...Object.values(profiles).map((p) => p?.location),
    ...businesses.map((b) => b.location), ...businesses.map((b) => b.city), ...businesses.map((b) => b.country),
    ...jobs.map((j) => j.location),
    ...businessContentRows.map((r) => r.location),
  ]);

  const understanding = await understandQuery(rawQuery, { locationVocab, useAi: params.useAi ?? false });
  if (understanding.source === 'rules' && (params.useAi ?? false) && !degraded.includes('ai')) {
    // useAi was requested but the enrichment did not come back — note it.
    degraded.push('ai-enrichment-unavailable');
  }
  // "near me" resolves only from a location the caller supplied. No tracking.
  const effective: QueryUnderstanding = understanding.nearMe && params.viewerLocation
    ? { ...understanding, locations: Array.from(new Set([...understanding.locations, understanding.nearMe ? (params.viewerLocation ?? '').toLowerCase() : ''])).filter(Boolean) }
    : understanding;

  const terms = effective.terms.length ? effective.terms : [effective.cleaned].filter(Boolean);
  const expanded = searchVocabulary(effective).filter((t) => !terms.includes(t));

  /* Existing engine handles the corpora it already owns; give it the cleaned
     query so sentence filler no longer pollutes its scorer.

     It performs its own per-query network work (knowledge base, web sources),
     measured at ~2s against the live cluster, so it races a deadline: if it is
     slow, people/services/businesses/jobs still return on time and the miss is
     reported in `degraded` rather than blocking the response. */
  const LEGACY_DEADLINE_MS = 1_200;
  const legacy = await Promise.race([
    runGlobalSearch({
      query: effective.cleaned || rawQuery,
      user: params.user ?? null,
      limit: 30,
    }).catch(() => { degraded.push('global-search'); return [] as GlobalSearchResult[]; }),
    new Promise<GlobalSearchResult[]>((resolve) =>
      setTimeout(() => { degraded.push('global-search-timeout'); resolve([]); }, LEGACY_DEADLINE_MS)),
  ]);

  const legacyScored = legacy
    .map((e) => adaptLegacy(e, effective, expanded))
    .filter((x): x is Scored => x !== null)
    // People and services are scored richly below — avoid double-representing them.
    .filter((s) => !s.item.id.startsWith('person-') && !s.item.id.startsWith('service-'));

  const collect = (opts: ScoreOpts): Scored[] => {
    const all: Scored[] = [
      ...scorePeople(users, profiles, effective, terms, expanded, opts),
      ...scoreServices(servicesStore, effective, terms, expanded, profiles, opts),
      ...scoreBusinesses(businesses, effective, terms, expanded, opts),
      ...scoreJobs(jobs, effective, terms, expanded, opts),
      ...scoreBusinessContent(businessContentRows, effective, terms, expanded, opts),
      ...legacyScored,
    ];
    /* Dedupe in two stages.
       1. By stable entity identity (`type:id`, e.g. person:u_123) so the same
          person reaching the list through two different sources collapses to
          one canonical card regardless of which URL each source produced.
       2. By rendered identity (type + title + subtitle + location) so two rows
          the user cannot tell apart never both appear. Distinct accounts that
          differ in any visible way are preserved. */
    const byKey = new Map<string, Scored>();
    for (const row of all) {
      const key = `${row.item.type}:${row.item.id}`.toLowerCase();
      const prev = byKey.get(key);
      if (!prev || row.raw > prev.raw) byKey.set(key, row);
    }
    const byRendered = new Map<string, Scored>();
    for (const row of Array.from(byKey.values())) {
      const key = [row.item.type, row.item.title, row.item.subtitle, row.item.location ?? '']
        .map((v) => String(v).trim().toLowerCase()).join('|');
      const prev = byRendered.get(key);
      if (!prev || row.raw > prev.raw) byRendered.set(key, row);
    }
    let out = Array.from(byRendered.values());
    if (params.types?.length) out = out.filter((r) => params.types!.includes(r.item.type));
    return out;
  };

  /* Pass 1 — strict: exact/word/concept matches only, above a signal floor.
     Pass 2 — relaxed: typo tolerance on and the floor removed, so a misspelling
     or a query with no exact match still surfaces genuinely related work.
     Truly unrelated queries still return nothing rather than filler. */
  const STRICT_FLOOR = 8;
  let relaxed = false;
  let picked = collect({}).filter((r) => r.raw >= STRICT_FLOOR);
  if (!picked.length) {
    picked = collect({ fuzzy: true }).filter((r) => r.raw > 0);
    relaxed = picked.length > 0;
  }

  picked.sort((a, b) => b.raw - a.raw);
  const top = picked.slice(0, limit);
  const max = top.length ? Math.max(...top.map((r) => r.raw)) : 1;
  const results = top.map((r) => ({
    ...r.item,
    // `score` keeps its existing meaning (relative to the best hit) so nothing
    // that already consumes it changes; `matchPercent` is the honest absolute
    // figure shown to the user. Ordering is by `raw` and is untouched.
    score: Math.max(1, Math.round((r.raw / (max || 1)) * 100)),
    matchPercent: normalizeSearchMatchScore(r.raw),
  }));

  const groups: Record<string, SearchResultItem[]> = {};
  for (const item of results) {
    (groups[item.type] ??= []).push(item);
  }

  return {
    query: rawQuery,
    understanding: {
      intent: effective.intent, entityTypes: effective.entityTypes, roles: effective.roles,
      skills: effective.skills, domains: effective.domains, locations: effective.locations,
      experience: effective.experience, expandedTerms: expanded.slice(0, 20), source: effective.source,
    },
    results, groups, relaxed,
    total: picked.length,
    tookMs: Date.now() - started,
    degraded,
  };
}
