# Job source inventory

## What is here

`verified-boards.txt` — every public ATS board DoCrud is configured to read,
one per line. **Every entry was confirmed against the live endpoint**: HTTP 200,
parsed by the existing adapter, at least one posting returned.

That verification is not ceremony. Of 164 plausible candidates probed while
building this list, **69 were wrong** — mostly HTTP 404, because the company
uses a different slug or a different ATS entirely. A wrong slug is not a
harmless typo: the fetcher spends three attempts and ~37 s on it *every run*,
and the board shows as permanently failing in the console.

## Re-verifying

```bash
npm run scrape:sources:probe -- --file data/job-sources/verified-boards.txt
```

Read-only: no ingestion, no database, no lease. It resolves each board through
the same registry and adapters the real scraper uses, so a board that probes
clean behaves identically in a real run.

## Turning the inventory into configuration

The probe prints ready-to-paste environment lines for every board that
returned postings — and only those. Capture them with:

```bash
npm run scrape:sources:probe -- --file data/job-sources/verified-boards.txt \
  | sed -n '/── Verified configuration ──/,$p' | tail -n +2
```

That yields `GREENHOUSE_BOARDS=…`, `LEVER_COMPANIES=…`, `ASHBY_JOB_BOARDS=…`,
`SMARTRECRUITERS_COMPANIES=…`.

**Appending to an existing environment must PRESERVE the values already there.**
Production has historically carried boards that are not mirrored in this repo;
overwriting the variable rather than merging it silently drops them.

## Measured cost of the full inventory

One complete run over all 87 boards, measured locally against the real
production corpus with `commit:false` (no writes):

| | whole-corpus path (default) |
|---|---:|
| boards attempted / ok / failed | 87 / 87 / 0 |
| discovered | 10,477 |
| duplicates within the run | **0** |
| identity basis | 100% `external_id` |
| corpus load | 235,518 ms |
| ingestion (fetch + normalize + plan) | 96,326 ms |
| **total** | **331,844 ms (5m32s)** |
| peak heap | 279 MB |

Two things that matter for rollout:

1. **The load, not the scraping, is the cost.** 71% of the run is reading the
   existing corpus before a single board is fetched. That cost grows with the
   corpus, and this run would ADD ~8,642 postings — so the next run's load is
   larger again. `INGEST_INCREMENTAL_LOOKUP` exists for exactly this and is the
   subject of the scale phase; it is OFF by default and must stay off until
   measured in production.

2. **The headroom is real but finite.** `TimeoutStartSec=840` and a 900 s lease
   TTL against a measured 332 s run leaves room today. It will not survive the
   corpus doubling twice. Re-measure before raising the board count again.
