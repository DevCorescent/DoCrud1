/**
 * Polite HTTP text fetch (server-side, via global fetch).
 *
 * - strict per-request timeout (AbortController)
 * - bounded retries with backoff on 429 / 5xx
 * - respects 401/403 (never bypasses access controls) by returning null
 * - sends a real, identifying User-Agent; never sends credentials
 *
 * Robots + host-allowlist + throttle are enforced by the caller (index.ts).
 */

export const SCRAPER_UA = 'DoCrudJobScraper/1.0 (+https://docrud.com)';

export interface FetchOpts {
  timeoutMs?: number;
  retries?: number;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<{ status: number; text: string } | null> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retries = Math.max(0, opts.retries ?? 2);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': SCRAPER_UA, accept: 'text/html,application/xhtml+xml,application/xml' },
      });
      if (res.status === 401 || res.status === 403) return null;         // respect access control
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < retries) { await sleep(300 * 2 ** attempt); continue; }
        return null;
      }
      if (res.status !== 200) return null;
      return { status: 200, text: await res.text() };
    } catch {
      if (attempt < retries) { await sleep(300 * 2 ** attempt); continue; }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

const MAX_JSON_BYTES = 8 * 1024 * 1024; // 8 MB response-size guard

/**
 * Fetch and parse JSON from an official public job API. HTTPS only, bounded
 * timeout + retries, response-size cap, real UA, JSON validation. Returns the
 * parsed value, or null on any failure / access control (401/403) — the caller
 * records the source failure and continues.
 */
export async function fetchJson(url: string, opts: FetchOpts = {}): Promise<unknown | null> {
  if (!/^https:\/\//i.test(url)) return null; // HTTPS only
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retries = Math.max(0, opts.retries ?? 2);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': SCRAPER_UA, accept: 'application/json' },
      });
      if (res.status === 401 || res.status === 403) return null;
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
        return null;
      }
      if (res.status !== 200) return null;
      const len = Number(res.headers.get('content-length') || 0);
      if (len && len > MAX_JSON_BYTES) return null;
      const text = await res.text();
      if (text.length > MAX_JSON_BYTES) return null;
      try { return JSON.parse(text); } catch { return null; }
    } catch {
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/* ── Stage 3 additions ────────────────────────────────────────────────────*/

/**
 * POST a JSON body and read a JSON reply.
 *
 * Added for Workday alone: its public careers endpoint is a POST that carries
 * `{ limit, offset, searchText }`, so the GET-only `fetchJson` cannot reach it.
 * Same guards as `fetchJson` — HTTPS only, bounded timeout, backoff on 429/5xx,
 * a response-size cap, and 401/403 respected rather than worked around.
 */
export async function fetchJsonPost(
  url: string,
  body: unknown,
  opts: FetchOpts = {},
): Promise<unknown | null> {
  if (!/^https:\/\//i.test(url)) return null;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retries = Math.max(0, opts.retries ?? 2);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': SCRAPER_UA,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
      });
      if (res.status === 401 || res.status === 403) return null;
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
        return null;
      }
      if (res.status !== 200) return null;
      const text = await res.text();
      if (text.length > MAX_JSON_BYTES) return null;
      try { return JSON.parse(text); } catch { return null; }
    } catch {
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Fetch text WITHOUT following redirects.
 *
 * Personio and BambooHR both answer an unknown company slug with a REDIRECT to
 * their marketing site rather than a 404. Following it returns a 200 and a page
 * of HTML, which a careless parser reads as "this company has no jobs" — a
 * silent, confident wrong answer. Refusing to follow turns that into the
 * failure it actually is.
 *
 * `expectContentType` is a second guard for the same problem: an XML feed that
 * comes back as text/html is not a feed.
 */
export async function fetchTextStrict(
  url: string,
  opts: FetchOpts & { expectContentType?: RegExp } = {},
): Promise<{ status: number; text: string } | null> {
  if (!/^https:\/\//i.test(url)) return null;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retries = Math.max(0, opts.retries ?? 2);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        /* The whole point: a 3xx is returned to us, never followed. */
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': SCRAPER_UA, accept: 'application/xml,text/xml,application/json,text/plain' },
      });
      if (res.status === 401 || res.status === 403) return null;
      /* A redirect means the slug is wrong. Not an empty board. */
      if (res.status >= 300 && res.status < 400) return null;
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
        return null;
      }
      if (res.status !== 200) return null;
      if (opts.expectContentType) {
        const ct = res.headers.get('content-type') || '';
        if (!opts.expectContentType.test(ct)) return null;
      }
      const text = await res.text();
      if (text.length > MAX_JSON_BYTES) return null;
      return { status: 200, text };
    } catch {
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
