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

/* ── Truthful fetch results ───────────────────────────────────────────────
   THE DEFECT THIS FIXES. Every function above returns `null` for a 404, a 500,
   a timeout, a DNS failure, a redirect, unparseable JSON and an oversized body
   alike. Every provider then turned that `null` into `[]`, and the runner
   recorded a source that "succeeded with 0 jobs". A board that could not be
   contacted was indistinguishable from a company with no openings — so a
   totally broken source showed green in Super Admin.

   The null-returning functions are KEPT, unchanged, because other callers rely
   on them. These variants carry the reason instead of discarding it. */

export type FetchFailureKind =
  | 'http'          // a non-2xx the server actually sent
  | 'access'        // 401/403 — respected, never worked around
  | 'timeout'       // our AbortController fired
  | 'network'       // DNS, TLS, connection reset
  | 'parse'         // 200, but the body was not what it claimed
  | 'redirect'      // a 3xx we refused to follow (wrong slug)
  | 'content_type'  // 200 of the wrong type — an HTML "feed"
  | 'too_large'     // body past MAX_JSON_BYTES
  | 'bad_url';      // not https — a configuration fault

export interface FetchFailure {
  ok: false;
  kind: FetchFailureKind;
  /** Present only for `http` and `redirect`. */
  status?: number;
}

export type FetchOutcome<T> = { ok: true; value: T } | FetchFailure;

/** A message safe to persist and show an administrator. Never a stack. */
export function describeFetchFailure(f: FetchFailure, url?: string): string {
  const where = url ? ` (${safeHost(url)})` : '';
  switch (f.kind) {
    case 'http': return `HTTP ${f.status ?? '???'}${where}`;
    case 'access': return `Access denied — HTTP ${f.status ?? 403}${where}`;
    case 'timeout': return `Timed out${where}`;
    case 'network': return `Network failure${where}`;
    case 'parse': return `Unreadable response body${where}`;
    case 'redirect': return `Redirected (HTTP ${f.status ?? 3}xx) — the slug is probably wrong${where}`;
    case 'content_type': return `Unexpected content type${where}`;
    case 'too_large': return `Response too large${where}`;
    case 'bad_url': return `Refused non-HTTPS URL${where}`;
    default: return `Fetch failed${where}`;
  }
}

/** Host only — never the full URL, which can carry a board identifier. */
function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return 'unknown host'; }
}

/** Classify a thrown fetch error without leaking its message. */
function classifyThrow(error: unknown): FetchFailure {
  const name = (error as { name?: string })?.name ?? '';
  if (name === 'AbortError' || name === 'TimeoutError') return { ok: false, kind: 'timeout' };
  return { ok: false, kind: 'network' };
}

/** Shared response triage. `null` means "keep retrying". */
function triage(status: number): FetchFailure | 'retry' | null {
  if (status === 401 || status === 403) return { ok: false, kind: 'access', status };
  if (status === 429 || (status >= 500 && status < 600)) return 'retry';
  if (status !== 200) return { ok: false, kind: 'http', status };
  return null;
}

/** `fetchJson`, but the failure reason survives. */
export async function fetchJsonResult(url: string, opts: FetchOpts = {}): Promise<FetchOutcome<unknown>> {
  if (!/^https:\/\//i.test(url)) return { ok: false, kind: 'bad_url' };
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retries = Math.max(0, opts.retries ?? 2);
  let last: FetchFailure = { ok: false, kind: 'network' };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET', redirect: 'follow', signal: controller.signal,
        headers: { 'user-agent': SCRAPER_UA, accept: 'application/json' },
      });
      const verdict = triage(res.status);
      if (verdict === 'retry') {
        last = { ok: false, kind: 'http', status: res.status };
        if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
        return last;
      }
      if (verdict) return verdict;
      const len = Number(res.headers.get('content-length') || 0);
      if (len && len > MAX_JSON_BYTES) return { ok: false, kind: 'too_large' };
      const text = await res.text();
      if (text.length > MAX_JSON_BYTES) return { ok: false, kind: 'too_large' };
      try { return { ok: true, value: JSON.parse(text) }; }
      catch { return { ok: false, kind: 'parse' }; }
    } catch (error) {
      last = classifyThrow(error);
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

/** `fetchJsonPost`, but the failure reason survives. */
export async function fetchJsonPostResult(
  url: string, body: unknown, opts: FetchOpts = {},
): Promise<FetchOutcome<unknown>> {
  if (!/^https:\/\//i.test(url)) return { ok: false, kind: 'bad_url' };
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retries = Math.max(0, opts.retries ?? 2);
  let last: FetchFailure = { ok: false, kind: 'network' };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST', redirect: 'follow', signal: controller.signal,
        headers: {
          'user-agent': SCRAPER_UA, accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
      });
      const verdict = triage(res.status);
      if (verdict === 'retry') {
        last = { ok: false, kind: 'http', status: res.status };
        if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
        return last;
      }
      if (verdict) return verdict;
      const text = await res.text();
      if (text.length > MAX_JSON_BYTES) return { ok: false, kind: 'too_large' };
      try { return { ok: true, value: JSON.parse(text) }; }
      catch { return { ok: false, kind: 'parse' }; }
    } catch (error) {
      last = classifyThrow(error);
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

/** `fetchTextStrict`, but the failure reason survives. */
export async function fetchTextStrictResult(
  url: string, opts: FetchOpts & { expectContentType?: RegExp } = {},
): Promise<FetchOutcome<{ status: number; text: string }>> {
  if (!/^https:\/\//i.test(url)) return { ok: false, kind: 'bad_url' };
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retries = Math.max(0, opts.retries ?? 2);
  let last: FetchFailure = { ok: false, kind: 'network' };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { 'user-agent': SCRAPER_UA, accept: 'application/xml,text/xml,application/json,text/plain' },
      });
      /* A redirect means the slug is wrong. Not an empty board. */
      if (res.status >= 300 && res.status < 400) return { ok: false, kind: 'redirect', status: res.status };
      const verdict = triage(res.status);
      if (verdict === 'retry') {
        last = { ok: false, kind: 'http', status: res.status };
        if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
        return last;
      }
      if (verdict) return verdict;
      if (opts.expectContentType) {
        const ct = res.headers.get('content-type') || '';
        if (!opts.expectContentType.test(ct)) return { ok: false, kind: 'content_type' };
      }
      const text = await res.text();
      if (text.length > MAX_JSON_BYTES) return { ok: false, kind: 'too_large' };
      return { ok: true, value: { status: 200, text } };
    } catch (error) {
      last = classifyThrow(error);
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}
