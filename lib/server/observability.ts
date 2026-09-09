/**
 * What a production incident needs, and what the logs currently cannot give it.
 *
 * ═══ THE GAP THIS CLOSES ═══
 *
 * There are 532 console.* calls across the server and NOTHING ties them
 * together. On Vercel every concurrent invocation writes into the same stream,
 * so two users hitting the same route interleave their lines and neither can be
 * followed end to end. "Which of these forty errors belong to the request that
 * actually failed?" has no answer today.
 *
 * A correlation id fixes that for the cost of one header.
 *
 * ═══ WHAT THIS IS NOT ═══
 *
 * Not a logging framework, not a telemetry client, and deliberately not a
 * dependency. Vercel already collects stdout; the missing piece was structure
 * and a guarantee about what can never appear in it — not somewhere else to
 * send the bytes. Nothing here makes a network call, so it cannot slow a
 * response down or fail one.
 */

/** Header carrying the correlation id, set by middleware, read by routes. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * A short, unguessable id. Not a UUID: it is a log-correlation handle, never a
 * security token, and 12 hex characters keeps log lines readable.
 */
export function newRequestId(): string {
  /* `globalThis.crypto` ONLY. This module is imported by middleware, which
     Next bundles for the Edge runtime, and a `node:crypto` fallback there is a
     hard build failure — webpack cannot resolve the `node:` scheme:

         Module build failed: UnhandledSchemeError: Reading from "node:crypto"

     Neither tsc nor lint catches that; only the bundler does. The fallback was
     never needed: Web Crypto is present in Edge, in Node 18+, and in browsers. */
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * An incoming id, if it is safe to reuse.
 *
 * A client-supplied value is UNTRUSTED: it lands in log lines, so an
 * unbounded or newline-bearing value could forge log entries. Only short
 * hex/dash/underscore strings are accepted; anything else gets a fresh id.
 */
export function requestIdFrom(headers: { get(name: string): string | null }): string {
  const raw = headers.get(REQUEST_ID_HEADER) ?? '';
  return /^[A-Za-z0-9_-]{6,64}$/.test(raw) ? raw : newRequestId();
}

/**
 * Removes anything that must never reach a log line, whatever produced it.
 *
 * Applied to EVERY message this module emits, because the dangerous case is
 * not the log statement someone wrote carefully — it is the driver error, the
 * fetch failure, the stack frame that quotes a connection string nobody
 * expected to be quoted.
 */
export function redact(text: string): string {
  return text
    /* Connection strings, with or without credentials. */
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, '<redacted-uri>')
    /* user:pass@host in any URL. */
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//<redacted-credentials>@')
    /* Bearer tokens and Authorization headers. */
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi, '$1<redacted>')
    .replace(/(authorization"?\s*[:=]\s*"?)[^\s",}]+/gi, '$1<redacted>')
    /* Cookies. */
    .replace(/(cookie"?\s*[:=]\s*"?)[^\n",}]+/gi, '$1<redacted>')
    /* Anything that names itself a secret/token/password/key and has a value. */
    .replace(/((?:secret|token|password|passwd|api[_-]?key)"?\s*[:=]\s*"?)[^\s",}]+/gi, '$1<redacted>');
}

export type LogLevel = 'error' | 'warn' | 'info';

export interface LogContext {
  /** Correlation id, so every line for one request can be found together. */
  requestId?: string;
  /** Route or job name — what was running. */
  scope?: string;
  /** Milliseconds, where the caller already measured it. */
  durationMs?: number;
  /** Small scalar facts. NEVER request bodies, user records or credentials. */
  [key: string]: unknown;
}

/**
 * One structured, redacted line.
 *
 * Errors are reduced to name + message. Stacks are deliberately omitted: they
 * carry absolute filesystem paths and, from a driver, sometimes the connection
 * string itself — and a stack has never been the thing that identified which
 * request failed. The correlation id does that.
 */
export function logEvent(level: LogLevel, message: string, context: LogContext = {}): void {
  const safe: Record<string, unknown> = { level, msg: redact(message), ts: new Date().toISOString() };
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    safe[key] = typeof value === 'string' ? redact(value)
      : (typeof value === 'number' || typeof value === 'boolean') ? value
      : redact(String(value));
  }
  const line = JSON.stringify(safe);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** An error reduced to what is safe and useful. */
export function describeError(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: redact(error.message).split('\n')[0] };
  }
  return { errorName: 'UnknownError', errorMessage: redact(String(error)).split('\n')[0] };
}
