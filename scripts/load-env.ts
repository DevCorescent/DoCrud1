/**
 * Load the application's environment for a STANDALONE script.
 *
 * ═══ WHY THIS IS NEEDED AT ALL ═══
 *
 * `next dev` / `next start` load `.env*` themselves before any application code
 * runs, so everything under lib/server can simply read `process.env`. A script
 * run as `npx tsx scripts/…` gets none of that: `process.env.MONGODB_URI` is
 * undefined, and `getMongoDb()` then reports "no database" rather than failing
 * on a bad connection. For the scraper worker that is the worst possible
 * shape of failure — `acquireScraperLease` would throw, or worse, an ingestion
 * would run against a configuration that is not the one the app is using.
 *
 * ═══ WHY @next/env AND NOT dotenv ═══
 *
 * Next.js resolves several files in a defined order — `.env.local` overrides
 * `.env.<NODE_ENV>` overrides `.env` — and only the real implementation gets
 * that order right in every case. Reading one hardcoded filename would give a
 * worker a DIFFERENT configuration from the server it is meant to mirror, and
 * the symptom would be a scraper quietly reading the wrong boards or the wrong
 * database. `loadEnvConfig` IS the function Next.js calls, so parity is exact
 * by construction rather than by imitation.
 *
 * scripts/db-indexes.mjs already does this; this module is the same idea made
 * reusable and typed, so every standalone entrypoint bootstraps identically.
 *
 * ═══ SECRETS ═══
 *
 * Nothing here prints, returns or logs a value. The only thing ever reported is
 * whether a NAME is present, which is what an operator needs in order to fix a
 * misconfiguration and is useless to anyone else.
 */
import { loadEnvConfig } from '@next/env';

/** Names the caller cannot run without. Reported by name, never by value. */
export interface EnvRequirement {
  /** Every one of these must be set. */
  required: readonly string[];
  /** At least one of these must be set, when given. */
  anyOf?: readonly string[];
}

export interface LoadedEnv {
  /** Which `.env*` files Next.js actually applied, in precedence order. */
  loadedFiles: string[];
  missing: string[];
}

let loaded = false;

/**
 * Apply the same `.env*` resolution the Next.js server uses.
 *
 * Idempotent: repeated calls are a no-op, so importing this from two modules
 * cannot double-apply anything.
 *
 * `dev` is derived from NODE_ENV rather than hardcoded, because it selects
 * between `.env.development` and `.env.production`. Hardcoding it is how a
 * worker ends up loading the development database on a production box.
 */
export function loadAppEnv(cwd: string = process.cwd()): string[] {
  if (loaded) return [];
  const dev = process.env.NODE_ENV !== 'production';
  const { loadedEnvFiles } = loadEnvConfig(cwd, dev);
  loaded = true;
  return (loadedEnvFiles ?? []).map((f: { path: string }) => f.path);
}

/**
 * Load, then assert the names this entrypoint needs are present.
 *
 * Throws rather than continuing, because every alternative is worse: a scraper
 * that runs with no MONGODB_URI does not fail, it silently does nothing and
 * reports success — which is the exact class of bug this whole change exists
 * to remove.
 */
export function loadAppEnvOrThrow(
  requirement: EnvRequirement,
  cwd: string = process.cwd(),
): LoadedEnv {
  const loadedFiles = loadAppEnv(cwd);

  const missing = requirement.required.filter((name) => !process.env[name]);
  if (requirement.anyOf?.length && !requirement.anyOf.some((n) => process.env[n])) {
    missing.push(`one of [${requirement.anyOf.join(', ')}]`);
  }

  if (missing.length > 0) {
    /* Names only. The list of files IS safe to name — a path is not a
       credential — and it is the single most useful thing when the answer is
       "systemd started me in the wrong working directory". */
    throw new Error(
      `Missing required environment: ${missing.join(', ')}. `
      + `Loaded env files: ${loadedFiles.length ? loadedFiles.join(', ') : '(none)'}. `
      + 'Check the working directory and that the .env file is readable.',
    );
  }

  return { loadedFiles, missing };
}
