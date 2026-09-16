# P2.9 — Public jobs query scalability (A: query restructuring, B: indexes, C: persisted India bucket, D: counts)

## What changed and why

The listing pipeline was already index-ordered and cursor-seekable (21 keys / 21 docs at any depth),
but every FILTER was an `$expr` wrapped in `$toLower/$trim/$indexOfCP/$switch`, which MongoDB cannot
turn into index bounds. Measured on the real corpus (12,659 published, audit of 2026-09-16):

| query | returned | docs examined | ms |
|---|---|---|---|
| India | 21 | 211 | 20 |
| remote India | 21 | 1,001 | 95 |
| Delhi NCR | 21 | 1,358 | 704 |
| worst combined (0 matches) | 0 | 12,659 | 1,999 |
| zero-result search | 0 | 12,659 | 1,926 |
| filtered count (workMode remote) | 3,342 | 12,659 | 111 |

* **A** — `lib/server/db/public-jobs-query.ts` `buildPublicJobsMatch()` splits each query into plain
  predicates (index-safe) and a residual `$expr`. Plain: `status`, the active predicate, `workMode`,
  `employmentType`, `experienceLevel`, `domain` (stored values proven lower-cased/trimmed — 0 exceptions),
  `country` (stored upper-case ISO; request value upper-cased). Residual `$expr`: search, `location`,
  `state` (1,152 mixed-case values), `subDomain`, `city`, `minSalary`, freshness.
  `buildPublicJobsConditions` (the all-`$expr` form) is untouched: it still serves the app_state array
  pipeline and is the ORACLE every equivalence test compares against.
* **C** — `lib/server/db/public-india-bucket.ts` persists `_indiaBucket` (P2B's chip semantics computed
  once at write time; both write sites in `hiring-jobs-collection.ts` spread it next to the sort keys).
  `india` chip stays `{ country: 'IN' }`; `remote-india` / city / `delhi-ncr` read the field.
* **B** — `scripts/db-indexes-p29.mjs` (plan-only unless `--apply`): `published_country_newest`,
  `published_workmode_newest`, `published_indiabucket_newest` — each `{status, <field>, _skNewest, id}` so
  the index bounds the scan AND provides the order (no blocking SORT).
* **D** — `countPublicJobs` uses the same split; indexed predicates count keys ≈ matches instead of the corpus.

## Deploy order (DB first — the same rule as the `_sk*` cutover)

1. `npx tsx scripts/db-backfill-india-bucket.ts` — dry run; expect `missing field = published count`.
2. `npx tsx scripts/db-backfill-india-bucket.ts --apply` — writes one field per row, ledgered to
   `data/india-bucket-ledger-<ts>.json`; re-verifies every row; must print `COMPLETENESS GATE: PASS`.
3. `node scripts/db-indexes-p29.mjs --apply` — background index builds (idempotent).
4. Deploy the code. Until 2 has PASSED, the remote-india / city / Delhi-NCR chips on a deployment of this
   code return 0 rows (field absent) — do not deploy before the gate.
5. Verify: `npx tsx scripts/db-backfill-india-bucket.ts --verify` and the explain rows in
   `scripts/public-jobs-predicates.selftest.ts` (run with `P29_CORPUS=<corpus.json>`).

## Rollback

* Code: revert; `buildPublicJobsConditions` never changed, so the previous pipeline is exactly the old one.
* Field: `$unset` `_indiaBucket` on the ledger ids (harmless if left in place — nothing else reads it).
* Indexes: `dropIndex` the three names above (harmless if left in place).

## Not done in P2.9, deliberately

* employmentType / experienceLevel indexes (99.3% full_time; 5 levels) — no measured benefit.
* Search index: substring search stays O(N) on zero/rare results (projected ~160 s at 1M). Decision
  deferred; `$text` changes semantics, Atlas Search is new infrastructure.
* Dropping `published_newest/_salary/_relevance` (legacy raw-field trio, 4.1 MB) — verify other callers first.
* JobsFeedPage migration (P2D) and the `view=card` projection (P2.9-E, ships with P2D).

## Evidence

See the P2.9 report in the session log; the committed proofs are
`scripts/public-india-bucket.selftest.ts`, `scripts/public-jobs-predicates.selftest.ts` (equivalence +
explain gates), `scripts/filter-scale.bench.ts` (synthetic 12.6K→1M), and the unchanged
`jobs-page-parity` / `public-jobs-cursor` / `public-jobs-equivalence` suites.
