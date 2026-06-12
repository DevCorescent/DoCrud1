import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getWebTelemetryEvents } from '@/lib/server/telemetry';
import { getStoredUsers } from '@/lib/server/auth';
import { SEARCH_CONTEXT_LABELS } from '@/lib/search-tracking';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

function subDays(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(searchParams.get('days') || '30')));

  try {
    const [allEvents, users] = await Promise.all([
      getWebTelemetryEvents(),
      getStoredUsers().catch(() => []),
    ]);

    const since = subDays(days);
    const userById = new Map(users.map((u) => [u.id, u]));

    // All search events in the window
    const searchEvents = allEvents.filter(
      (e) => e.type === 'search' && e.query && e.createdAt && new Date(e.createdAt) >= since,
    );

    const totalSearches  = searchEvents.length;
    const uniqueQueries  = new Set(searchEvents.map((e) => e.query?.trim().toLowerCase())).size;
    const uniqueSearchers= new Set(searchEvents.map((e) => e.userId).filter(Boolean)).size;
    const avgPerDay      = totalSearches > 0 ? Math.round(totalSearches / days) : 0;

    // ── PER-QUERY AGGREGATION ───────────────────────────────────────────

    type QueryAgg = {
      count: number;
      users: Set<string>;
      sessions: Set<string>;
      lastAt: string;
      resultsSum: number;       // sum of resultsCount across events that have it
      resultsCountEvents: number; // how many events had resultsCount
      zeroResultsCount: number;
      contexts: Record<string, number>;
      surfaces: Record<string, number>;
      roles: Record<string, number>;
    };

    const queryMap = new Map<string, QueryAgg>();

    for (const e of searchEvents) {
      const q = (e.query || '').trim().toLowerCase();
      if (!q) continue;
      if (!queryMap.has(q)) {
        queryMap.set(q, {
          count: 0, users: new Set(), sessions: new Set(),
          lastAt: e.createdAt || '', resultsSum: 0, resultsCountEvents: 0,
          zeroResultsCount: 0, contexts: {}, surfaces: {}, roles: {},
        });
      }
      const agg = queryMap.get(q)!;
      agg.count++;
      if (e.userId) agg.users.add(e.userId);
      if (e.sessionId) agg.sessions.add(e.sessionId);
      if (e.createdAt && e.createdAt > agg.lastAt) agg.lastAt = e.createdAt;
      if (typeof (e as any).resultsCount === 'number') {
        agg.resultsSum += (e as any).resultsCount;
        agg.resultsCountEvents++;
        if ((e as any).resultsCount === 0) agg.zeroResultsCount++;
      }
      const ctx = (e as any).searchContext || 'unknown';
      agg.contexts[ctx] = (agg.contexts[ctx] || 0) + 1;
      const surf = e.surface || 'unknown';
      agg.surfaces[surf] = (agg.surfaces[surf] || 0) + 1;
      if (e.userRole) agg.roles[e.userRole] = (agg.roles[e.userRole] || 0) + 1;
    }

    const topQueries = Array.from(queryMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 100)
      .map(([query, agg]) => ({
        query,
        count: agg.count,
        uniqueUsers: agg.users.size,
        uniqueSessions: agg.sessions.size,
        lastAt: agg.lastAt,
        avgResults: agg.resultsCountEvents > 0
          ? Math.round(agg.resultsSum / agg.resultsCountEvents) : null,
        zeroResultsRate: agg.resultsCountEvents > 0
          ? Math.round((agg.zeroResultsCount / agg.resultsCountEvents) * 100) : null,
        contexts: agg.contexts,
        topContext: Object.entries(agg.contexts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null,
      }));

    // ── ZERO-RESULTS INTELLIGENCE ──────────────────────────────────────

    const zeroResultsEvents = searchEvents.filter(
      (e) => typeof (e as any).resultsCount === 'number' && (e as any).resultsCount === 0
    );
    const zeroMap = new Map<string, { count: number; users: Set<string>; lastAt: string }>();
    for (const e of zeroResultsEvents) {
      const q = (e.query || '').trim().toLowerCase();
      if (!q) continue;
      if (!zeroMap.has(q)) zeroMap.set(q, { count: 0, users: new Set(), lastAt: '' });
      const z = zeroMap.get(q)!;
      z.count++;
      if (e.userId) z.users.add(e.userId);
      if (e.createdAt && (!z.lastAt || e.createdAt > z.lastAt)) z.lastAt = e.createdAt;
    }
    const topZeroResults = Array.from(zeroMap.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 30)
      .map(([query, z]) => ({ query, count: z.count, uniqueUsers: z.users.size, lastAt: z.lastAt }));

    // ── SEARCH SUCCESS RATE ─────────────────────────────────────────────

    const eventsWithResultCount = searchEvents.filter(
      (e) => typeof (e as any).resultsCount === 'number'
    );
    const successfulSearches = eventsWithResultCount.filter(
      (e) => (e as any).resultsCount > 0
    ).length;
    const searchSuccessRate = eventsWithResultCount.length > 0
      ? Math.round((successfulSearches / eventsWithResultCount.length) * 100) : null;
    const zeroResultsRate = eventsWithResultCount.length > 0
      ? Math.round(((eventsWithResultCount.length - successfulSearches) / eventsWithResultCount.length) * 100) : null;

    // ── BY SEARCH CONTEXT ───────────────────────────────────────────────

    const contextMap: Record<string, { count: number; uniqueQueries: Set<string>; uniqueUsers: Set<string>; zeroResults: number; withResultCount: number }> = {};
    for (const e of searchEvents) {
      const ctx = (e as any).searchContext || 'unknown';
      if (!contextMap[ctx]) contextMap[ctx] = { count: 0, uniqueQueries: new Set(), uniqueUsers: new Set(), zeroResults: 0, withResultCount: 0 };
      contextMap[ctx].count++;
      if (e.query) contextMap[ctx].uniqueQueries.add(e.query.toLowerCase());
      if (e.userId) contextMap[ctx].uniqueUsers.add(e.userId);
      if (typeof (e as any).resultsCount === 'number') {
        contextMap[ctx].withResultCount++;
        if ((e as any).resultsCount === 0) contextMap[ctx].zeroResults++;
      }
    }
    const byContext = Object.entries(contextMap)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([ctx, d]) => ({
        context: ctx,
        label: SEARCH_CONTEXT_LABELS[ctx] || ctx,
        count: d.count,
        uniqueQueries: d.uniqueQueries.size,
        uniqueUsers: d.uniqueUsers.size,
        zeroResultsRate: d.withResultCount > 0
          ? Math.round((d.zeroResults / d.withResultCount) * 100) : null,
      }));

    // ── TRENDING QUERIES ────────────────────────────────────────────────

    const week1Since = subDays(7);
    const week2Since = subDays(14);
    const w1Events = allEvents.filter((e) => e.type === 'search' && e.query && e.createdAt && new Date(e.createdAt) >= week1Since);
    const w2Events = allEvents.filter((e) => e.type === 'search' && e.query && e.createdAt && new Date(e.createdAt) >= week2Since && new Date(e.createdAt) < week1Since);
    const w1Freq: Record<string, number> = {};
    const w2Freq: Record<string, number> = {};
    w1Events.forEach((e) => { if (e.query) w1Freq[e.query.toLowerCase()] = (w1Freq[e.query.toLowerCase()] || 0) + 1; });
    w2Events.forEach((e) => { if (e.query) w2Freq[e.query.toLowerCase()] = (w2Freq[e.query.toLowerCase()] || 0) + 1; });
    const trending = Object.entries(w1Freq)
      .map(([q, w1]) => ({ query: q, thisWeek: w1, lastWeek: w2Freq[q] || 0, growth: w2Freq[q] ? Math.round(((w1 - w2Freq[q]) / w2Freq[q]) * 100) : 100 }))
      .filter(t => t.thisWeek >= 2)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 20);

    // ── BY SURFACE / ROLE ───────────────────────────────────────────────

    const bySurface: Record<string, number> = {};
    const byRole: Record<string, number> = {};
    searchEvents.forEach((e) => {
      bySurface[e.surface || 'unknown'] = (bySurface[e.surface || 'unknown'] || 0) + 1;
      if (e.userRole) byRole[e.userRole] = (byRole[e.userRole] || 0) + 1;
    });

    // ── QUERY LENGTH DISTRIBUTION ──────────────────────────────────────

    const lengthBuckets: Record<string, number> = { '1-3': 0, '4-6': 0, '7-10': 0, '11-20': 0, '21+': 0 };
    const avgQueryLength = searchEvents.length > 0
      ? Math.round(searchEvents.reduce((s, e) => s + (e.query?.length ?? 0), 0) / searchEvents.length) : 0;
    searchEvents.forEach((e) => {
      const l = e.query?.length ?? 0;
      if      (l <= 3)  lengthBuckets['1-3']++;
      else if (l <= 6)  lengthBuckets['4-6']++;
      else if (l <= 10) lengthBuckets['7-10']++;
      else if (l <= 20) lengthBuckets['11-20']++;
      else              lengthBuckets['21+']++;
    });

    // ── DAILY VOLUME (30 days) ──────────────────────────────────────────

    const dailySearches: Array<{ date: string; count: number; uniqueQueries: number; uniqueUsers: number; zeroResults: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayEvents = searchEvents.filter((e) => (e.createdAt || '').slice(0, 10) === dateStr);
      const uq = new Set(dayEvents.map((e) => e.query?.toLowerCase())).size;
      const uu = new Set(dayEvents.map((e) => e.userId).filter(Boolean)).size;
      const zr = dayEvents.filter((e) => typeof (e as any).resultsCount === 'number' && (e as any).resultsCount === 0).length;
      dailySearches.push({ date: dateStr, count: dayEvents.length, uniqueQueries: uq, uniqueUsers: uu, zeroResults: zr });
    }

    // ── HOUR-OF-DAY DISTRIBUTION ──────────────────────────────────────

    const byHour: number[] = new Array(24).fill(0);
    searchEvents.forEach((e) => {
      if (e.createdAt) byHour[new Date(e.createdAt).getHours()]++;
    });

    // ── TOP SEARCHING USERS (with enriched profile) ────────────────────

    const userSearchMap: Record<string, { count: number; queries: Set<string>; contexts: Set<string>; lastAt: string }> = {};
    searchEvents.forEach((e) => {
      if (!e.userId) return;
      if (!userSearchMap[e.userId]) userSearchMap[e.userId] = { count: 0, queries: new Set(), contexts: new Set(), lastAt: '' };
      const u = userSearchMap[e.userId];
      u.count++;
      if (e.query) u.queries.add(e.query.toLowerCase());
      if ((e as any).searchContext) u.contexts.add((e as any).searchContext);
      if (e.createdAt && (!u.lastAt || e.createdAt > u.lastAt)) u.lastAt = e.createdAt;
    });
    const topSearchers = Object.entries(userSearchMap)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 15)
      .map(([userId, d]) => {
        const user = userById.get(userId);
        return {
          userId, count: d.count,
          uniqueQueries: d.queries.size,
          contexts: Array.from(d.contexts),
          lastAt: d.lastAt,
          userName: user?.name || null,
          userEmail: user?.email || null,
          userRole: user?.role || null,
        };
      });

    // ── SESSION SEARCH DEPTH ──────────────────────────────────────────

    const sessionSearchCount: Record<string, number> = {};
    searchEvents.forEach((e) => {
      if (e.sessionId) sessionSearchCount[e.sessionId] = (sessionSearchCount[e.sessionId] || 0) + 1;
    });
    const sessions = Object.values(sessionSearchCount);
    const avgSearchesPerSession = sessions.length > 0
      ? (sessions.reduce((s, v) => s + v, 0) / sessions.length).toFixed(1) : '0.0';
    const multiSearchSessions = sessions.filter(v => v > 1).length;

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      overview: {
        totalSearches, uniqueQueries, uniqueSearchers, avgPerDay,
        searchSuccessRate, zeroResultsRate, avgQueryLength,
        avgSearchesPerSession, multiSearchSessions,
        eventsWithResultCount: eventsWithResultCount.length,
      },
      topQueries,
      trending,
      topZeroResults,
      byContext,
      bySurface,
      byRole,
      byHour,
      dailySearches,
      lengthDistribution: lengthBuckets,
      topSearchers,
    });
  } catch (err) {
    console.error('[super-admin/search GET]', err);
    return NextResponse.json({ error: 'Failed to load search data' }, { status: 500 });
  }
}
