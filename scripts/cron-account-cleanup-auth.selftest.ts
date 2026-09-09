/**
 * Self-test — account-cleanup cron authorization (D7 post-audit fix)
 *
 * The account-cleanup route permanently deletes user accounts, profiles,
 * follows and credits. It previously authorized on the Host header whenever
 * CRON_SECRET was unset — and Host is supplied by the caller, so on any
 * deployment without the secret the route was reachable by anyone willing to
 * send `Host: localhost`.
 *
 * These checks pin the fail-CLOSED contract: a configured secret plus a valid
 * credential, in EVERY environment, with the Host header never consulted.
 */
import { readFileSync } from 'fs';
import path from 'path';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean) {
  checks += 1;
  if (!ok) { failures += 1; console.log(`  ✗ ${label}`); }
  else console.log(`  ✓ ${label}`);
}

const ROUTE = readFileSync(
  path.join(process.cwd(), 'app/api/cron/account-cleanup/route.ts'), 'utf8');
const HELPER = readFileSync(
  path.join(process.cwd(), 'lib/server/cron-auth.ts'), 'utf8');
const VERCEL = readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');

function fakeReq(headers: Record<string, string>) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as import('next/server').NextRequest;
}

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete (process.env as Record<string, unknown>)[name];
  else Object.defineProperty(process.env, name,
    { value, configurable: true, writable: true, enumerable: true });
}

async function main() {
  const { checkCronAuth } = await import('@/lib/server/cron-auth');
  const strict = (h: Record<string, string>) => checkCronAuth(fakeReq(h), { strict: true });

  const prevSecret = process.env.CRON_SECRET;
  const prevEnv = process.env.NODE_ENV;

  console.log('\n── A. Correct secret is allowed ──');
  setEnv('CRON_SECRET', 'super-secret-value');
  check('the Authorization Bearer credential is accepted',
    strict({ authorization: 'Bearer super-secret-value' }).authorized);
  check('the x-cron-secret header is accepted',
    strict({ 'x-cron-secret': 'super-secret-value' }).authorized);
  check('the accepted result reports reason "ok"',
    strict({ authorization: 'Bearer super-secret-value' }).reason === 'ok');

  console.log('\n── B. Wrong secret is rejected ──');
  check('a wrong bearer token is rejected',
    !strict({ authorization: 'Bearer wrong-value' }).authorized);
  check('a wrong x-cron-secret is rejected',
    !strict({ 'x-cron-secret': 'wrong-value' }).authorized);
  check('no credential at all is rejected', !strict({}).authorized);
  check('a bare Authorization value without the Bearer prefix is rejected',
    !strict({ authorization: 'super-secret-value' }).authorized);
  check('an empty credential does not match',
    !strict({ 'x-cron-secret': '' }).authorized);
  check('a secret passed in the query string is not consulted by the helper',
    !HELPER.includes('searchParams') && !HELPER.includes('nextUrl'));

  console.log('\n── C. Missing secret fails closed, in every environment ──');
  setEnv('CRON_SECRET', undefined);
  for (const env of ['production', 'development', 'test']) {
    setEnv('NODE_ENV', env);
    check(`NODE_ENV=${env}: an unset secret rejects a credentialled call`,
      !strict({ authorization: 'Bearer anything' }).authorized);
    check(`NODE_ENV=${env}: an unset secret reports missing-secret-config`,
      strict({}).reason === 'missing-secret-config');
  }

  console.log('\n── D. The Host header never authorizes ──');
  for (const env of ['production', 'development', 'test']) {
    setEnv('NODE_ENV', env);
    setEnv('CRON_SECRET', undefined);
    for (const host of ['localhost:3000', '127.0.0.1', 'localhost', 'localhost.evil.com']) {
      check(`NODE_ENV=${env}: Host "${host}" is rejected with no secret configured`,
        !strict({ host }).authorized);
    }
    setEnv('CRON_SECRET', 'super-secret-value');
    check(`NODE_ENV=${env}: Host "localhost:3000" is rejected without a credential`,
      !strict({ host: 'localhost:3000' }).authorized);
    check(`NODE_ENV=${env}: a spoofed localhost Host with a wrong secret is rejected`,
      !strict({ host: 'localhost:3000', authorization: 'Bearer wrong' }).authorized);
  }

  console.log('\n── E. The secret never leaks ──');
  setEnv('CRON_SECRET', 'super-secret-value');
  const surfaced = [
    strict({}).reason,
    strict({ 'x-cron-secret': 'wrong' }).reason,
    strict({ authorization: 'Bearer wrong' }).reason,
    JSON.stringify(strict({ authorization: 'Bearer super-secret-value' })),
  ].join(' ');
  check('no auth result echoes the secret value',
    !surfaced.includes('super-secret-value'));
  /* The route names the variable in its doc comment, which is fine. What must
     never happen is the route READING the secret — the value only ever lives
     inside the helper's constant-time comparison. */
  check('the route never reads the secret value',
    !ROUTE.includes('process.env.CRON_SECRET') && !/\bsecret\b\s*[:=]/.test(ROUTE));
  check('the route body contains no console logging of headers',
    !/console\.(log|error|warn)\([^)]*headers/.test(ROUTE));

  setEnv('CRON_SECRET', prevSecret);
  setEnv('NODE_ENV', prevEnv);

  console.log('\n── F. The route wires the strict contract ──');
  check('the route uses the shared helper in strict mode',
    /checkCronAuth\(req,\s*\{\s*strict:\s*true\s*\}\)/.test(ROUTE));
  check('the route no longer inspects the Host header',
    !ROUTE.includes("headers.get('host')") && !ROUTE.includes('startsWith(\'localhost\''));
  check('the route has no second, inline auth implementation',
    !ROUTE.includes('function isAuthorized'));
  check('invalid credentials return 401', ROUTE.includes('{ status: 401 }'));
  check('an unconfigured secret returns 503', ROUTE.includes('{ status: 503 }'));

  console.log('\n── G. Nothing else changed ──');
  check('the default (non-strict) helper behaviour is preserved for other routes',
    HELPER.includes('options.strict || process.env.NODE_ENV === \'production\''));
  check('account-cleanup was not scheduled', !VERCEL.includes('account-cleanup'));
  check('billing/reminders was not scheduled', !VERCEL.includes('billing'));
  check('the cleanup business logic is still present',
    ROUTE.includes('sendDeactivationWarningEmail') && ROUTE.includes('sendAccountDeletedEmail'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
