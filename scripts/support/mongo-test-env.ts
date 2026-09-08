/**
 * An isolated MongoDB for tests that exercise canonical job persistence.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * Phase 2.7 made MongoDB the canonical store for hiring jobs, so a test that
 * exercises a job write has to reach a real database. It must not be the
 * developer's Atlas cluster: that is production data, and a test that mutates
 * it is an incident waiting for a bad day.
 *
 * `mongodb-memory-server` provides a real mongod — real indexes, real bulk
 * writes, real `$setOnInsert` — on a random port, backed by a temporary
 * directory that disappears when the process exits. It is a real database, not
 * a mock, which matters here: the behaviour under test IS the database's.
 *
 * ═══ IT MUST BE IMPOSSIBLE TO HIT PRODUCTION ═══
 *
 * `start()` OVERWRITES `MONGODB_URI` with the in-memory server's address and
 * points `MONGODB_DB` at a per-run database name. Whatever `.env` contained is
 * saved and restored by `stop()`, and is never read, logged, or connected to
 * while the harness is running.
 *
 * ═══ USAGE ═══
 *
 *     const mongo = await startTestMongo();
 *     try { ...the test... } finally { await mongo.stop(); }
 *
 * `start()` must run BEFORE anything imports a module that reads MONGODB_URI at
 * import time, which is why callers set it up at the very top of a suite.
 */
import type { MongoMemoryServer } from 'mongodb-memory-server';

export interface TestMongo {
  uri: string;
  dbName: string;
  stop: () => Promise<void>;
}

/** Distinct per run, so two suites in one CI job cannot see each other's data. */
function testDbName(): string {
  return `docrud_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function startTestMongo(): Promise<TestMongo> {
  /* Imported lazily so a suite that never needs a database does not pay the
     cost of loading the package. */
  const { MongoMemoryServer } = await import('mongodb-memory-server');

  const previousUri = process.env.MONGODB_URI;
  const previousDb = process.env.MONGODB_DB;
  const previousEnv = process.env.NODE_ENV;

  let server: MongoMemoryServer;
  try {
    server = await MongoMemoryServer.create();
  } catch (error) {
    /* A download failure or a missing binary must say so plainly rather than
       leaving the suite to fail later with a confusing connection error. */
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `could not start an isolated MongoDB for tests: ${message}\n`
      + 'mongodb-memory-server downloads a mongod binary on first use; '
      + 'a network-restricted environment may need MONGOMS_DOWNLOAD_MIRROR or a cached binary.',
    );
  }

  const dbName = testDbName();
  /* The production URI is REPLACED, not merged. Nothing downstream can reach
     Atlas while this is set. */
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = dbName;
  /* Cast: Next's types declare NODE_ENV readonly, but a test harness setting
     its own environment is exactly the case that needs it. */
  (process.env as Record<string, string>).NODE_ENV = 'test';

  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  };

  return {
    uri: server.getUri(),
    dbName,
    stop: async () => {
      await server.stop();
      restore('MONGODB_URI', previousUri);
      restore('MONGODB_DB', previousDb);
      restore('NODE_ENV', previousEnv);
    },
  };
}

/** True when the current process is pointed at an isolated test database. */
export function isIsolatedTestMongo(): boolean {
  const uri = process.env.MONGODB_URI ?? '';
  const db = process.env.MONGODB_DB ?? '';
  return uri.startsWith('mongodb://127.0.0.1:') && db.startsWith('docrud_test_');
}
