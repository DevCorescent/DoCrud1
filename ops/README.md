# DoCrud scheduled jobs (EC2 / systemd)

## The problem this solves

DoCrud has four scheduled routes under `app/api/cron/`. Until now **none of
them ran in production.** Two independent faults:

1. `vercel.json` scheduled two of the four — but production is EC2 behind
   nginx, not Vercel, so those crons never fired. The other two were scheduled
   nowhere at all.
2. `CRON_SECRET` is not set in the production environment. Verified from
   outside: `GET /api/cron/account-cleanup` returns **503**, and
   `lib/server/cron-auth.ts` returns `missing-secret-config` — the only reason
   mapped to 503 — solely when the variable is empty.

So mail campaign dispatch, recommendation refresh, account cleanup and billing
reminders have all been inert. Both faults must be fixed: installing the timers
without setting `CRON_SECRET` gets you 401/503 every tick instead of silence.

## Architecture

```
systemd timer            docrud-cron-<job>.timer     (schedule)
      ↓
systemd service          docrud-cron@<job>.service   (one template, Type=oneshot)
      ↓
runner                   ops/cron/run-cron-job.sh <job>
      ↓  looks the job up in ops/cron/jobs.conf
      ↓  x-cron-secret via curl --config on STDIN (never argv)
      ↓
HTTP                     http://127.0.0.1:3000/api/cron/...
      ↓
existing route → existing lib/server business logic
```

No business logic is reimplemented. The scheduler only calls routes that
already exist, so there remains exactly one code path per job.

## What is scheduled

`ops/cron/jobs.conf` is the single source of truth. `npm run test:cron-scheduler`
fails if it disagrees with the timers or the routes.

| Job | Method | Route | Schedule (UTC) | Timeout | Route `maxDuration` | Concurrency |
|---|---|---|---|---|---|---|
| `mail` | POST | `/api/cron/mail` | every 5 min | 90 s | 60 s | self-guarded (`claimCampaign` → `skipped`) |
| `recommendations` | POST | `/api/cron/recommendations` | every 5 min | 330 s | 300 s | self-guarded (single-flight → `locked`) |
| `account-cleanup` | GET | `/api/cron/account-cleanup` | daily 04:17 | 120 s | none | **not self-guarded** — relies on systemd + flock |
| `billing-reminders` | GET | `/api/cron/billing/reminders` | daily 06:23 | 180 s | none | **not self-guarded** — relies on systemd + flock |

All schedules are UTC, so they do not move with server locale or DST.
`RandomizedDelaySec` keeps two jobs from starting on the same second.

### Why the timeouts are what they are

Each timeout must **exceed** the route's own `maxDuration`, or the scheduler
kills a request the application still considers healthy and you get a
misleading failure in the journal. The self-test enforces this.

### Overlap protection

Two layers, no new infrastructure:

- **systemd** will not start a `Type=oneshot` service that is still running. A
  timer tick during a long run is dropped. For `recommendations` — a 5-minute
  timer on a job allowed 5 minutes — occasional skipping is expected and
  correct, not a fault.
- **`flock`** in the runner covers what systemd cannot see: a manual run racing
  a timer-driven one. Exit code 4 means "already running", and is not an error.

`account-cleanup` read-modify-writes JSON stores with no internal lock, and
`billing-reminders` checks the outbox before sending. Both are safe run
*repeatedly*, neither is safe run *concurrently* — hence the two layers.

## Secret handling

`CRON_SECRET` lives in `/etc/docrud/cron.env`, root-owned, mode 0600, outside
the repository. systemd reads it as root before dropping to `User=ubuntu`, so
the app user never needs read access to the file.

The runner passes it to curl through **stdin** (`curl --config -`), not
`-H`. With `-H` the secret sits in the process argument list, readable by any
local user via `ps auxww` for as long as the request runs. It is never echoed,
never traced (`set -x` is never enabled), and never placed in a query string —
`/api/cron/billing/reminders` still *accepts* `?secret=`, but this scheduler
never uses that form, because a query string lands in access logs and `Referer`
headers. See "Follow-ups".

## Installation on EC2

None of the following is run automatically. Steps 1–7 are safe; step 8 is
labelled because it actually executes a job.

### 1. Verify the files are present

```bash
cd /home/ubuntu/docrud
git status --short
ls -l ops/cron/run-cron-job.sh ops/systemd/
test -x ops/cron/run-cron-job.sh && echo "runner is executable" || chmod +x ops/cron/run-cron-job.sh
bash -n ops/cron/run-cron-job.sh && echo "runner parses cleanly"
```

### 2. Confirm the app has a CRON_SECRET of its own

The scheduler's secret must match the one the **Next.js process** is running
with. Check whether PM2 has it (prints only presence, never the value):

```bash
pm2 env 0 | grep -q '^CRON_SECRET=' && echo "PM2 HAS CRON_SECRET" || echo "PM2 IS MISSING CRON_SECRET"
```

If it is missing, add it to the app's environment first and restart the app
**once** — otherwise every timer tick will log 503. Generate one with:

```bash
openssl rand -base64 32
```

### 3. Create the secret file

```bash
sudo install -d -m 0755 -o root -g root /etc/docrud
sudo install -m 0600 -o root -g root /dev/null /etc/docrud/cron.env
sudo -e /etc/docrud/cron.env     # add: CRON_SECRET=<the same value the app uses>
sudo chmod 0600 /etc/docrud/cron.env
sudo ls -l /etc/docrud/cron.env  # expect -rw------- root root
```

Use `ops/systemd/cron.env.example` as the template. Do not paste the secret on
a shell command line — it would land in `~/.bash_history`.

### 4. Install the units

```bash
sudo cp /home/ubuntu/docrud/ops/systemd/docrud-cron@.service /etc/systemd/system/
sudo cp /home/ubuntu/docrud/ops/systemd/docrud-cron-*.timer  /etc/systemd/system/
sudo chown root:root /etc/systemd/system/docrud-cron*
sudo chmod 0644 /etc/systemd/system/docrud-cron*
sudo systemctl daemon-reload
```

### 5. Verify before enabling

```bash
systemd-analyze verify /etc/systemd/system/docrud-cron@.service
for t in mail recommendations account-cleanup billing-reminders; do
  systemd-analyze calendar "$(grep OnCalendar /etc/systemd/system/docrud-cron-$t.timer | cut -d= -f2)"
done
```

### 6. Enable the timers

```bash
sudo systemctl enable --now docrud-cron-mail.timer
sudo systemctl enable --now docrud-cron-recommendations.timer
sudo systemctl enable --now docrud-cron-account-cleanup.timer
sudo systemctl enable --now docrud-cron-billing-reminders.timer
```

### 7. Confirm they are armed

```bash
systemctl list-timers 'docrud-cron-*' --all
```

`NEXT` and `LEFT` should be populated for all four.

### 8. PRODUCTION EXECUTION — validate one job by hand

> **⚠️ PRODUCTION EXECUTION.** Everything below actually runs a job against
> production. `mail` may send real campaign email; `billing-reminders` may send
> real customer email; `account-cleanup` **permanently deletes accounts**.

Start with the safest job. `recommendations` writes only derived
recommendation data and sends nothing:

```bash
sudo systemctl start docrud-cron@recommendations.service
journalctl -u 'docrud-cron@recommendations.service' -n 50 --no-pager
```

Expect an `ok job=recommendations http=200` line. Only then consider the
others. **Do not** hand-run `account-cleanup` to "test" it — let its daily
timer fire, and read the journal afterwards.

## Operating

```bash
# status of every timer
systemctl list-timers 'docrud-cron-*' --all

# logs for one job (follow)
journalctl -u 'docrud-cron@mail.service' -f

# logs for every job, last hour
journalctl -u 'docrud-cron@*' --since '1 hour ago' --no-pager

# failures only
journalctl -u 'docrud-cron@*' -p err --since today --no-pager

# disable one job
sudo systemctl disable --now docrud-cron-billing-reminders.timer

# re-read units after editing
sudo systemctl daemon-reload
```

## Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| `HTTP 401` | The scheduler's secret ≠ the app's secret | Compare `/etc/docrud/cron.env` with the app's env; restart the app after changing its value |
| `HTTP 503` / `400` | The **app** has no `CRON_SECRET` | Set it in the app's environment (step 2) and restart the app |
| `HTTP 404` | Route renamed or removed | Run `npm run test:cron-scheduler` — it detects exactly this |
| exit 3, "request failed" | App not listening on 127.0.0.1:3000 | `pm2 status`; check the port |
| exit 4, "already running" | Previous run still in flight | Not an error. Persistent for `recommendations` → lengthen its schedule to `*:0/15` |
| Timer shows no `NEXT` | Not enabled | `sudo systemctl enable --now <timer>` |
| Nothing in the journal at all | Units not installed or `daemon-reload` skipped | Repeat step 4 |

## Changing a schedule

Edit **both** `ops/cron/jobs.conf` and the matching `ops/systemd/*.timer`, then
run `npm run test:cron-scheduler` — it fails if the two disagree. Copy the timer
to `/etc/systemd/system/` and `daemon-reload`.

## Adding a job

1. Add a row to `ops/cron/jobs.conf`.
2. Add `ops/systemd/docrud-cron-<name>.timer` (copy an existing one).
3. `npm run test:cron-scheduler` — it verifies the route exists, exports that
   method, is authenticated, and that the timeout exceeds its `maxDuration`.

No shell needs editing; the runner and the service template are job-agnostic.

## Follow-ups (not addressed here)

- `/api/cron/billing/reminders` does not use the shared `lib/server/cron-auth.ts`:
  it compares the secret with `!==` rather than a constant-time comparison, and
  it still accepts `?secret=` in the query string. This scheduler avoids the
  query form, but the route should be migrated to `checkCronAuth`.
- That route returns **400** where the others return **503**/**401** for the
  same condition.
- `app/api/admin/billing/reminders/run 2/route.ts` is a duplicate file in a live
  route directory, alongside the previously reported
  `app/api/resumes/[id]/analysis/route 2.ts`.
