/**
 * Cron scheduler — configuration self-test.
 *
 * WHY THIS EXISTS. The scheduler is spread across three kinds of file: a
 * declarative table (ops/cron/jobs.conf), systemd timers, and the Next.js
 * routes they call. Nothing in the language connects them, so the failure mode
 * is silent drift — a timer for a route that was renamed, a timeout shorter
 * than the route's own maxDuration, a job added to the table with no timer to
 * fire it. Every one of those produces a scheduler that looks installed and
 * quietly does nothing, which is exactly the state production is in today.
 *
 * NO PRODUCTION ENDPOINT IS CALLED. This is pure static analysis over the
 * repository: it reads files and asserts they agree. It makes no network
 * request, needs no secret, and cannot trigger a job.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

interface Job {
  name: string; method: string; path: string;
  timeout: number; schedule: string; description: string;
}

function parseJobs(): Job[] {
  return read('ops/cron/jobs.conf')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const [name, method, p, timeout, schedule, description] = line.split('|');
      return { name, method, path: p, timeout: Number(timeout), schedule, description };
    });
}

function main() {
  console.log('\n── 1. jobs.conf is well-formed ──');

  const jobs = parseJobs();
  check('at least one job is configured', jobs.length > 0, `${jobs.length}`);
  check('every row has all six fields',
    jobs.every((j) => j.name && j.method && j.path && j.timeout && j.schedule && j.description));
  check('job names are safe as systemd instance names',
    jobs.every((j) => /^[a-z0-9][a-z0-9-]*$/.test(j.name)),
    jobs.map((j) => j.name).join(','));
  check('job names are unique', new Set(jobs.map((j) => j.name)).size === jobs.length);
  check('every method is GET or POST', jobs.every((j) => j.method === 'GET' || j.method === 'POST'));
  check('every path is absolute', jobs.every((j) => j.path.startsWith('/api/')));
  check('every timeout is a positive integer', jobs.every((j) => Number.isInteger(j.timeout) && j.timeout > 0));

  console.log('\n── 2. Every configured route actually exists and exports that method ──');

  for (const job of jobs) {
    const routeFile = path.join('app', `${job.path}`, 'route.ts');
    const exists = existsSync(path.join(ROOT, routeFile));
    check(`${job.name}: ${routeFile} exists`, exists);
    if (!exists) continue;

    const src = read(routeFile);
    const exported =
      new RegExp(`export\\s+async\\s+function\\s+${job.method}\\b`).test(src)
      || new RegExp(`export\\s+const\\s+${job.method}\\s*=`).test(src);
    check(`${job.name}: route exports ${job.method}`, exported);

    /* The timeout must exceed the route's own maxDuration, or the scheduler
       kills a job the application still considers healthy. */
    const maxDuration = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/)?.[1];
    if (maxDuration) {
      check(`${job.name}: timeout ${job.timeout}s > route maxDuration ${maxDuration}s`,
        job.timeout > Number(maxDuration), `timeout must exceed ${maxDuration}`);
    } else {
      console.log(`  – ${job.name}: route declares no maxDuration (timeout ${job.timeout}s is the only bound)`);
    }

    /* Every scheduled route must be authenticated. An unauthenticated cron
       route is a public button for sending mail or deleting accounts. */
    check(`${job.name}: route requires a cron secret`,
      src.includes('checkCronAuth') || src.includes('CRON_SECRET'));
  }

  console.log('\n── 3. jobs.conf and the systemd timers agree ──');

  const unitDir = path.join(ROOT, 'ops/systemd');
  /* Scoped to the `docrud-cron-` prefix, which is what jobs.conf governs.
     jobs.conf describes HTTP jobs invoked by run-cron-job.sh; the job scraper
     is deliberately NOT one of those (it runs the pipeline as a process, so
     that neither nginx's read timeout nor the route's 300 s ceiling applies),
     so it has its own unit and is asserted separately below. Counting every
     *.timer here would have made adding any non-HTTP worker fail this check
     for the wrong reason. */
  const allTimers = readdirSync(unitDir).filter((f) => f.endsWith('.timer'));
  const timers = allTimers.filter((f) => f.startsWith('docrud-cron-'));
  check('one docrud-cron- timer per configured job', timers.length === jobs.length,
    `${timers.length} timers vs ${jobs.length} jobs`);
  /* No timer may exist that neither jobs.conf nor this test knows about — the
     drift this section exists to catch. */
  const KNOWN_WORKER_TIMERS = ['docrud-job-scraper.timer'];
  for (const t of allTimers) {
    check(`${t} is either a jobs.conf timer or a known worker timer`,
      timers.includes(t) || KNOWN_WORKER_TIMERS.includes(t));
  }

  for (const job of jobs) {
    const timerName = `docrud-cron-${job.name}.timer`;
    const has = timers.includes(timerName);
    check(`${job.name}: ${timerName} exists`, has);
    if (!has) continue;

    const timer = read(`ops/systemd/${timerName}`);
    check(`${job.name}: timer targets docrud-cron@${job.name}.service`,
      timer.includes(`Unit=docrud-cron@${job.name}.service`));
    check(`${job.name}: OnCalendar matches jobs.conf ("${job.schedule}")`,
      timer.includes(`OnCalendar=${job.schedule}`));
    check(`${job.name}: timer is installed into timers.target`,
      timer.includes('WantedBy=timers.target'));
  }

  /* The reverse direction: a timer with no row would fire a job nobody
     documented. */
  for (const timer of timers) {
    const name = timer.replace(/^docrud-cron-/, '').replace(/\.timer$/, '');
    check(`timer ${timer} has a jobs.conf row`, jobs.some((j) => j.name === name));
  }

  console.log('\n── 4. The templated service is correct and hardened ──');

  const svc = read('ops/systemd/docrud-cron@.service');
  check('Type=oneshot — systemd refuses to start an overlapping copy', svc.includes('Type=oneshot'));
  check('runs as the unprivileged app user', svc.includes('User=ubuntu'));
  check('the secret comes from an EnvironmentFile outside the repo',
    svc.includes('EnvironmentFile=/etc/docrud/cron.env'));
  check('the unit file contains no secret value', !/CRON_SECRET\s*=\s*\S/.test(svc));
  check('passes the instance name to the runner', svc.includes('run-cron-job.sh %i'));
  check('does not auto-restart on failure — the next tick is the retry', svc.includes('Restart=no'));
  check('grants a writable runtime dir for the lock', svc.includes('RuntimeDirectory=docrud-cron'));
  for (const directive of ['NoNewPrivileges=yes', 'ProtectSystem=strict', 'PrivateTmp=yes', 'ProtectHome=read-only']) {
    check(`hardening: ${directive}`, svc.includes(directive));
  }

  console.log('\n── 5. The runner never leaks the secret ──');

  const runner = read('ops/cron/run-cron-job.sh');
  check('the runner is executable', (statSync(path.join(ROOT, 'ops/cron/run-cron-job.sh')).mode & 0o111) !== 0);
  check('strict bash mode', runner.includes('set -euo pipefail'));

  /* Negative assertions run against CODE ONLY.
     The runner documents the unsafe patterns it avoids — `curl -H
     "x-cron-secret: …"`, `set -x`, `-L` — so a naive scan of the whole file
     reports the very warnings that exist to prevent the bug. Stripping
     whole-line comments is what makes "this script never does X" a statement
     about the script rather than about its prose. */
  const runnerCode = runner
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

  /* THE CORE SECURITY ASSERTION: the secret must never reach argv, where any
     local user can read it from `ps auxww`. */
  check('secret is passed via curl --config on stdin, not argv', runner.includes('curl --config -'));
  check('no -H/--header carries the secret on the command line',
    !/--header\s+["']?x-cron-secret/i.test(runnerCode) && !/-H\s+["']?x-cron-secret/i.test(runnerCode));
  check('the secret is never echoed or logged',
    !/(echo|log)\b[^\n]*\$\{?CRON_SECRET/.test(runnerCode));
  check('xtrace is never enabled (it would print the stdin config)',
    !/set\s+-x\b|set\s+-[a-z]*x\b/.test(runnerCode));
  check('the secret is never placed in a URL query string', !/secret=\$\{?CRON_SECRET/.test(runnerCode));

  console.log('\n── 6. The runner fails correctly ──');

  check('refuses to run with no CRON_SECRET', runner.includes('CRON_SECRET is not set'));
  check('non-2xx exits non-zero', /http_code.*=~.*\^2\[0-9\]\[0-9\]\$/.test(runner) && runner.includes('exit 2'));
  check('a failed request exits non-zero', runner.includes('exit 3'));
  check('an unknown job is a configuration error', runner.includes('unknown job'));
  check('a timeout is applied to every request', runner.includes('--max-time "$TIMEOUT"'));
  check('a connect timeout is applied', runner.includes('--connect-timeout'));
  check('redirects are refused rather than followed with a secret attached',
    runnerCode.includes('--max-redirs 0') && !/\s-L\b|--location/.test(runnerCode));
  check('the job name is validated before reaching a unit name or path',
    runner.includes('[[ "$JOB" =~ ^[a-z0-9][a-z0-9-]*$ ]]'));

  console.log('\n── 7. Overlap protection ──');

  check('the runner takes an flock', runner.includes('flock -n'));
  check('an already-running job exits 4 rather than failing the timer', runner.includes('exit 4'));
  check('jobs.conf documents the concurrency posture of the unsafe jobs',
    read('ops/cron/jobs.conf').includes('NOT concurrency-safe'));

  console.log('\n── 8. Requests stay on localhost and carry forwarded headers ──');

  check('the default base URL is loopback', runner.includes('http://127.0.0.1:3000'));
  check('no public hostname is hardcoded as the request target',
    !/curl[^\n]*https:\/\/www\.docrud\.com/.test(runnerCode));
  /* Without these, /api/cron/billing/reminders builds customer email links from
     new URL(request.url).origin — i.e. http://127.0.0.1:3000. */
  check('X-Forwarded-Proto is sent so generated links are https',
    runner.includes('X-Forwarded-Proto: ${PUBLIC_PROTO}'));
  check('X-Forwarded-Host is sent so generated links use the real host',
    runner.includes('X-Forwarded-Host: ${PUBLIC_HOST}'));
  check('the public host defaults to the real site', runner.includes('www.docrud.com'));

  console.log('\n── 9. No secret is committed ──');

  const example = read('ops/systemd/cron.env.example');
  check('the env example is clearly a placeholder', example.includes('replace-me'));
  check('the env example warns against committing a real secret',
    example.includes('DO NOT PUT A REAL SECRET'));
  check('no tracked ops file contains a plausible real secret',
    ['ops/cron/jobs.conf', 'ops/cron/run-cron-job.sh', 'ops/systemd/docrud-cron@.service']
      .every((f) => !/CRON_SECRET\s*=\s*["']?[A-Za-z0-9+/_-]{16,}/.test(read(f))));

  console.log('\n── 10. Every discovered cron route is scheduled ──');

  /* The check that would have caught today's outage: a cron route in the
     codebase that no timer ever fires. */
  const cronDir = path.join(ROOT, 'app/api/cron');
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === 'route.ts') {
        found.push('/' + path.relative(path.join(ROOT, 'app'), path.dirname(full)).replace(/\\/g, '/'));
      }
    }
  };
  walk(cronDir);

  check('every route under app/api/cron has a schedule', found.every((r) => jobs.some((j) => j.path === r)),
    found.filter((r) => !jobs.some((j) => j.path === r)).join(', ') || 'all scheduled');
  check('every scheduled path points at a real cron route', jobs.every((j) => found.includes(j.path)),
    jobs.filter((j) => !found.includes(j.path)).map((j) => j.path).join(', ') || 'all valid');
  console.log(`  – discovered ${found.length} cron routes: ${found.join(', ')}`);

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
