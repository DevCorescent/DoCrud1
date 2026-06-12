import dns from 'node:dns';
import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __docrudPgPool: Pool | undefined;
}

dns.setDefaultResultOrder('ipv4first');

function getSupabaseProjectRef() {
  const projectUrl = process.env.SUPABASE_URL || '';
  if (projectUrl) {
    try {
      return new URL(projectUrl).hostname.split('.')[0] || '';
    } catch {
      return '';
    }
  }

  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!anonKey) {
    return '';
  }

  const parts = anonKey.split('.');
  if (parts.length < 2) {
    return '';
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { ref?: string };
    return payload.ref || '';
  } catch {
    return '';
  }
}

function getDatabaseUrl() {
  const explicitUrl = process.env.DATABASE_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  const supabaseDbUrl = process.env.SUPABASE_DB_URL || '';
  if (!supabaseDbUrl) {
    return '';
  }

  const supabaseProjectRef = getSupabaseProjectRef();
  if (!supabaseProjectRef || !supabaseDbUrl.includes('supabase.co')) {
    return supabaseDbUrl;
  }

  try {
    const parsed = new URL(supabaseDbUrl);
    const expectedHost = `db.${supabaseProjectRef}.supabase.co`;
    if (parsed.hostname !== expectedHost) {
      parsed.hostname = expectedHost;
      return parsed.toString();
    }
  } catch {
    return supabaseDbUrl;
  }

  return supabaseDbUrl;
}

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

function createPool() {
  const connectionString = getDatabaseUrl();
  const isSupabase = connectionString.includes('supabase.co');
  const poolConfig = {
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX) || 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    lookup(hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) {
      dns.lookup(hostname, { family: 4 }, callback);
    },
  };

  return new Pool(poolConfig as ConstructorParameters<typeof Pool>[0]);
}

export function getDbPool() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (!global.__docrudPgPool) {
    global.__docrudPgPool = createPool();
  }

  return global.__docrudPgPool;
}

let schemaReadyPromise: Promise<void> | null = null;

export async function ensureDatabaseSchema() {
  const pool = getDbPool();
  if (!pool) {
    return;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = fs.readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
      .then((sql) => pool.query(sql))
      .then(() => undefined);
  }

  await schemaReadyPromise;
}

export function getAppStateKey(filePath: string) {
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return `json:${relativePath}`;
}

export async function readAppState<T>(key: string): Promise<T | null> {
  const pool = getDbPool();
  if (!pool) {
    return null;
  }

  await ensureDatabaseSchema();
  const result = await pool.query<{ value: T }>('SELECT value FROM app_state WHERE key = $1 LIMIT 1', [key]);
  return result.rows[0]?.value ?? null;
}

export async function writeAppState<T>(key: string, value: T) {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database is not configured');
  }

  await ensureDatabaseSchema();
  await pool.query(
    `
      INSERT INTO app_state (key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, JSON.stringify(value)],
  );
}
