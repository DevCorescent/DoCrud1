/**
 * ATS Phase 8 self-test — upload validation, persistence, ownership,
 * rate-limit policy, and the security invariants around them.
 *
 * The STORE is exercised for real, against the JSON fallback under data/ (the
 * same code path a developer without Mongo runs). Ownership is therefore
 * proven by actually writing two users' reports and trying to cross the line,
 * not by reading the query and trusting it.
 *
 * Route handlers are not invoked: they hold only session resolution, which
 * needs next-auth. Everything below that line is covered here.
 */
import path from 'path';
import { promises as fs } from 'fs';
import {
  validateResumeUpload, extensionOf, MAX_UPLOAD_BYTES,
  ALLOWED_RESUME_EXTENSIONS, RESUME_ACCEPT_ATTRIBUTE,
} from '@/lib/server/ats/upload';
import {
  buildAtsReportRecord, deleteAtsReport, getAtsReport, hashJobDescription,
  listAtsReports, saveAtsReport, HISTORY_PAGE_SIZE, MAX_REPORTS_PER_USER,
} from '@/lib/server/ats/reports';
import { RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { runAtsEvaluation } from '@/lib/server/ats/api';
import { formatHistoryDate, uploadErrorMessageForStatus, errorMessageForStatus } from '@/components/ats/ats-view-model';
import type { AtsApiResponse } from '@/lib/server/ats/api';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const REPORTS_PATH = path.join(process.cwd(), 'data', 'ats-reports.json');
const USER_A = '__selftest_user_a__';
const USER_B = '__selftest_user_b__';

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

const RESULT = (runAtsEvaluation({ parsedResume: PARSED, jobDescription: JD, jobTitle: 'Senior Backend Engineer' }).body) as AtsApiResponse;

const record = (id: string, userId: string, createdAt: string, jobTitle = 'Senior Backend Engineer') =>
  buildAtsReportRecord({
    id, userId, resumeId: 'resume-1', resumeName: 'CV.pdf',
    jobTitle, jobDescription: JD, createdAt, result: RESULT,
  });

/** Remove only this test's rows, so a developer's real history survives. */
async function cleanup() {
  try {
    const raw = await fs.readFile(REPORTS_PATH, 'utf8');
    const all = JSON.parse(raw) as Array<{ userId: string }>;
    const kept = all.filter((r) => r.userId !== USER_A && r.userId !== USER_B);
    await fs.writeFile(REPORTS_PATH, JSON.stringify(kept, null, 2));
  } catch { /* no file yet */ }
}

async function main() {
  await cleanup();

  console.log('\n── 1. Upload validation ──');

  const valid = { name: 'resume.pdf', size: 120_000, type: 'application/pdf' };
  check('a valid PDF is accepted', validateResumeUpload(valid) === null);
  check('a valid DOCX is accepted', validateResumeUpload({
    name: 'cv.docx', size: 50_000,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) === null);
  check('a .docx sent as octet-stream is still accepted (browsers do this)',
    validateResumeUpload({ name: 'cv.docx', size: 50_000, type: 'application/octet-stream' }) === null);
  check('a plain .txt is accepted', validateResumeUpload({ name: 'cv.txt', size: 900, type: 'text/plain' }) === null);

  check('no file is rejected', validateResumeUpload(null)?.code === 'NO_FILE');
  check('an empty file is rejected',
    validateResumeUpload({ ...valid, size: 0 })?.code === 'EMPTY_FILE');
  check('an oversized file is rejected',
    validateResumeUpload({ ...valid, size: MAX_UPLOAD_BYTES + 1 })?.code === 'FILE_TOO_LARGE');
  check('a file exactly at the limit is allowed',
    validateResumeUpload({ ...valid, size: MAX_UPLOAD_BYTES }) === null);
  check('an unsupported format is rejected',
    validateResumeUpload({ name: 'photo.png', size: 1000, type: 'image/png' })?.code === 'UNSUPPORTED_FORMAT');
  check('an executable is rejected',
    validateResumeUpload({ name: 'payload.exe', size: 1000, type: 'application/octet-stream' })?.code === 'UNSUPPORTED_FORMAT');
  check('a double extension is judged on the LAST extension',
    validateResumeUpload({ name: 'resume.pdf.exe', size: 1000, type: 'application/octet-stream' })?.code === 'UNSUPPORTED_FORMAT');
  check('rejection messages name the action, not the internals',
    ['NO_FILE', 'EMPTY_FILE', 'FILE_TOO_LARGE', 'UNSUPPORTED_FORMAT'].every((code) => {
      const r = [null, { ...valid, size: 0 }, { ...valid, size: MAX_UPLOAD_BYTES + 1 }, { name: 'a.png', size: 1, type: 'image/png' }]
        .map((f) => validateResumeUpload(f as never)).find((x) => x?.code === code);
      return Boolean(r && r.message.length > 10 && !/\/Users\/|stack|undefined/i.test(r.message));
    }));

  check('extensionOf reads the last segment', extensionOf('My.Resume.FINAL.docx') === 'docx');
  check('a name with no extension yields empty', extensionOf('resume') === '');
  check('the accept attribute covers every allowed extension',
    ALLOWED_RESUME_EXTENSIONS.every((e) => RESUME_ACCEPT_ATTRIBUTE.includes(`.${e}`)));

  console.log('\n── 2. Job description hashing ──');

  check('the same JD hashes identically', hashJobDescription(JD) === hashJobDescription(JD));
  check('whitespace and case do not change the hash',
    hashJobDescription(JD) === hashJobDescription(`  ${JD.toUpperCase().replace(/\n/g, '\n\n')}  `));
  check('a different JD hashes differently', hashJobDescription(JD) !== hashJobDescription(`${JD} Kubernetes required.`));
  check('the hash is a sha256 hex digest', /^[0-9a-f]{64}$/.test(hashJobDescription(JD)));

  console.log('\n── 3. Records store only what is needed ──');

  const built = record('r-1', USER_A, '2026-08-30T10:00:00.000Z');
  check('the record carries the job description HASH, not the text',
    built.jobDescriptionHash.length === 64 && !JSON.stringify(built).includes('We are looking for a Senior Backend'));
  check('scores are copied from the server result',
    built.overallScore === RESULT.score
    && built.keywordScore === RESULT.breakdown.keyword.score
    && built.experienceScore === RESULT.breakdown.experience.score
    && built.alignmentScore === RESULT.breakdown.alignment.score
    && built.resumeQualityScore === RESULT.resumeQuality.score);
  check('the parsing cap is preserved', built.parsingCap.cap === RESULT.breakdown.parsingCap.cap);
  check('the full report is kept so it can be redisplayed', built.result.score === RESULT.score);
  check('an empty job title falls back to the JD title, never blank',
    buildAtsReportRecord({ ...built, jobTitle: '', jobDescription: JD }).jobTitle.length > 0);

  console.log('\n── 4. Persistence & ownership ──');

  await saveAtsReport(record('a-1', USER_A, '2026-08-28T10:00:00.000Z', 'Backend Engineer'));
  await saveAtsReport(record('a-2', USER_A, '2026-08-30T10:00:00.000Z', 'Senior Backend Engineer'));
  await saveAtsReport(record('a-3', USER_A, '2026-08-29T10:00:00.000Z', 'Platform Engineer'));
  await saveAtsReport(record('b-1', USER_B, '2026-08-30T11:00:00.000Z', 'Data Analyst'));

  const listA = await listAtsReports(USER_A);
  check('a created evaluation is retrievable', listA.items.length === 3, String(listA.items.length));
  check('history is newest first',
    listA.items.map((i) => i.id).join(',') === 'a-2,a-3,a-1', listA.items.map((i) => i.id).join(','));
  check('the total counts only this user', listA.total === 3, String(listA.total));
  check('the list omits the heavy full report',
    !Object.prototype.hasOwnProperty.call(listA.items[0], 'result'));

  const listB = await listAtsReports(USER_B);
  check('another user sees only their own report',
    listB.items.length === 1 && listB.items[0].id === 'b-1');
  check('one user\'s list never contains another user\'s id',
    !listA.items.some((i) => i.id === 'b-1'));

  check('a user can read their own report', (await getAtsReport(USER_A, 'a-1'))?.id === 'a-1');
  check('a user CANNOT read another user\'s report', (await getAtsReport(USER_A, 'b-1')) === null);
  check('a user CANNOT read another user\'s report in reverse', (await getAtsReport(USER_B, 'a-1')) === null);
  check('an unknown id resolves to null', (await getAtsReport(USER_A, 'does-not-exist')) === null);

  check('a user CANNOT delete another user\'s report', (await deleteAtsReport(USER_A, 'b-1')) === false);
  check("the other user's report survives that attempt", (await getAtsReport(USER_B, 'b-1'))?.id === 'b-1');
  check('a user can delete their own report', (await deleteAtsReport(USER_A, 'a-1')) === true);
  check('the deleted report is gone', (await getAtsReport(USER_A, 'a-1')) === null);
  check('deleting twice reports not-found', (await deleteAtsReport(USER_A, 'a-1')) === false);
  check('deletion leaves the other rows intact', (await listAtsReports(USER_A)).total === 2);

  console.log('\n── 5. Paging & empty state ──');

  const page = await listAtsReports(USER_A, { limit: 1, offset: 0 });
  check('a page honours its limit', page.items.length === 1);
  check('the total is the full count, not the page size', page.total === 2);
  const second = await listAtsReports(USER_A, { limit: 1, offset: 1 });
  check('offset moves through the list', second.items[0].id !== page.items[0].id);
  check('an over-large limit is clamped to the page size',
    (await listAtsReports(USER_A, { limit: 10_000 })).items.length <= HISTORY_PAGE_SIZE);
  check('a negative offset is treated as zero',
    (await listAtsReports(USER_A, { offset: -5 })).items.length === 2);
  check('a user with no history gets an empty list, not an error',
    (await listAtsReports('__nobody__')).items.length === 0);
  check('the per-user ceiling is bounded', MAX_REPORTS_PER_USER > 0 && MAX_REPORTS_PER_USER <= 1000);

  console.log('\n── 6. Forged client input cannot reach stored fields ──');

  const forged = runAtsEvaluation({
    parsedResume: { ...PARSED, overallScore: 100, score: 100 },
    jobDescription: JD, jobTitle: 'Senior Backend Engineer',
    /* Every one of these is ignored by the API layer. */
    score: 100, overallScore: 100, userId: USER_B, reportId: 'forged',
  } as never).body as AtsApiResponse;
  check('a forged score in the payload does not change the result',
    forged.score === RESULT.score, `${forged.score} vs ${RESULT.score}`);
  const forgedRecord = buildAtsReportRecord({
    id: 'forged-1', userId: USER_A, resumeId: null, resumeName: null,
    jobTitle: 'X', jobDescription: JD, createdAt: '2026-08-30T12:00:00.000Z', result: forged,
  });
  check('the stored score is the server\'s, never the client\'s',
    forgedRecord.overallScore === RESULT.score);
  check('the stored userId is the session\'s, not the payload\'s',
    forgedRecord.userId === USER_A);

  console.log('\n── 7. Rate limiting policy ──');

  check('an evaluate policy exists per account', RATE_POLICIES.atsEvaluateAccount.limit > 0);
  check('an evaluate policy exists per IP', RATE_POLICIES.atsEvaluateIp.limit > 0);
  check('an upload policy exists', RATE_POLICIES.atsUploadAccount.limit > 0);
  check('the IP ceiling is looser than the account ceiling',
    RATE_POLICIES.atsEvaluateIp.limit > RATE_POLICIES.atsEvaluateAccount.limit);
  check('uploads are limited harder than evaluations, since parsing costs more',
    RATE_POLICIES.atsUploadAccount.limit < RATE_POLICIES.atsEvaluateAccount.limit);
  check('every ATS window is an hour',
    [RATE_POLICIES.atsEvaluateAccount, RATE_POLICIES.atsEvaluateIp, RATE_POLICIES.atsUploadAccount]
      .every((p) => p.windowMs === 60 * 60 * 1000));
  check('the limits are generous enough for real tailoring work',
    RATE_POLICIES.atsEvaluateAccount.limit >= 20);

  console.log('\n── 8. Client-facing messages ──');

  check('429 has an evaluator message', /too many ats evaluations/i.test(errorMessageForStatus(429)));
  check('429 has an upload message', /too many resume uploads/i.test(uploadErrorMessageForStatus(429)));
  check('413 upload names the size limit', /too large|10 mb/i.test(uploadErrorMessageForStatus(413)));
  check('422 upload explains what failed', /usable resume information/i.test(uploadErrorMessageForStatus(422)));
  check('401 upload asks to sign in', /sign in/i.test(uploadErrorMessageForStatus(401)));
  const messages = [400, 401, 413, 422, 429, 500].map(uploadErrorMessageForStatus);
  check('no upload message leaks internals',
    messages.every((m) => !/\/Users\/|node_modules|stack|process\.env/i.test(m)));

  console.log('\n── 9. History formatting ──');

  check('a stored date renders in a stable, timezone-free format',
    formatHistoryDate('2026-08-30T10:00:00.000Z') === 'Aug 30, 2026',
    formatHistoryDate('2026-08-30T10:00:00.000Z'));
  check('the format does not shift with the local timezone',
    formatHistoryDate('2026-08-30T23:30:00.000Z') === 'Aug 30, 2026');
  check('an unparsable date renders empty rather than "Invalid Date"',
    formatHistoryDate('not-a-date') === '');

  console.log('\n── 10. Existing contract preserved ──');

  for (const [payload, status] of [
    [{ jobDescription: JD }, 400],
    [{ parsedResume: PARSED }, 400],
    [{ parsedResume: PARSED, jobDescription: 'Hi' }, 422],
    [{ parsedResume: PARSED, jobDescription: 'a '.repeat(30_000) }, 413],
    [{ parsedResume: PARSED, jobDescription: JD }, 200],
  ] as const) {
    check(`the ${status} contract still holds`, runAtsEvaluation(payload).status === status,
      String(runAtsEvaluation(payload).status));
  }

  await cleanup();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
