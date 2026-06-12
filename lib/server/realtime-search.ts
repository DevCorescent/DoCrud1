type SearchStamp = { ts: number; query: string };

declare global {
  // eslint-disable-next-line no-var
  var __docrudRealtimeSearch: { stamps: SearchStamp[] } | undefined;
}

function getState() {
  if (!global.__docrudRealtimeSearch) {
    global.__docrudRealtimeSearch = { stamps: [] };
  }
  return global.__docrudRealtimeSearch;
}

function cleanup(now: number, windowMs: number) {
  const state = getState();
  const cutoff = now - windowMs;
  // Keep only the recent window; also cap to avoid unbounded memory.
  state.stamps = state.stamps.filter((item) => item.ts >= cutoff).slice(-5000);
}

export function recordRealtimeSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const now = Date.now();
  const state = getState();
  state.stamps.push({ ts: now, query: trimmed.toLowerCase() });
  cleanup(now, 60_000);
}

export function getSearchingNow(query: string, windowMs = 25_000) {
  const now = Date.now();
  cleanup(now, windowMs);
  const q = query.trim().toLowerCase();
  const stamps = getState().stamps;
  const totalNow = stamps.length;
  const sameQueryNow = q ? stamps.filter((item) => item.query === q).length : 0;
  return { totalNow, sameQueryNow, windowMs };
}

