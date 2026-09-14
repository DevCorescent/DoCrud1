#!/usr/bin/env bash
#
# DoCrud cron runner — invokes ONE scheduled route over localhost.
#
#   run-cron-job.sh <job-name>
#
# The job name is looked up in ops/cron/jobs.conf, which owns every method,
# path, timeout and schedule. This script contains no per-job knowledge, so
# adding a job never means editing shell.
#
# ─── WHY THE SECRET GOES THROUGH STDIN ────────────────────────────────────────
# `curl -H "x-cron-secret: $SECRET"` puts the secret in the process argument
# list, where any user on the box can read it out of `ps auxww` for as long as
# the request runs. Instead the header is written to curl's config file on
# STDIN (`--config -`), which is never exposed in argv, never lands on disk, and
# never reaches the journal. The secret is not echoed, not traced (`set -x` is
# never enabled) and not included in any error message.
#
# ─── WHY THE FORWARDED HEADERS ARE SENT ───────────────────────────────────────
# Requests go to 127.0.0.1:3000, bypassing nginx — so nginx's usual
# X-Forwarded-* headers are absent. /api/cron/billing/reminders derives its
# email links from the REQUEST ORIGIN (getOriginForRequest in
# lib/server/request.ts), which without those headers falls back to
# `new URL(request.url).origin` — i.e. http://127.0.0.1:3000. That would send
# real customers a renewal email pointing at localhost. Supplying the forwarded
# pair reproduces exactly what nginx would have set. This changes no route
# semantics; it restores the context the route was written to expect.
#
# ─── EXIT CODES ───────────────────────────────────────────────────────────────
#   0  the route answered 2xx
#   1  usage / configuration error (unknown job, missing secret, bad conf)
#   2  the route answered non-2xx
#   3  the request failed to complete (timeout, connection refused)
#   4  another copy of this job is already running
#
set -euo pipefail

# Never enable xtrace here: it would print the config written to curl's stdin.
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly JOBS_CONF="${DOCRUD_JOBS_CONF:-${SCRIPT_DIR}/jobs.conf}"

# Where the app listens locally. Overridable for staging, never a public URL.
readonly BASE_URL="${DOCRUD_CRON_BASE_URL:-http://127.0.0.1:3000}"
# The public host the app should believe it is serving, for generated links.
readonly PUBLIC_HOST="${DOCRUD_PUBLIC_HOST:-www.docrud.com}"
readonly PUBLIC_PROTO="${DOCRUD_PUBLIC_PROTO:-https}"

readonly LOCK_DIR="${DOCRUD_CRON_LOCK_DIR:-/run/docrud-cron}"

log()  { printf '%s [docrud-cron] %s\n'        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { printf '%s [docrud-cron] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

usage() {
  fail "usage: $(basename "$0") <job-name>"
  if [[ -r "$JOBS_CONF" ]]; then
    fail "known jobs: $(grep -vE '^\s*(#|$)' "$JOBS_CONF" | cut -d'|' -f1 | tr '\n' ' ')"
  fi
  exit 1
}

[[ $# -eq 1 ]] || usage
readonly JOB="$1"

# A job name reaches a systemd unit name and a lock path, so it is validated
# rather than trusted — even though it is operator-supplied.
[[ "$JOB" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { fail "invalid job name: $JOB"; exit 1; }
[[ -r "$JOBS_CONF" ]] || { fail "cannot read jobs file: $JOBS_CONF"; exit 1; }

# ─── Look the job up ──────────────────────────────────────────────────────────
row="$(grep -vE '^\s*(#|$)' "$JOBS_CONF" | awk -F'|' -v j="$JOB" '$1 == j { print; exit }')"
[[ -n "$row" ]] || { fail "unknown job: $JOB"; exit 1; }

IFS='|' read -r _name METHOD PATH_ TIMEOUT _schedule DESCRIPTION <<<"$row"

[[ "$METHOD" == "GET" || "$METHOD" == "POST" ]] || { fail "bad method for $JOB: $METHOD"; exit 1; }
[[ "$PATH_" == /* ]]                            || { fail "path must be absolute: $PATH_"; exit 1; }
[[ "$TIMEOUT" =~ ^[0-9]+$ ]]                    || { fail "bad timeout for $JOB: $TIMEOUT"; exit 1; }

# ─── The secret ───────────────────────────────────────────────────────────────
# Supplied by systemd's EnvironmentFile (/etc/docrud/cron.env, root:root 0600).
# Only its PRESENCE is ever reported.
if [[ -z "${CRON_SECRET:-}" ]]; then
  fail "CRON_SECRET is not set — refusing to call $PATH_ unauthenticated."
  fail "See ops/README.md: create /etc/docrud/cron.env and reference it from the unit."
  exit 1
fi

# ─── Overlap protection ───────────────────────────────────────────────────────
# systemd already refuses to start a Type=oneshot service that is still running,
# which covers the timer path. flock additionally covers a manual run racing a
# timer-driven one — the case systemd cannot see.
#
# A FIXED descriptor (9), not bash's `exec {fd}>` form: the named-descriptor
# syntax needs bash >= 4.1, and macOS still ships bash 3.2, where it is parsed
# as a command called `{lock_fd}` and exits 127 — before curl is ever reached.
# Production is Ubuntu with bash 5, but a runner that cannot be executed on a
# developer's machine cannot be tested before it is installed.
#
# flock is util-linux and is absent on macOS. Its absence DEGRADES rather than
# fails: systemd's Type=oneshot is the primary guard and is unaffected, so the
# right response is a warning, not a refusal to run the job.
readonly LOCK_FILE="${LOCK_DIR}/${JOB}.lock"
mkdir -p "$LOCK_DIR" 2>/dev/null || true

if command -v flock >/dev/null 2>&1; then
  if exec 9>"$LOCK_FILE" 2>/dev/null; then
    if ! flock -n 9; then
      log "$JOB is already running elsewhere — skipping this tick (not an error)."
      exit 4
    fi
  else
    fail "could not open lock file $LOCK_FILE — continuing under systemd's guard alone."
  fi
else
  log "flock unavailable on this host — relying on systemd Type=oneshot alone."
fi

# ─── Invoke ───────────────────────────────────────────────────────────────────
readonly URL="${BASE_URL}${PATH_}"
log "start job=$JOB method=$METHOD url=$URL timeout=${TIMEOUT}s — ${DESCRIPTION}"

started=$(date +%s)
body_file="$(mktemp)"
# shellcheck disable=SC2064  # expand now: the path must be fixed at trap time.
trap "rm -f '$body_file'" EXIT

# --config - reads options from stdin, keeping the header out of argv.
# --max-redirs 0 with no -L: a redirect is a misconfiguration, not something to
# follow with a secret attached.
set +e
http_code="$(
  printf 'header = "x-cron-secret: %s"\n' "$CRON_SECRET" \
  | curl --config - \
      --silent --show-error \
      --request "$METHOD" \
      --max-time "$TIMEOUT" \
      --connect-timeout 10 \
      --max-redirs 0 \
      --header "X-Forwarded-Proto: ${PUBLIC_PROTO}" \
      --header "X-Forwarded-Host: ${PUBLIC_HOST}" \
      --header 'Accept: application/json' \
      --header 'User-Agent: docrud-cron/1.0' \
      --output "$body_file" \
      --write-out '%{http_code}' \
      "$URL" 2>>"$body_file"
)"
curl_status=$?
set -e

elapsed=$(( $(date +%s) - started ))

if [[ $curl_status -ne 0 ]]; then
  # curl's own message may name the URL but never the header — the secret was
  # only ever on stdin.
  fail "job=$JOB request failed after ${elapsed}s (curl exit $curl_status): $(head -c 300 "$body_file" | tr '\n' ' ')"
  exit 3
fi

if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
  fail "job=$JOB HTTP $http_code after ${elapsed}s: $(head -c 300 "$body_file" | tr '\n' ' ')"
  case "$http_code" in
    401) fail "hint: CRON_SECRET does not match the value the app is running with." ;;
    503|400) fail "hint: the app reports CRON_SECRET is not configured in ITS environment (PM2), not just here." ;;
  esac
  exit 2
fi

log "ok job=$JOB http=$http_code duration=${elapsed}s response=$(head -c 300 "$body_file" | tr '\n' ' ')"
