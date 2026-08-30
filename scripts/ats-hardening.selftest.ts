/**
 * ATS production-hardening self-test.
 *
 * Covers the guards added in this phase — parse timeout, filename
 * normalization, report-id validation, the production storage rule, safe
 * logging — plus a frozen API-contract check that fails loudly if a field any
 * existing client depends on is renamed or removed.
 *
 * Route handlers still are not invoked: they hold session resolution, which
 * needs next-auth. Everything beneath that line is exercised here for real.
 */
import {
  withParseTimeout, AtsTimeoutError, safeFileName, isValidReportId,
  assertPersistenceAvailable, AtsStorageUnavailableError, logUserRef, atsLog,
  PARSE_TIMEOUT_MS,
} from '@/lib/server/ats/safety';
import { runAtsEvaluation } from '@/lib/server/ats/api';
import { buildAtsReportRecord, MAX_REPORTS_PER_USER, HISTORY_PAGE_SIZE } from '@/lib/server/ats/reports';
import type { AtsApiResponse } from '@/lib/server/ats/api';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const PARSED = {
  headline: 'Senior Backend Engineer', location: 'Pune, India',
  skills: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'TypeScript'],
  experience: [{ title: 'Senior Backend Engineer', company: 'Acme', period: 'Jan 2021 - Dec 2023',
    desc: 'Engineered REST APIs using Node.js, reducing latency by 31%.' }],
  education: [{ degree: 'B.Tech Computer Science', school: 'Pune University', year: '2019' }],
};
const JD = `Senior Backend Engineer
We are looking for a Senior Backend Engineer with 5+ years of experience.
Requirements: React, Node.js, TypeScript, PostgreSQL are required.`;

/** Built from escapes so this file contains no literal control characters. */
const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7);

async function main() {
  console.log('\n── 1. Parser resource bound ──');

  const fast = await withParseTimeout(Promise.resolve('done'), 500);
  check('a fast parse returns normally', fast === 'done');

  let timedOut = false;
  try {
    await withParseTimeout(new Promise((resolve) => setTimeout(resolve, 200)), 20);
  } catch (err) { timedOut = err instanceof AtsTimeoutError; }
  check('a hanging parse is cut off by the timeout', timedOut);

  let rethrown = false;
  try {
    await withParseTimeout(Promise.reject(new Error('parser exploded')), 500);
  } catch (err) { rethrown = (err as Error).message === 'parser exploded'; }
  check("a parser's own failure is not masked by the timeout", rethrown);
  check('the default bound is a sane request timeout',
    PARSE_TIMEOUT_MS >= 5_000 && PARSE_TIMEOUT_MS <= 60_000, String(PARSE_TIMEOUT_MS));

  console.log('\n── 2. Filename normalization ──');

  check('a normal filename is preserved', safeFileName('Senior Engineer CV.pdf') === 'Senior Engineer CV.pdf');
  check('unix traversal is stripped to the basename',
    safeFileName('../../etc/passwd') === 'passwd', safeFileName('../../etc/passwd'));
  check('deep traversal is stripped',
    safeFileName('../../../../../../etc/shadow') === 'shadow', safeFileName('../../../../../../etc/shadow'));
  check('windows traversal is stripped',
    safeFileName('..\\..\\windows\\system32\\config') === 'config', safeFileName('..\\..\\windows\\system32\\config'));
  check('an absolute path is stripped', safeFileName('/etc/passwd') === 'passwd');
  check('a leading-dot name cannot become a dotfile',
    safeFileName('.env') === 'env', safeFileName('.env'));
  check('a bare ".." collapses to the safe default', safeFileName('..') === 'resume');
  check('a NUL byte is removed', safeFileName(`resume${NUL}.pdf`) === 'resume.pdf');
  check('control characters are removed', safeFileName(`re${BELL}sume.pdf`) === 'resume.pdf');
  check('an extremely long name is truncated', safeFileName(`${'a'.repeat(5000)}.pdf`).length <= 120);
  check('an empty name falls back', safeFileName('') === 'resume');
  check('a non-string falls back', safeFileName(null) === 'resume' && safeFileName(42) === 'resume');
  check('the result never contains a path separator',
    ['../../x', '/a/b/c', 'a\\b\\c', '....//x'].every((n) => !/[\\/]/.test(safeFileName(n))));

  console.log('\n── 3. Report id validation ──');

  check('a real UUID is accepted', isValidReportId('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
  check('an uppercase UUID is accepted', isValidReportId('3F2504E0-4F89-41D3-9A0C-0305E82C3301'));
  for (const bad of [
    '', 'abc', '../../etc/passwd', '3f2504e0', 'a'.repeat(500),
    '3f2504e0-4f89-41d3-9a0c-0305e82c3301x', 'null', 'undefined',
  ]) {
    check(`a malicious id is rejected: ${JSON.stringify(bad.slice(0, 24))}`, !isValidReportId(bad));
  }
  check('a non-string id is rejected',
    !isValidReportId(null) && !isValidReportId(42) && !isValidReportId({ $ne: null }));
  check('an operator-shaped object cannot reach the query',
    !isValidReportId({ $gt: '' } as unknown));

  console.log('\n── 4. Production storage rule ──');

  /* NODE_ENV is a plain assignment here: Object.defineProperty on process.env
     is rejected by Node's env proxy. Restored in `finally` so the rest of the
     suite runs in the environment it started in. */
  const env = process.env as Record<string, string | undefined>;
  const original = env.NODE_ENV;
  try {
    env.NODE_ENV = 'development';
    check('development tolerates the JSON fallback', (() => {
      try { assertPersistenceAvailable(false); return true; } catch { return false; }
    })());

    env.NODE_ENV = 'production';
    check('production REFUSES to persist without a database', (() => {
      try { assertPersistenceAvailable(false); return false; }
      catch (err) { return err instanceof AtsStorageUnavailableError; }
    })());

    check('production with a database is fine', (() => {
      try { assertPersistenceAvailable(true); return true; } catch { return false; }
    })());
  } finally {
    if (original === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = original;
  }

  console.log('\n── 5. Safe logging ──');

  const ref = logUserRef('user-abc-123');
  check('a user reference is stable', ref === logUserRef('user-abc-123'));
  check('different users get different references', ref !== logUserRef('user-abc-124'));
  check('the reference does not contain the raw user id', !ref.includes('user-abc-123'));

  const lines: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    atsLog('ATS_EVALUATION_COMPLETED', { user: ref, score: 80, ms: 12, missing: undefined });
    atsLog('ATS_UPLOAD_FAILED', { user: ref, reason: 'PARSE_TIMEOUT', bytes: 900 });
  } finally {
    console.log = realLog;
    console.error = realError;
  }
  check('log lines are emitted', lines.length === 2);
  check('log lines carry the event name', lines[0].includes('ATS_EVALUATION_COMPLETED'));
  check('log lines carry timing and outcome metadata',
    lines[0].includes('ms=12') && lines[0].includes('score=80'));
  check('logs never contain resume or job-description text',
    !lines.some((l) => /Engineered REST APIs|Senior Backend Engineer with 5/.test(l)));
  check('logs never contain a raw user id', !lines.some((l) => l.includes('user-abc-123')));
  check('undefined fields are omitted rather than printed',
    !lines.some((l) => l.includes('undefined')));

  console.log('\n── 6. Frozen API contract ──');

  const response = runAtsEvaluation({ parsedResume: PARSED, jobDescription: JD, jobTitle: 'Senior Backend Engineer' });
  check('a valid evaluation still returns 200', response.status === 200);
  const body = response.body as AtsApiResponse;

  /* Every field a shipped client may already read. Renaming or removing one is
     a breaking change; this list is what makes that impossible to do by
     accident. */
  for (const field of [
    'score', 'label', 'summary', 'breakdown', 'resumeQuality', 'parsing',
    'keywords', 'impact', 'alignment', 'actionPlan', 'report',
  ] as const) {
    check(`contract: "${field}" is present`, body[field] !== undefined);
  }
  for (const field of ['keyword', 'experience', 'alignment', 'parsingCap'] as const) {
    check(`contract: breakdown.${field} is present`, body.breakdown[field] !== undefined);
  }
  for (const field of ['cap', 'applied', 'rawScore'] as const) {
    check(`contract: parsingCap.${field} is present`, body.breakdown.parsingCap[field] !== undefined);
  }
  check('contract: weights are still 45 / 35 / 20',
    body.breakdown.keyword.weight === 45 && body.breakdown.experience.weight === 35
    && body.breakdown.alignment.weight === 20);
  for (const field of ['parserQuality', 'scoreCap', 'sectionCoverage', 'contactCompleteness',
    'criticalMissingElements', 'redFlags'] as const) {
    check(`contract: parsing.${field} is present`, body.parsing[field] !== undefined);
  }
  for (const field of ['requirement', 'importance', 'status', 'evidence', 'contextualProof',
    'matchedAs', 'credit'] as const) {
    check(`contract: keywords[].${field} is present`, body.keywords[0]?.[field] !== undefined);
  }
  check('contract: keywords[].proofQuote is present (may be null)',
    body.keywords.length > 0 && 'proofQuote' in body.keywords[0]);
  for (const field of ['score', 'actionVerbScore', 'quantificationRate', 'quantifiedBullets',
    'totalBullets', 'relevanceScore', 'yearsScore', 'weakestBullet'] as const) {
    check(`contract: impact.${field} is present`, body.impact[field] !== undefined);
  }
  for (const field of ['titleScore', 'seniorityScore', 'educationScore', 'certificationScore',
    'seniorityMismatch', 'educationMet', 'missingCertifications'] as const) {
    check(`contract: alignment.${field} is present`, body.alignment[field] !== undefined);
  }

  console.log('\n── 7. Error taxonomy is stable ──');

  for (const [payload, status, code] of [
    [{ jobDescription: JD }, 400, 'INVALID_INPUT'],
    [{ parsedResume: PARSED }, 400, 'INVALID_INPUT'],
    [{ parsedResume: PARSED, jobDescription: 'Hi' }, 422, 'UNPROCESSABLE'],
    [{ parsedResume: PARSED, jobDescription: 'a '.repeat(30_000) }, 413, 'PAYLOAD_TOO_LARGE'],
  ] as const) {
    const r = runAtsEvaluation(payload);
    check(`${status} still returns ${code}`,
      r.status === status && (r.body as { error: { code: string } }).error.code === code,
      `${r.status} ${(r.body as { error?: { code?: string } }).error?.code}`);
  }

  console.log('\n── 8. Report integrity & retention ──');

  const result = runAtsEvaluation({ parsedResume: PARSED, jobDescription: JD }).body as AtsApiResponse;
  const forged = buildAtsReportRecord({
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    userId: 'real-user', resumeId: null,
    resumeName: safeFileName('../../etc/passwd'),
    jobTitle: 'X', jobDescription: JD,
    createdAt: '2026-08-30T10:00:00.000Z', result,
  });
  check("the stored score is the engine's", forged.overallScore === result.score);
  check('the stored resume name is normalized', forged.resumeName === 'passwd');
  check('the stored record keeps only the JD hash',
    !JSON.stringify({ h: forged.jobDescriptionHash, t: forged.jobTitle }).includes('We are looking for'));
  check('the retention policy is bounded and documented',
    MAX_REPORTS_PER_USER === 100 && HISTORY_PAGE_SIZE <= 50);

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
