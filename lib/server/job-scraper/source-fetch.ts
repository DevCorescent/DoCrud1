/**
 * The one place a provider turns a failed request into an error.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * Every adapter used to end its fetch with:
 *
 *     const json = deps.fetchJson ? await deps.fetchJson(url) : await fetchJson(url);
 *     if (json == null) return [];
 *
 * `fetchJson` returns null for a 404, a 500, a timeout, a DNS failure,
 * unparseable JSON and an oversized body alike — so a board that could not be
 * reached produced an EMPTY ARRAY, and the runner recorded a source that
 * "succeeded with 0 jobs". A company with no openings and a company whose API
 * was down looked identical in Super Admin.
 *
 * The runner was already correct: `runCanonicalIngestion` wraps each adapter in
 * its own try/catch and records `ok: false` on a throw. The adapters were the
 * ones lying to it. These helpers throw, so the existing handling takes over.
 *
 * A SUCCESSFUL EMPTY RESPONSE IS STILL EMPTY. `{ jobs: [] }` from a live board
 * returns an empty list and a healthy source, exactly as before. Only genuine
 * failures changed.
 */
import {
  describeFetchFailure, fetchJsonResult, fetchJsonPostResult, fetchTextStrictResult,
  type FetchFailure, type FetchFailureKind,
} from './fetcher';
import type { ProviderDeps } from './types';

/**
 * A provider fetch that did not succeed.
 *
 * Carries the category and, where the server sent one, the HTTP status — so an
 * administrator can tell "no jobs" from "could not connect" from "returned
 * nonsense". The message is already safe to persist and display: it names a
 * host and a status, never a URL with a board identifier, never a stack.
 */
export class SourceFetchError extends Error {
  readonly kind: FetchFailureKind | 'config' | 'injected';
  readonly status?: number;

  constructor(message: string, kind: SourceFetchError['kind'], status?: number) {
    super(message);
    this.name = 'SourceFetchError';
    this.kind = kind;
    this.status = status;
  }
}

function fail(failure: FetchFailure, url: string): never {
  throw new SourceFetchError(describeFetchFailure(failure, url), failure.kind, failure.status);
}

/**
 * A configuration fault — an empty slug, a missing Workday tenant.
 *
 * Distinct from a fetch failure: nothing was contacted, and no amount of
 * retrying will help. Reported immediately rather than consuming attempts.
 */
export function configError(detail: string): never {
  throw new SourceFetchError(`Invalid source configuration: ${detail}`, 'config');
}

/* An injected fetch returning null is the test/preview equivalent of a failed
   request, and is treated as one — otherwise a test double could silently
   reproduce the exact bug this module exists to prevent. */
const INJECTED_NULL = 'Injected fetcher returned no data';

/** GET JSON, or throw with the reason. */
export async function fetchJsonOrThrow(url: string, deps: ProviderDeps = {}): Promise<unknown> {
  if (deps.fetchJson) {
    const value = await deps.fetchJson(url);
    if (value == null) throw new SourceFetchError(INJECTED_NULL, 'injected');
    return value;
  }
  const result = await fetchJsonResult(url);
  if (!result.ok) fail(result, url);
  return result.value;
}

/** POST JSON, or throw with the reason. Workday's board endpoint. */
export async function fetchJsonPostOrThrow(
  url: string, body: unknown, deps: ProviderDeps = {},
): Promise<unknown> {
  if (deps.fetchJsonPost) {
    const value = await deps.fetchJsonPost(url, body);
    if (value == null) throw new SourceFetchError(INJECTED_NULL, 'injected');
    return value;
  }
  const result = await fetchJsonPostResult(url, body);
  if (!result.ok) fail(result, url);
  return result.value;
}

/** GET text WITHOUT following redirects, or throw with the reason. */
export async function fetchTextStrictOrThrow(
  url: string,
  deps: ProviderDeps = {},
  opts: { expectContentType?: RegExp } = {},
): Promise<{ status: number; text: string }> {
  if (deps.fetchTextStrict) {
    const value = await deps.fetchTextStrict(url);
    if (value == null) throw new SourceFetchError(INJECTED_NULL, 'injected');
    return value;
  }
  const result = await fetchTextStrictResult(url, opts);
  if (!result.ok) fail(result, url);
  return result.value;
}
