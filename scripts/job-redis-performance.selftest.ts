/**
 * Redis caching — correctness, isolation and graceful degradation.
 *
 * Driven through an IN-MEMORY fake that speaks the handful of commands the
 * cache layer uses (get/set/incr/del) and can be told to fail. That makes every
 * property below testable without a live Upstash instance — and it is the only
 * honest way to assert the failure paths, which a real Redis will not reproduce
 * on demand.
 *
 * What this defends:
 *   · a cache HIT never skips authorization — user-scoped keys cannot collide;
 *   · a mutation invalidates, and unrelated namespaces survive;
 *   · Redis being down degrades to computing, never to an error;
 *   · nothing secret and nothing unbounded reaches a key;
 *   · private surfaces are not cached at all.
 *
 * Run: npm run test:job-redis-performance
 */
import { readFileSync } from 'node:fs';
import {
  TTL, cached, cacheMetrics, invalidateNamespace, invalidateNamespaces,
  keyPart, namespaceVersion, resetCacheMetrics, __clearVersionCache,
} from '../lib/server/cache';
import { __setRedisClientForTests, redisStatus } from '../lib/server/redis';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

/* ── A Redis that lives in a Map, and can be told to break ───────────────*/

class FakeRedis {
  store = new Map<string, unknown>();
  ttls = new Map<string, number>();
  ops: string[] = [];
  failMode: 'none' | 'all' | 'reads' | 'writes' = 'none';

  private boom(kind: 'read' | 'write') {
    if (this.failMode === 'all') throw new Error('redis down');
    if (this.failMode === 'reads' && kind === 'read') throw new Error('redis read failed');
    if (this.failMode === 'writes' && kind === 'write') throw new Error('redis write failed');
  }
  async get<T>(key: string): Promise<T | null> {
    this.ops.push(`get ${key}`); this.boom('read');
    return (this.store.has(key) ? this.store.get(key) : null) as T | null;
  }
  async set(key: string, value: unknown, opts?: { ex?: number }) {
    this.ops.push(`set ${key}`); this.boom('write');
    this.store.set(key, value);
    if (opts?.ex) this.ttls.set(key, opts.ex);
    return 'OK';
  }
  async incr(key: string) {
    this.ops.push(`incr ${key}`); this.boom('write');
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, next);
    return next;
  }
  async del(key: string) {
    this.ops.push(`del ${key}`); this.boom('write');
    return this.store.delete(key) ? 1 : 0;
  }
}

const use = (r: FakeRedis | null) => {
  __setRedisClientForTests(r as never);
  __clearVersionCache();
  resetCacheMetrics();
};

async function main() {
  /* ═══ 1-3. MISS computes, HIT does not, TTL is applied ════════════════ */
  {
    const redis = new FakeRedis(); use(redis);
    let computed = 0;
    const load = () => cached(
      { ns: 'jobs:public', kind: 'list', params: { page: 1 }, ttlSeconds: TTL.publicList },
      async () => { computed += 1; return { items: [{ id: 'a' }], total: 1 }; },
    );
    const first = await load();
    check('a miss computes the value', computed === 1);
    check('and returns it', JSON.stringify(first) === '{"items":[{"id":"a"}],"total":1}');
    check('and records a miss', cacheMetrics().miss === 1);

    const second = await load();
    check('a second request does NOT recompute', computed === 1);
    check('and returns the identical payload', JSON.stringify(second) === JSON.stringify(first));
    check('and records a hit', cacheMetrics().hit === 1);

    const key = Array.from(redis.ttls.keys())[0];
    check('a TTL is applied', redis.ttls.get(key) === TTL.publicList);
    /* Read as plain numbers: the const-narrowed literal types would otherwise
       make tsc reject the comparison as provably constant. */
    const ttl: Record<string, number> = { ...TTL };
    check('TTLs are per-kind, not global',
      ttl.publicList !== ttl.employerList && ttl.publicDetail !== ttl.personalized);
    check('employer data has the shortest TTL',
      ttl.employerList < ttl.publicList && ttl.employerList < ttl.publicDetail);
    check('every TTL is a positive number of seconds',
      Object.values(ttl).every((v) => Number.isFinite(v) && v > 0));
  }

  /* ═══ 4-6. Invalidation, and unrelated namespaces surviving ═══════════ */
  {
    const redis = new FakeRedis(); use(redis);
    let publicRuns = 0, employerRuns = 0;
    const pub = () => cached({ ns: 'jobs:public', kind: 'list', params: { page: 1 }, ttlSeconds: 60 },
      async () => { publicRuns += 1; return { v: publicRuns }; });
    const emp = () => cached({ ns: 'jobs:employer', kind: 'list', params: { page: 1 }, ttlSeconds: 60, userId: 'u1' },
      async () => { employerRuns += 1; return { v: employerRuns }; });

    await pub(); await pub(); await emp(); await emp();
    check('both namespaces cached', publicRuns === 1 && employerRuns === 1);

    await invalidateNamespace('jobs:public');
    __clearVersionCache();
    await pub();
    check('invalidation forces a recompute', publicRuns === 2);
    await emp();
    check('an UNRELATED namespace survives invalidation', employerRuns === 1);

    /* One command, not a scan — the whole point of versioned invalidation. */
    const incrs = redis.ops.filter((o) => o.startsWith('incr')).length;
    check('invalidation costs exactly one command', incrs === 1);
    check('and never scans the keyspace',
      !redis.ops.some((o) => /scan|keys/i.test(o)));
    check('the version counter advanced', (await namespaceVersion('jobs:public')) === 1);
  }

  /* ═══ 7. Redis down → compute, never an error ═════════════════════════ */
  {
    const redis = new FakeRedis(); use(redis);
    redis.failMode = 'all';
    let computed = 0;
    /* Caught explicitly: a cache layer that THROWS on a Redis outage would take
       the route down, and asserting on the returned value alone cannot tell a
       thrown error from a wrong one — the suite would simply crash. */
    let outageError: unknown = null;
    let value: unknown = null;
    try {
      value = await cached({ ns: 'jobs:public', kind: 'list', params: { p: 1 }, ttlSeconds: 60 },
        async () => { computed += 1; return { ok: true }; });
    } catch (e) { outageError = e; }
    check('a total Redis outage does NOT throw', outageError === null);
    check('a total Redis outage still returns the value', JSON.stringify(value) === '{"ok":true}');
    check('by computing it', computed === 1);
    check('and the failure is counted', cacheMetrics().error > 0);

    /* A write failure must not lose the answer. */
    const r2 = new FakeRedis(); use(r2); r2.failMode = 'writes';
    let writeErr: unknown = null; let v2: unknown = null;
    try {
      v2 = await cached({ ns: 'jobs:public', kind: 'list', params: { p: 2 }, ttlSeconds: 60 },
        async () => ({ ok: 2 }));
    } catch (e) { writeErr = e; }
    check('a failed cache WRITE does NOT throw', writeErr === null);
    check('a failed cache WRITE still returns the computed value', JSON.stringify(v2) === '{"ok":2}');

    /* A read-only failure is the most common real outage shape. */
    const r3 = new FakeRedis(); use(r3); r3.failMode = 'reads';
    let readErr: unknown = null; let v3: unknown = null;
    try {
      v3 = await cached({ ns: 'jobs:public', kind: 'list', params: { p: 3 }, ttlSeconds: 60 },
        async () => ({ ok: 3 }));
    } catch (e) { readErr = e; }
    check('a failed cache READ does NOT throw', readErr === null);
    check('a failed cache READ falls back to computing', JSON.stringify(v3) === '{"ok":3}');

    /* Invalidation must not throw when Redis is down. */
    let threw = false;
    try { await invalidateNamespaces(['jobs:public', 'jobs:recs']); } catch { threw = true; }
    check('invalidation never throws when Redis is down', !threw);
  }

  /* ═══ Redis UNCONFIGURED → behaves exactly as before ══════════════════ */
  {
    use(null);
    let computed = 0;
    const v = await cached({ ns: 'jobs:public', kind: 'list', params: { p: 1 }, ttlSeconds: 60 },
      async () => { computed += 1; return { ok: 1 }; });
    check('with no Redis configured the value is still returned', JSON.stringify(v) === '{"ok":1}');
    check('and computed every time', computed === 1);
    check('and it is recorded as a skip, not an error', cacheMetrics().skip === 1 && cacheMetrics().error === 0);
    check('status reports why it is off', redisStatus().enabled === false && Boolean(redisStatus().reason));
    let threw = false;
    try { await invalidateNamespace('jobs:public'); } catch { threw = true; }
    check('invalidating an unconfigured cache is a no-op, not a throw', !threw);
  }

  /* ═══ 8, 12, 14. Isolation — a hit must never cross users ════════════ */
  {
    const redis = new FakeRedis(); use(redis);
    const forUser = (userId: string, value: string) => cached(
      { ns: 'jobs:personalized', kind: 'feed', params: { page: 1 }, ttlSeconds: 60, userId },
      async () => ({ owner: value }),
    );
    const a = await forUser('alice', 'alice-data');
    const b = await forUser('bob', 'bob-data');
    check('two users get their OWN payloads', (a as { owner: string }).owner === 'alice-data'
      && (b as { owner: string }).owner === 'bob-data');
    const aAgain = await forUser('alice', 'ignored-because-cached');
    check("and alice's cached answer is still hers", (aAgain as { owner: string }).owner === 'alice-data');

    const keys = Array.from(redis.store.keys()).filter((k) => k.includes('personalized') && !k.endsWith(':version'));
    check('user-scoped keys are distinct', new Set(keys).size === keys.length && keys.length === 2);
    check('every user-scoped key names its user', keys.every((k) => /:u:(alice|bob):/.test(k)));

    /* Two different parameter sets must not collide. */
    const k1 = keyPart({ page: 1, city: 'Bengaluru' });
    const k2 = keyPart({ page: 2, city: 'Bengaluru' });
    check('different parameters produce different keys', k1 !== k2);
    /* …and parameter ORDER must not. */
    check('parameter order does not change the key',
      keyPart({ a: 1, b: 2 }) === keyPart({ b: 2, a: 1 }));
    check('absent and empty parameters are equivalent',
      keyPart({ a: 1, b: undefined }) === keyPart({ a: 1 })
      && keyPart({ a: 1, b: '' }) === keyPart({ a: 1 }));
    /* A key is a fixed-length hash — never raw, unbounded, attacker input. */
    const hostile = keyPart({ q: 'x'.repeat(50_000) });
    check('a hostile parameter cannot make an unbounded key', hostile.length === 32);
    check('and the raw value never appears in it', !hostile.includes('xxxx'));
  }

  /* ═══ 13, 15. What must NEVER be cached ══════════════════════════════ */
  const cacheSrc = readFileSync('lib/server/cache.ts', 'utf8');
  const files: Array<[string, string]> = [
    ['resume', 'app/api/hiring/applications/[applicationId]/resume/route.ts'],
    ['status', 'app/api/hiring/applications/[applicationId]/status/route.ts'],
    ['contact', 'app/api/hiring/applications/[applicationId]/contact/route.ts'],
    ['applicants', 'app/api/hiring/jobs/[jobId]/applicants/route.ts'],
    ['my applications', 'app/api/me/applications/route.ts'],
    ['employer job detail', 'app/api/hiring/jobs/[jobId]/route.ts'],
  ];
  for (const [label, file] of files) {
    const src = readFileSync(file, 'utf8');
    check(`${label} is NOT Redis-cached`, !/from '@\/lib\/server\/cache'/.test(src));
  }
  /* The two public routes ARE cached. */
  for (const [label, file] of [
    ['public list', 'app/api/jobs/public/route.ts'],
    ['public detail', 'app/api/jobs/public/[jobId]/route.ts'],
  ] as Array<[string, string]>) {
    const src = readFileSync(file, 'utf8');
    check(`${label} IS Redis-cached`, /from '@\/lib\/server\/cache'/.test(src));
    check(`${label} reads no session`, !/getAuthSession|getSuperAdminSession/.test(src));
  }

  /* ═══ 10. A job write invalidates the public caches ═══════════════════ */
  const hiringSrc = readFileSync('lib/server/hiring.ts', 'utf8');
  check('saveHiringJobs invalidates the distributed caches',
    /invalidateNamespaces\(\[/.test(hiringSrc));
  check('it invalidates the public namespace', /'jobs:public'/.test(hiringSrc));
  check('and the recommendation namespaces',
    /'jobs:recs'/.test(hiringSrc) && /'jobs:personalized'/.test(hiringSrc));
  check('a cache failure cannot fail the database write',
    /\.catch\(\(\) => \{ \/\* a cache that cannot be cleared must not fail a save \*\/ \}\)/.test(hiringSrc));

  /* ═══ Credentials and payloads never leak ════════════════════════════ */
  const redisSrc = readFileSync('lib/server/redis.ts', 'utf8');
  check('Redis credentials are never NEXT_PUBLIC_', !/NEXT_PUBLIC_.*(REDIS|UPSTASH)/i.test(redisSrc));
  check('no credential is hardcoded',
    !/UPSTASH_REDIS_REST_TOKEN\s*=\s*['"][^'"]+['"]/.test(redisSrc));
  check('the token is never logged', !/console\.[a-z]+\([^)]*token/i.test(redisSrc));
  check('cached payloads are never logged', !/console\.[a-z]+\([^)]*value/i.test(cacheSrc));
  check('metrics expose counts only, never payloads',
    /hit: number; miss: number; error: number/.test(cacheSrc));

  console.log(`\n${passed} checks passed, ${failed} failed.`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
}

main();
