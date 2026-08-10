'use client';

/**
 * Recent searches — per-user, device-local.
 *
 * Deliberately localStorage rather than a server record:
 *  - it renders instantly on open, with no request and no spinner
 *  - a private search history never leaves the device, so there is no endpoint
 *    that could leak one user's queries to another
 *
 * The storage key is namespaced by user id, so two accounts sharing a browser
 * do not see each other's history, and signing out does not surface the
 * previous user's searches to an anonymous visitor.
 *
 * Only the query text and a timestamp are stored — nothing else.
 */

const KEY_PREFIX = 'docrud:recent-searches';
const MAX_ENTRIES = 8;
/** Longer than this is a paste, not a search worth replaying. */
const MAX_QUERY_LENGTH = 80;

export interface RecentSearch {
  query: string;
  searchedAt: string;
}

function storageKey(userId?: string | null): string {
  return `${KEY_PREFIX}:${userId || 'anon'}`;
}

export function readRecentSearches(userId?: string | null): RecentSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentSearch =>
        Boolean(entry) && typeof (entry as RecentSearch).query === 'string')
      .map((entry) => ({
        query: String(entry.query).slice(0, MAX_QUERY_LENGTH),
        searchedAt: typeof entry.searchedAt === 'string' ? entry.searchedAt : '',
      }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Record a search the user actually committed to (Enter, or opening a result).
 * Never called per keystroke.
 *
 * Returns the new list so callers can update state without a second read.
 */
export function addRecentSearch(query: string, userId?: string | null): RecentSearch[] {
  const trimmed = query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return readRecentSearches(userId);

  const existing = readRecentSearches(userId);
  // Case-insensitive dedupe against the whole list, not just the previous entry:
  // re-running an old search should move it to the top, not add a twin.
  const withoutDuplicate = existing.filter(
    (entry) => entry.query.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next = [{ query: trimmed, searchedAt: new Date().toISOString() }, ...withoutDuplicate]
    .slice(0, MAX_ENTRIES);

  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* quota or private mode — the in-memory list still works for this session */
  }
  return next;
}

/** Clears only this user's history. Global search analytics are untouched. */
export function clearRecentSearches(userId?: string | null): RecentSearch[] {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
  return [];
}
