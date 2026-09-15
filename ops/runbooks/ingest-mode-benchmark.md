# Benchmark: whole-corpus vs incremental candidate lookup

Run this **on EC2**, not on a laptop. The question it answers is a network one,
and the two environments disagree by two orders of magnitude of RTT.

## Why

Production run `run-mu2l3k07-829c9e58` (2026-09-15T11:24:10Z) attempted **zero**
of 93 sources. The whole-corpus read in front of the source loop took longer
than the entire source window:

| | |
|---|---:|
| corpus | 12,659 documents / 69.8 MB |
| measured corpus load | 809,384 ms |
| source window (`780,000 − reserve`) | 583,092 ms |
| total source work, when it runs | ~6,350 ms for 7 boards |

`INGEST_INCREMENTAL_LOOKUP=true` removes that read. Whether it is actually
faster depends on RTT, because it trades one large read for one round trip per
source:

| environment | RTT | result |
|---|---|---|
| developer laptop → Atlas | ~200 ms | whole-corpus **won** (332 s vs 627 s) |
| EC2 → same-region Atlas | ~1 ms | **expected** to invert — unmeasured |

Do not enable the flag on the expectation. Measure it.

## Safety

- The bench runs `commit: false`. Nothing is written to `hiring_jobs`, to
  `app_state`, or to the run history.
- It **does** fetch the real boards. Run it when no scheduled run is in flight.
- It never prints a connection string; it prints host and database name only.

## Procedure

```bash
# 1. Confirm no run is in flight and the timer is off.
systemctl status docrud-job-scraper.timer
systemctl status docrud-job-scraper.service

# 2. Confirm which cluster you are pointed at. Host only, never the URI.
cd /home/ubuntu/docrud
node -e 'const u=process.env.MONGODB_URI||"";console.log(/^mongodb(?:\+srv)?:\/\/(?:[^@]*@)?([^\/?]+)/.exec(u)?.[1])'

# 3. Run both arms. Nothing is written.
npm run bench:ingest-mode 2>&1 | tee /tmp/ingest-mode-$(date +%s).log
```

## Reading the result

The bench prints both arms side by side and ends with two verdicts:

```
  fits inside the source window?
                                          YES/NO          YES/NO

  plans agree: YES / NO — DO NOT ENABLE, investigate
```

**`plans agree` is the gate, not speed.** The two modes must produce identical
`discovered` / `would insert` / `would update`. A faster mode that plans
different work is not a win — it is the duplicate-posting defect the equivalence
self-test exists to catch, showing up against real data.

Enable the flag only if **both** hold:

1. `plans agree: YES`
2. incremental `total` is materially lower **and** fits inside the source window

## If it qualifies

```bash
# Add to .env (NOT to git):
INGEST_INCREMENTAL_LOOKUP=true

# The worker is a systemd oneshot that loads .env itself. It does NOT need a
# PM2 restart — restart PM2 only if Next.js application code changed.
sudo systemctl start docrud-job-scraper.service
journalctl -u docrud-job-scraper.service -n 200 --no-pager
```

Then confirm on the next real run that `sources attempted` is non-zero and
`deadlineSkipped` has fallen. Leave the timer off until two consecutive runs
look right.

## If it does not qualify

Leave the flag off and report the numbers. The corpus load still has to come out
of the critical path — the next candidate is bounding it inside the budget so a
slow load degrades into a partial run instead of an empty one. That is a
separate change and a separate approval.
