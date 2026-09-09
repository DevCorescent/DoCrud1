/**
 * D3 — what must never reach a log line, and what must always be in one.
 *
 * Run: npm run test:observability
 *
 * The redaction is tested against the shapes that actually leak in practice —
 * driver errors quoting a connection string, an Authorization header echoed
 * into a message, a cookie in a serialized request — rather than against
 * strings invented to match the regex.
 */
import { readFileSync } from 'node:fs';
import {
  redact, newRequestId, requestIdFrom, logEvent, describeError,
  REQUEST_ID_HEADER,
} from '../lib/server/observability';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

/* ═══ 1. Redaction — real leak shapes ═════════════════════════════════════ */
{
  const cases: Array<[string, string, string]> = [
    ['mongo srv with credentials', 'failed: mongodb+srv://appuser:S3cret@c0.mongodb.net/docrud', 'S3cret'],
    ['mongo plain with credentials', 'refused mongodb://root:hunter2@10.0.0.1:27017', 'hunter2'],
    ['url credentials', 'GET https://user:tok3n@api.example.com/v1', 'tok3n'],
    ['bearer token', 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abcdefgh', 'eyJhbGciOiJIUzI1NiJ9'],
    ['authorization field', '{"authorization":"Basic YWxhZGRpbjpvcGVuc2VzYW1l"}', 'YWxhZGRpbg'],
    ['cookie', 'cookie: next-auth.session-token=abc123def456', 'abc123def456'],
    ['named secret', 'CRON_SECRET=super-secret-value failed', 'super-secret-value'],
    ['api key', '{"api_key":"sk-live-9f8e7d6c5b4a"}', 'sk-live-9f8e7d6c5b4a'],
    ['password', 'password: correcthorsebattery', 'correcthorsebattery'],
  ];
  for (const [label, input, mustNotSurvive] of cases) {
    const out = redact(input);
    check(`redacts ${label}`, !out.includes(mustNotSurvive), out);
  }
  check('ordinary text is left alone',
    redact('recommendation refresh finished in 240 ms') === 'recommendation refresh finished in 240 ms');
}

/* ═══ 2. Correlation ids ══════════════════════════════════════════════════ */
{
  const a = newRequestId(), b = newRequestId();
  check('ids are generated', /^[0-9a-f]{12}$/.test(a));
  check('and are not repeated', a !== b);

  const hdr = (v: string | null) => ({ get: () => v });
  check('a sane incoming id is reused', requestIdFrom(hdr('abc123def456')) === 'abc123def456');
  check('an absent id yields a fresh one', /^[0-9a-f]{12}$/.test(requestIdFrom(hdr(null))));

  /* A client-supplied id lands in log lines, so it is untrusted input. */
  for (const hostile of ['a', 'x'.repeat(200), 'has space', 'inject\nFAKE-LINE', '../../etc/passwd', '<script>']) {
    const got = requestIdFrom(hdr(hostile));
    check(`a hostile id is refused: ${JSON.stringify(hostile.slice(0, 14))}`,
      got !== hostile && /^[0-9a-f]{12}$/.test(got));
  }
}

/* ═══ 3. Emitted lines are structured and safe ════════════════════════════ */
{
  const lines: string[] = [];
  const orig = { error: console.error, warn: console.warn, log: console.log };
  console.error = (m?: unknown) => { lines.push(String(m)); };
  console.warn = (m?: unknown) => { lines.push(String(m)); };
  console.log = (m?: unknown) => { lines.push(String(m)); };
  try {
    logEvent('error', 'connect failed for mongodb+srv://u:p@c0.mongodb.net/db', {
      requestId: 'abc123def456', scope: 'cron/recommendations', durationMs: 41,
      note: 'Bearer eyJhbGciOiJIUzI1NiJ9.leak',
    });
    logEvent('info', 'ok', { requestId: 'abc123def456' });
  } finally {
    console.error = orig.error; console.warn = orig.warn; console.log = orig.log;
  }

  check('two lines were emitted', lines.length === 2);
  const first = JSON.parse(lines[0]) as Record<string, unknown>;
  check('output is valid JSON', typeof first === 'object');
  check('it carries the level', first.level === 'error');
  check('it carries a timestamp', typeof first.ts === 'string');
  check('it carries the correlation id', first.requestId === 'abc123def456');
  check('it carries the scope', first.scope === 'cron/recommendations');
  check('it carries the duration as a number', first.durationMs === 41);
  check('the message is redacted', !lines[0].includes('u:p@'));
  check('context values are redacted too', !lines[0].includes('eyJhbGciOiJIUzI1NiJ9'));
  check('undefined context is dropped, not stringified', !lines[1].includes('undefined'));
}

/* ═══ 4. Errors are reduced to what is safe ═══════════════════════════════ */
{
  const e = new Error('auth failed for mongodb+srv://u:p@host/db');
  const d = describeError(e);
  check('the error name survives', d.errorName === 'Error');
  check('the message is redacted', !d.errorMessage.includes('u:p@'));
  check('no stack is exposed', !JSON.stringify(d).includes('at '));
  const d2 = describeError('plain string failure');
  check('a non-Error is handled', d2.errorName === 'UnknownError');
}

/* ═══ 5. Structural — no telemetry dependency, no blocking calls ══════════ */
{
  const SRC = read('lib/server/observability.ts');
  check('it makes no network call', !/\bfetch\(|https?\.request|axios/.test(SRC));
  check('it adds no dependency', !/^import .* from '(?!node:|@\/)/m.test(SRC));
  check('stacks are deliberately not logged', !/\.stack/.test(SRC));

  const MW = read('middleware.ts');
  check('middleware stamps a correlation id', /headers\.set\(REQUEST_ID_HEADER, requestId\)/.test(MW));
  check('and echoes it on the response so a user can quote it',
    /response\.headers\.set\(REQUEST_ID_HEADER, requestId\)/.test(MW));

  const CRON = read('app/api/cron/recommendations/route.ts');
  check('cron logs success with a duration', /recommendation refresh finished/.test(CRON));
  check('cron logs failure distinctly', /recommendation refresh failed/.test(CRON));
  check('cron logs rejected auth', /cron auth rejected/.test(CRON));
  /* The doc comment names the CRON_SECRET convention; what matters is that
     the route never READS or EMITS the value. */
  const cronCode = CRON.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('cron never reads the secret value', !/process\.env\.CRON_SECRET/.test(cronCode));
  /* `missing-secret-config` is a coarse REASON CODE, not a secret — the check
     must distinguish naming a failure mode from emitting a credential. */
  check('the rejection log carries only a coarse reason code',
    /reason: auth\.reason/.test(cronCode));
  check('and no credential value is interpolated into any log',
    !/logEvent\([^)]*process\.env/.test(cronCode));
  check('a failed pass is still a 500, not an empty success', /status: 500/.test(CRON));
}

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
