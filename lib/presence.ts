/**
 * Shared presence utilities — isomorphic (server + client).
 *
 * Single source of truth for:
 *  - the online threshold
 *  - relative "last seen" formatting
 *
 * Presence is derived purely from a server-recorded `lastSeenAt` timestamp.
 * There is deliberately no persisted `isOnline` boolean: a stored flag goes
 * stale the moment a browser closes without telling us.
 */

/** A user counts as online when their last heartbeat is newer than this. */
export const PRESENCE_ONLINE_THRESHOLD_MS = 60 * 1000;

/** How often an active tab sends a heartbeat. */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * No mouse / keyboard / scroll for this long and the tab stops heartbeating,
 * so a tab left open all day does not read as online forever.
 */
export const PRESENCE_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

/** How often subscribed presence values are re-fetched from the server. */
export const PRESENCE_POLL_INTERVAL_MS = 30 * 1000;

/**
 * Server-side write throttle. Heartbeats arriving sooner than this after the
 * previous one are acknowledged without touching storage.
 */
export const PRESENCE_MIN_WRITE_INTERVAL_MS = 20 * 1000;

export interface PresenceState {
  /** ISO-8601 UTC timestamp of the last heartbeat, or null if never seen. */
  lastSeenAt: string | null;
  online: boolean;
}

/** Parse an ISO timestamp defensively. Returns null for missing/invalid input. */
export function parseLastSeen(lastSeenAt: string | null | undefined): number | null {
  if (!lastSeenAt) return null;
  const ms = new Date(lastSeenAt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Online = heartbeat within the threshold.
 *
 * `now` is injectable so the server can pass its own clock. Future timestamps
 * (client/server clock skew) are treated as "just now" rather than as an error.
 */
export function isUserOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  const ms = parseLastSeen(lastSeenAt);
  if (ms === null) return false;
  const age = now - ms;
  if (age < 0) return true; // clock skew — the heartbeat is at worst brand new
  return age <= PRESENCE_ONLINE_THRESHOLD_MS;
}

/**
 * Presence is explicitly ended on logout by stamping `presenceEndedAt`.
 *
 * Without this a user who signs out would keep a green dot until their final
 * heartbeat aged past the threshold. The marker is self-healing: the next
 * heartbeat writes a newer `lastSeenAt`, which supersedes it.
 */
export function isPresenceEnded(
  lastSeenAt: string | null | undefined,
  presenceEndedAt: string | null | undefined,
): boolean {
  const ended = parseLastSeen(presenceEndedAt);
  if (ended === null) return false;
  const seen = parseLastSeen(lastSeenAt);
  return seen === null || ended >= seen;
}

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

/**
 * Human-friendly relative last-seen label.
 *
 * < 1 min      → "Just now"
 * < 1 hr       → "1 min ago"   / "12 mins ago"
 * < 24 hrs     → "1 hr ago"    / "7 hrs ago"
 * < 30 days    → "1 day ago"   / "4 days ago"
 * < 12 months  → "1 month ago" / "8 months ago"
 * otherwise    → "1 year ago"  / "3 years ago"
 *
 * Returns null when there is no usable timestamp, so callers can render nothing
 * rather than an invented value.
 */
export function formatLastSeen(lastSeenAt: string | null | undefined, now = Date.now()): string | null {
  const ms = parseLastSeen(lastSeenAt);
  if (ms === null) return null;

  // Clamp negatives so clock skew reads as "Just now" instead of a huge number.
  const diff = Math.max(0, now - ms);

  if (diff < 60_000) return 'Just now';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return plural(minutes, 'min');

  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return plural(hours, 'hr');

  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return plural(days, 'day');

  // 30 days → months, 12 months → years. Deriving years from months (rather
  // than from days) keeps the boundary consistent: 12 months is always 1 year.
  const months = Math.floor(days / 30);
  if (months < 12) return plural(months, 'month');

  return plural(Math.floor(months / 12), 'year');
}

export interface PresenceDescriptor {
  online: boolean;
  /** "Online" when online, otherwise "Last seen 4 days ago". Null if never seen. */
  label: string | null;
  /** Bare relative time ("4 days ago") for callers supplying their own prefix. */
  lastSeenLabel: string | null;
}

/**
 * One-call helper so no surface re-implements the online/last-seen decision.
 *
 * `authoritativeOnline` is the flag the server returned for this user. A dot is
 * only ever shown when the server said online AND the heartbeat is still fresh
 * against the local clock — the server flag alone would go stale between polls,
 * and the timestamp alone would ignore an explicit logout.
 */
export function describePresence(
  lastSeenAt: string | null | undefined,
  now = Date.now(),
  authoritativeOnline = true,
): PresenceDescriptor {
  if (authoritativeOnline && isUserOnline(lastSeenAt, now)) {
    return { online: true, label: 'Online', lastSeenLabel: null };
  }
  const lastSeenLabel = formatLastSeen(lastSeenAt, now);
  return {
    online: false,
    label: lastSeenLabel ? `Last seen ${lastSeenLabel}` : null,
    lastSeenLabel,
  };
}
