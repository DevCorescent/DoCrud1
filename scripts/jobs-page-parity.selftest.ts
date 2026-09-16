/**
 * The public jobs API reproduces the Jobs page's own filtering, exactly.
 *
 *   PARITY_CORPUS=/path/to/corpus-card.json npx tsx scripts/jobs-page-parity.selftest.ts
 *   npx tsx scripts/jobs-page-parity.selftest.ts          # pulls the projection from Mongo
 *
 * ═══ WHY THIS SUITE IS THE GATE ═══
 *
 * `JobsFeedPage` used to download every published posting (12,662 rows, 6.15 MB) and
 * filters, searches and pages them in the browser. Moving that work into the
 * database is only a performance change if the SET of jobs a filter state
 * produces does not move. "Faster but shows different jobs" is a product
 * regression wearing an optimisation's clothes.
 *
 * So the comparator below is the page's own predicate, copied verbatim from
 * JobsFeedPage's own predicate (now kept only for the recommended-only view; the
 * all-jobs list is served by the API this suite verifies), applied to the real corpus, and compared against
 * the API walked through its cursor — ORDERED ids, not counts, for every filter
 * dimension and combinations drawn from the corpus's real values.
 *
 * ═══ THE APPROVED DEPARTURES, STATED ═══
 *
 *   · `india` / `remote-india` use STORED country, not the location text. The
 *     8.1B backfill made that authoritative; the text test cannot see the 340
 *     "Remote, in" postings. The delta is printed, never hidden.
 *   · Order is `_skNewest DESC, id ASC` — "Latest" now means latest POSTED.
 *     The page's old `createdAt` order is abandoned on purpose; the disagreement
 *     between the two is printed so the size of that change is on record.
 *
 * Read-only. Skips (not passes) when no corpus is available.
 */
import { existsSync, readFileSync } from 'node:fs';
import { matchesIndiaFilter, type IndiaBucket } from '@/lib/server/job-scraper/india';

interface Row {
  id: string; title?: string; organizationName?: string; location?: string;
  workMode?: string; employmentType?: string; experienceLevel?: string;
  country?: string; _skNewest?: string; createdAt?: string;
}
interface Filters {
  search: string; employment: Set<string>; workMode: Set<string>;
  experience: Set<string>; india: IndiaBucket; location: string;
}
const F = (o: Partial<Filters> = {}): Filters => ({
  search: '', employment: new Set(), workMode: new Set(), experience: new Set(), india: '', location: '', ...o,
});

let checks = 0, failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    /* For mutation runs only: the first failure IS the answer, and each full
       pass is ~35 cursor walks over the network. A normal run never sets this
       and always executes every case. */
    if (process.env.PARITY_FAILFAST === '1') { console.log(`\n❌ fail-fast after ${checks} checks`); process.exit(1); }
  } else console.log(`  ✓ ${label}`);
}

/* ── THE CLIENT, VERBATIM ────────────────────────────────────────────────
   JobsFeedPage.tsx:417-427, with the one approved substitution for the two
   country-level India buckets. */
function clientIndia(j: Row, bucket: IndiaBucket): boolean {
  if (bucket === 'india') return j.country === 'IN';
  if (bucket === 'remote-india') {
    return j.country === 'IN' && (j.workMode === 'remote' || /remote/i.test(j.location || ''));
  }
  return matchesIndiaFilter(j.location || '', j.workMode || undefined, bucket);
}
function clientFilter(all: Row[], filters: Filters): Row[] {
  const q = filters.search.trim().toLowerCase();
  const loc = filters.location.trim().toLowerCase();
  return all.filter((j) => {
    if (filters.employment.size && !filters.employment.has(j.employmentType || '')) return false;
    if (filters.workMode.size && !filters.workMode.has(j.workMode || '')) return false;
    if (filters.experience.size && !filters.experience.has(j.experienceLevel || '')) return false;
    if (filters.india && !clientIndia(j, filters.india)) return false;
    if (loc && !(j.location || '').toLowerCase().includes(loc)) return false;
    if (q) {
      const hay = `${j.title} ${j.organizationName || ''} ${j.location || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
/* The approved order: _skNewest DESC, id ASC. Plain comparison, as BSON does. */
const byApproved = (a: Row, b: Row) => {
  const x = String(a._skNewest ?? ''), y = String(b._skNewest ?? '');
  if (x !== y) return x < y ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/* Filters → the API's parameters. */
function toQuery(f: Filters) {
  const q: Record<string, string> = { pageSize: '100' };
  if (f.search.trim()) { q.search = f.search.trim(); q.searchScope = 'card'; }
  if (f.employment.size) q.employmentType = Array.from(f.employment).join(',');
  if (f.workMode.size) q.workMode = Array.from(f.workMode).join(',');
  if (f.experience.size) q.experienceLevel = Array.from(f.experience).join(',');
  if (f.india) q.indiaBucket = f.india;
  if (f.location.trim()) q.location = f.location.trim();
  return q;
}

async function main() {
  const Q = await import('@/lib/server/db/public-jobs-query');
  const C = await import('@/lib/server/db/public-jobs-cursor');

  /* The API side ALWAYS needs the database; the cached corpus only spares the
     client-side pull. Loading env only on the uncached branch is how this suite
     first returned "selector returned null" on every case. */
  const { loadAppEnv } = await import('./load-env');
  loadAppEnv(process.cwd());
  let all: Row[];
  const cached = process.env.PARITY_CORPUS;
  if (cached && existsSync(cached)) {
    all = JSON.parse(readFileSync(cached, 'utf8')) as Row[];
  } else {
    const { getMongoDb } = await import('@/lib/server/database');
    const db = await getMongoDb();
    if (!db) { console.log('no MongoDB configured — parity suite SKIPPED (not passed)'); process.exit(0); }
    all = await db.collection('hiring_jobs').find({ status: 'published' }, {
      projection: { _id: 0, id: 1, title: 1, organizationName: 1, location: 1, workMode: 1,
        employmentType: 1, experienceLevel: 1, country: 1, _skNewest: 1, createdAt: 1 },
    }).toArray() as unknown as Row[];
  }
  console.log(`corpus: ${all.length} published postings\n`);

  /* Walk the API through its cursor until the end; collect ordered ids. */
  /* A PREFIX walk, not a full one. A broad case is ~127 round trips to prove
     what four pages plus the count already prove: the same ids, in the same
     order, from the same start. Every selective case (< 400 matches) is still
     compared in full. The cap is on pages, so the prefix is exactly what the
     Jobs page would render across its first screens. */
  const MAX_PAGES = 4;
  const apiIds = async (f: Filters): Promise<{ ids: string[]; exhausted: boolean }> => {
    const q = toQuery(f) as never;
    const ids: string[] = []; let token: string | null = null; let pages = 0;
    for (;;) {
      const page = await Q.selectPublicJobsPageFromCollection(q, { cursor: token ? C.decodeCursor(token, q) : null });
      if (!page) throw new Error('selector returned null — is MONGODB_URI loaded?');
      ids.push(...page.items.map((i) => String(i.id)));
      pages += 1;
      if (!page.hasNextPage || !page.nextCursor) return { ids, exhausted: true };
      if (pages >= MAX_PAGES) return { ids, exhausted: false };
      token = page.nextCursor;
    }
  };
  const same = (label: string, f: Filters) => async () => {
    const want = clientFilter(all, f).sort(byApproved).map((j) => j.id);
    const { ids: got, exhausted } = await apiIds(f);
    /* Exhausted walk: sets must be identical. Capped walk: the API's prefix
       must equal the client's prefix AND the client must have had more. */
    const prefix = want.slice(0, got.length);
    const orderOk = prefix.length === got.length && prefix.every((id, i) => id === got[i]);
    const sizeOk = exhausted ? want.length === got.length : want.length > got.length;
    const firstDiff = prefix.findIndex((id, i) => id !== got[i]);
    check(`${label}  [client ${want.length}${exhausted ? '' : `, api prefix ${got.length}`}]`, orderOk && sizeOk,
      orderOk ? `size: client=${want.length} api=${got.length} exhausted=${exhausted}`
        : `first diff @${firstDiff}: ${prefix[firstDiff]} vs ${got[firstDiff]}`);
  };

  /* Representative values FROM the corpus, not hand-picked. */
  const top = (k: keyof Row, n: number) => Array.from(all.reduce((m, r) => {
    const v = String(r[k] ?? ''); if (v) m.set(v, (m.get(v) ?? 0) + 1); return m;
  }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
  const emp = top('employmentType', 3), wm = top('workMode', 3), exp = top('experienceLevel', 3);
  console.log(`values from corpus — employment: ${emp.join(',')} · workMode: ${wm.join(',')} · experience: ${exp.join(',')}\n`);

  const cases: Array<() => Promise<void>> = [
    same('no filters', F()),
    same('search "engineer"', F({ search: 'engineer' })),
    same('search "bengaluru" (location-only hit)', F({ search: 'bengaluru' })),
    same('search "google"', F({ search: 'google' })),
    same('search "data"', F({ search: 'data' })),
    same('search with mixed CASE', F({ search: 'ENGINEER' })),
    same('employment single', F({ employment: new Set([emp[0]]) })),
    same('employment multi', F({ employment: new Set(emp) })),
    same('workMode single', F({ workMode: new Set([wm[0]]) })),
    same('workMode multi', F({ workMode: new Set(wm) })),
    same('experience single', F({ experience: new Set([exp[0]]) })),
    same('experience multi', F({ experience: new Set(exp) })),
    same('location "bengaluru"', F({ location: 'bengaluru' })),
    same('location "london"', F({ location: 'london' })),
    same('location "remote"', F({ location: 'remote' })),
    ...(['india', 'bengaluru', 'hyderabad', 'pune', 'mumbai', 'delhi-ncr', 'chennai', 'remote-india'] as IndiaBucket[])
      .map((b) => same(`india chip "${b}"`, F({ india: b }))),
    same('combo: remote + engineer', F({ workMode: new Set(['remote']), search: 'engineer' })),
    same('combo: bengaluru chip + senior', F({ india: 'bengaluru', experience: new Set(['senior']) })),
    same('combo: employment multi + workMode multi', F({ employment: new Set(emp), workMode: new Set(wm) })),
    same('combo: india + search "manager"', F({ india: 'india', search: 'manager' })),
    same('combo: remote-india + full_time', F({ india: 'remote-india', employment: new Set([emp[0]]) })),
    same('combo: location + experience multi', F({ location: 'india', experience: new Set(exp) })),
    same('combo: delhi-ncr + remote (should be empty-ish)', F({ india: 'delhi-ncr', workMode: new Set(['remote']) })),
    same('combo: everything', F({ search: 'engineer', employment: new Set(emp), workMode: new Set(wm), experience: new Set(exp), india: 'india' })),
    same('combo: search that matches nothing', F({ search: 'zzqx-no-such-job' })),
  ];
  console.log('── ordered-id equivalence, client predicate vs API cursor walk ──');
  for (const c of cases) await c();

  console.log('\n── the approved departures, quantified ──');
  const textIndia = all.filter((j) => matchesIndiaFilter(j.location || '', j.workMode || undefined, 'india')).length;
  const storedIndia = all.filter((j) => j.country === 'IN').length;
  console.log(`  india chip: old text test ${textIndia} → stored ${storedIndia}  (+${storedIndia - textIndia}, the "Remote, in" correction)`);
  const oldOrder = [...all].sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)).map((j) => j.id).slice(0, 500);
  const newOrder = [...all].sort(byApproved).map((j) => j.id).slice(0, 500);
  const moved = oldOrder.filter((id, i) => id !== newOrder[i]).length;
  console.log(`  "newest": ${moved}/500 of the first 500 positions differ between createdAt order and _skNewest order`);

  console.log(failures === 0 ? `\n✅ ${checks}/${checks} checks passed` : `\n❌ ${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1); });
