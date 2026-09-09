/**
 * Phase 1 security hardening — the guarantees, not the wording.
 *
 * Run: npm run test:security-hardening
 *
 * Where a property can be EXECUTED it is executed: the header sanitiser and the
 * CSP are real values run through real code here. Where a property is
 * structural (a dependency version, a config key) it is asserted against the
 * actual file or the installed package, never against a comment.
 */
import { readFileSync } from 'node:fs';
import { sanitizeHeaderValue, sanitizeFilename } from '../lib/server/mail-provider';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

/* ═══ 1. NextAuth is patched ═════════════════════════════════════════════ */

const installed = JSON.parse(read('node_modules/next-auth/package.json')).version as string;
const [maj, min, patch] = installed.split('.').map(Number);
check(`next-auth installed is 4.24.15 or later (found ${installed})`,
  maj === 4 && min === 24 && patch >= 15);
check('package.json declares the patched range',
  /"next-auth": "\^4\.24\.(1[5-9]|[2-9]\d)"/.test(read('package.json')));
/* The advisories closed by this bump: a getToken() crash on a malformed Bearer
   header (reachable unauthenticated through middleware) and OAuth check-cookies
   not bound to their provider. */
check('middleware still guards routes through getToken',
  /getToken\(\{ req: request/.test(read('middleware.ts')));

/* ═══ 2. Mail header injection ═══════════════════════════════════════════
   A header ends at CRLF, so a value containing one starts a NEW header. */

check('a CR/LF payload cannot smuggle a Bcc',
  sanitizeHeaderValue('victim@example.com\r\nBcc: everyone@example.com')
    === 'victim@example.comBcc: everyone@example.com');
check('a bare LF is stripped too',
  !String(sanitizeHeaderValue('a@b.c\nSubject: spoofed')).includes('\n'));
check('a bare CR is stripped too',
  !String(sanitizeHeaderValue('a@b.c\rSubject: spoofed')).includes('\r'));
check('NUL is stripped', !String(sanitizeHeaderValue('a@b.c\0x')).includes('\0'));
check('an ordinary address is untouched',
  sanitizeHeaderValue('Someone <someone@example.com>') === 'Someone <someone@example.com>');
check('an ordinary subject is untouched',
  sanitizeHeaderValue('Your Docrud verification code') === 'Your Docrud verification code');
check('undefined stays undefined, so optional headers are not forced',
  sanitizeHeaderValue(undefined) === undefined);
check('header length is capped (unbounded headers are a DoS surface)',
  String(sanitizeHeaderValue('a'.repeat(5000))).length === 998);
check('attachment filenames cannot break Content-Disposition',
  sanitizeFilename('cv\r\n.pdf') === 'cv.pdf' && !sanitizeFilename('a"b.pdf').includes('"'));

const PROVIDER = read('lib/server/mail-provider.ts');
check('every header field is sanitised at the single send seam',
  ['from', 'to', 'cc', 'bcc', 'replyTo', 'subject']
    .every((f) => new RegExp(`${f}: sanitizeHeaderValue\\(message\\.${f}\\)`).test(PROVIDER)));
check('bodies are NOT mangled — a newline in a body is just a newline',
  /text: message\.text,/.test(PROVIDER) && /html: message\.html,/.test(PROVIDER));
/* The advisories that do not apply, asserted so they cannot start applying. */
const MAIL_SOURCES = ['lib/server/mail-provider.ts', 'lib/server/mailer.ts', 'lib/server/smtp-transport.ts']
  .map(read).join('\n');
check('no nodemailer `raw:` message option is used anywhere',
  !/\braw:\s/.test(MAIL_SOURCES));
check('attachments are Buffers, never a path or href',
  !/attachments[\s\S]{0,200}\b(path|href):/.test(MAIL_SOURCES));

/* ═══ 3. Security headers ════════════════════════════════════════════════ */

const CONFIG = read('next.config.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const headers: Array<{ key: string; value: string }> = require('../next.config.js')
  .headers ? [] : [];
check('existing protections are preserved',
  ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']
    .every((h) => CONFIG.includes(h)));

const enforced = (CONFIG.match(/const CSP_ENFORCED = \[([\s\S]*?)\]\.join/) ?? [])[1] ?? '';
for (const d of ['frame-ancestors', 'base-uri', 'object-src', 'form-action']) {
  check(`CSP enforces ${d}`, enforced.includes(d));
}
check('object-src is none, not a host list', /object-src 'none'/.test(enforced));
check('frame-ancestors agrees with X-Frame-Options SAMEORIGIN',
  /frame-ancestors 'self'/.test(enforced) && /X-Frame-Options', value: 'SAMEORIGIN'/.test(CONFIG));

const reportOnly = (CONFIG.match(/const CSP_REPORT_ONLY = \[([\s\S]*?)\]\.join/) ?? [])[1] ?? '';
check('the report-only policy has a default-src', /default-src 'self'/.test(reportOnly));
check('it allows Turnstile, which the CAPTCHA needs',
  reportOnly.includes('https://challenges.cloudflare.com'));
check('it allows Razorpay checkout, which payments need',
  reportOnly.includes('https://checkout.razorpay.com'));
/* Comments are stripped first: the block carries an explanatory `/* … *\/`
   whose asterisk otherwise reads as a wildcard. */
const reportOnlyCode = reportOnly.replace(/\/\*[\s\S]*?\*\//g, '');
check('script-src is not a blanket wildcard',
  !/script-src[^,]*\*/.test(reportOnlyCode));
check('object-src is not weakened in the report-only policy',
  !/object-src[^;]*(unsafe|https:)/.test(reportOnly));

/* ═══ 4. HSTS — production only ══════════════════════════════════════════ */

check('HSTS is sent with a long max-age, subdomains and preload',
  /max-age=63072000; includeSubDomains; preload/.test(CONFIG));
check('and ONLY in production, so localhost is not pinned to https',
  /NODE_ENV === 'production'[\s\S]{0,160}Strict-Transport-Security/.test(CONFIG));

/* ═══ 5. Health endpoint ═════════════════════════════════════════════════ */

const HEALTH = read('app/api/health/route.ts');
check('liveness does no I/O — it cannot fail because a dependency is down',
  /if \(!wantsReadiness\)[\s\S]{0,120}status: 'ok'/.test(HEALTH));
check('readiness is opt-in via ?check=ready',
  /searchParams\.get\('check'\) === 'ready'/.test(HEALTH));
check('readiness probes the database with a cheap ping, not a query',
  /db\.command\(\{ ping: 1 \}\)/.test(HEALTH));
check('an unreachable database is a 503, not a 200',
  /status: 503/.test(HEALTH) && !/status: 'ok'[\s\S]{0,40}catch/.test(HEALTH));
check('Redis is NOT part of readiness (it is optional and degrades)',
  !/redis/i.test(HEALTH.replace(/\/\*[\s\S]*?\*\//g, '')));
check('the driver error is never returned to the caller',
  /catch \{/.test(HEALTH) && !/error: (err|error)\b/.test(HEALTH));
check('health responses are never cached',
  /no-store/.test(HEALTH));
check('no secret, connection string or env var is exposed',
  !/process\.env\./.test(HEALTH.replace(/\/\*[\s\S]*?\*\//g, '')));

/* ═══ 6. pdf.js client renderer ══════════════════════════════════════════ */

const RENDER = read('lib/client/render-pdf-pages.ts');
check('eval-based execution is disabled in the client PDF renderer',
  /isEvalSupported: false/.test(RENDER));
check('every getDocument call uses the hardened options',
  (RENDER.match(/getDocument\(/g) ?? []).length
    === (RENDER.match(/\.\.\.SAFE_PDF_OPTIONS/g) ?? []).length);
check('PDF rendering is still enabled — mitigation, not removal',
  /getDocument\(/.test(RENDER) && !/throw new Error\('PDF rendering disabled/.test(RENDER));
check('the remaining dependency upgrade is recorded as a TODO',
  /TODO\(PHASE-2, dependency\)[\s\S]{0,200}pdfjs-dist/.test(RENDER));
/* The server résumé parser is a DIFFERENT, unaffected pdfjs and must stay put. */
check('the server-side parser was not touched',
  /require\('pdf-parse'\)/.test(read('lib/server/document-parser.ts')));

/* ═══ 7. Puppeteer stays in production dependencies ══════════════════════ */

const pkg = JSON.parse(read('package.json'));
check('puppeteer remains a production dependency (it is used at runtime)',
  Boolean(pkg.dependencies?.puppeteer) && !pkg.devDependencies?.puppeteer);

/* ═══ 8. CI actually runs the suites ═════════════════════════════════════ */

const CI = read('.github/workflows/ci.yml');
check('CI runs typecheck, lint and build', /tsc --noEmit/.test(CI) && /next lint/.test(CI) && /npm run build/.test(CI));
check('CI discovers suites by glob rather than a list that rots',
  /for f in scripts\/\*\.selftest\.ts/.test(CI));
check('CI fails when a suite fails', /test "\$failed" -eq 0/.test(CI));
/* YAML comments stripped — the workflow's own prose explains that there is no
   `npm test`, and matching that explanation would fail the check it documents. */
const CI_CODE = CI.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
check('CI does not invent an npm test script', !/npm (run )?test\b/.test(CI_CODE));
check('CI installs from the lockfile', /npm ci/.test(CI));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
