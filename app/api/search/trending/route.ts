import { NextRequest, NextResponse } from 'next/server';
import { getWebTelemetryEvents } from '@/lib/server/telemetry';

export const dynamic = 'force-dynamic';

/**
 * "Most searched" — the top queries people actually ran.
 *
 * Reads the SAME telemetry events the super-admin search intel panel already
 * aggregates (`type: 'search'`, written by lib/search-tracking). No new store,
 * no new write path, no schema change — this is a read-only projection.
 *
 * Privacy: search queries are user input and can contain personal details, so a
 * query is only ever surfaced when it clears a k-anonymity bar — at least
 * MIN_DISTINCT_ACTORS different sessions/users ran it. One person's unique
 * search can therefore never be shown to anybody else. Obvious PII shapes
 * (emails, phone numbers, long digit runs) are dropped outright, and the
 * response carries only the query text and a rank — never who searched it.
 */

const WINDOW_DAYS = 30;
const MAX_RESULTS = 6;
/** A query must come from this many distinct actors before it is public. */
const MIN_DISTINCT_ACTORS = 2;
/** Aggregating the event log is not free — serve a shared snapshot. */
const CACHE_TTL_MS = 5 * 60 * 1000;

const PII_PATTERNS = [
  /@/,                    // email-ish
  /\d{6,}/,               // long digit runs: phones, ids, card fragments
  /\+\d[\d\s-]{7,}/,      // international phone
  /https?:\/\//i,         // pasted urls
];

function isPresentable(query: string): boolean {
  if (query.length < 2 || query.length > 40) return false;
  if (PII_PATTERNS.some((re) => re.test(query))) return false;
  // Require at least one letter — pure punctuation/numbers are noise. Written
  // without the `u` flag (the project targets es5) so this checks ASCII letters
  // plus any non-ASCII character, which covers non-Latin scripts.
  return /[a-z]/i.test(query) || /[^\x00-\x7F]/.test(query);
}

/** Title-case the stored lowercase key so "react developer" reads as a label. */
function presentQuery(query: string): string {
  return query.replace(/(^|\s)(\S)/g, (_m, lead: string, char: string) => lead + char.toUpperCase());
}

let cache: { at: number; queries: string[] } | null = null;

async function computeTrending(): Promise<string[]> {
  const events = await getWebTelemetryEvents();
  const since = Date.now() - WINDOW_DAYS * 86_400_000;

  // key → distinct actors. Counting actors rather than raw events means one
  // person hammering the same query cannot manufacture a trend.
  const actorsByQuery = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.type !== 'search') continue;
    if (!event.query || !event.createdAt) continue;
    if (new Date(event.createdAt).getTime() < since) continue;
    // Only queries that actually found something are worth suggesting.
    if (event.hasResults === false) continue;

    const key = event.query.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!isPresentable(key)) continue;

    const actor = event.userId || event.sessionId || event.visitorId;
    if (!actor) continue;

    let actors = actorsByQuery.get(key);
    if (!actors) { actors = new Set(); actorsByQuery.set(key, actors); }
    actors.add(actor);
  }

  return Array.from(actorsByQuery.entries())
    .filter(([, actors]) => actors.size >= MIN_DISTINCT_ACTORS)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_RESULTS)
    .map(([query]) => presentQuery(query));
}

export async function GET(_request: NextRequest) {
  try {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return NextResponse.json({ queries: cache.queries, cached: true });
    }
    const queries = await computeTrending();
    cache = { at: Date.now(), queries };
    return NextResponse.json({ queries, cached: false });
  } catch {
    // Discovery is a nicety — never break the search bar over it.
    return NextResponse.json({ queries: [] });
  }
}
