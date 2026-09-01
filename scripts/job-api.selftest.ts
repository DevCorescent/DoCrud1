/**
 * Phase 9 self-test: the job API service layer.
 *
 * The routes are thin — they authenticate, call one of these functions, and
 * serialise the result — so the decisions worth testing all live here and can
 * be tested without a session, a database or a network.
 *
 * The assertions that matter most are the AUTHORIZATION ones. A ranking bug
 * shows up in a screenshot; an IDOR hands one company another company's
 * candidates and leaves no trace at all.
 */
import type { HiringJobPosting, HiringJobApplication } from '@/types/document';
import {
  allowedTransitions, parseStatus, statusCounts, transitionStatus, STATUS_API_NAME,
} from '@/lib/server/job-api/status';
import {
  candidateApplications, employerJobPatch, employerJobs, paginate, publicJobView,
  publicJobs, rankApplicants, EMPLOYER_EDITABLE, NEVER_EDITABLE,
} from '@/lib/server/job-api/queries';
import {
  canAccessResume, employerOwnsApplication, isApplicationCandidate,
  resumeContentType, safeResumeFileName,
} from '@/lib/server/job-api/resume-access';
import { buildRejectionEmail, sendRejectionEmail } from '@/lib/server/job-api/rejection-notice';
import {
  proposeOffer, respondToOffer, setAssignment, setInterview, stageView, submitAssignment,
} from '@/lib/server/job-api/stages';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = '2026-06-15T10:00:00.000Z';

function job(over: Partial<HiringJobPosting> = {}): HiringJobPosting {
  return {
    id: 'job-1', organizationId: 'org-A', organizationName: 'Acme',
    createdByUserId: 'emp-A', createdByEmail: 'a@acme.com',
    title: 'Backend Engineer', description: 'Build APIs with Node.js.',
    responsibilities: [], requirements: ['Node.js'], preferredSkills: ['Node.js'],
    targetRoleKeywords: [], minimumAtsScore: 0, status: 'published',
    location: 'Bengaluru', city: 'Bengaluru', country: 'IN',
    workMode: 'hybrid', employmentType: 'full_time', domain: 'software',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  } as HiringJobPosting;
}

function application(over: Partial<HiringJobApplication> = {}): HiringJobApplication {
  return {
    id: 'app-1', jobId: 'job-1', organizationId: 'org-A', organizationName: 'Acme',
    jobTitle: 'Backend Engineer', candidateUserId: 'cand-1', candidateName: 'Asha',
    candidateEmail: 'asha@example.com', atsScore: 88, resumeText: 'resume text',
    analysisSummary: '', status: 'submitted',
    appliedAt: '2026-06-02T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z',
    ...over,
  } as HiringJobApplication;
}

async function main() {
  console.log('\n── 1. Status vocabulary reuses the existing values ──');

  check('APPLIED maps to the stored "submitted"', parseStatus('APPLIED') === 'submitted');
  check('REJECTED maps to "rejected"', parseStatus('REJECTED') === 'rejected');
  check('the stored spelling is also accepted', parseStatus('shortlisted') === 'shortlisted');
  check('an unknown status is refused, not coerced', parseStatus('PROMOTED') === null);
  check('all nine statuses have an API name', Object.keys(STATUS_API_NAME).length === 9);
  check('the five original values are unchanged',
    ['submitted', 'reviewing', 'shortlisted', 'rejected', 'hired']
      .every((s) => s in STATUS_API_NAME));

  console.log('\n── 2. The recruitment funnel ──');

  const steps: Array<[HiringJobApplication['status'], HiringJobApplication['status']]> = [
    ['submitted', 'reviewing'], ['reviewing', 'shortlisted'], ['shortlisted', 'interview'],
    ['interview', 'assignment'], ['assignment', 'offer_proposed'], ['offer_proposed', 'hired'],
  ];
  for (const [from, to] of steps) {
    const r = transitionStatus({
      application: application({ status: from }), to,
      actorId: 'emp-A', actorRole: 'employer', now: NOW,
    });
    check(`${STATUS_API_NAME[from]} → ${STATUS_API_NAME[to]}`, r.ok === true, r.error);
  }
  check('rejection is reachable from any live stage',
    (['submitted', 'reviewing', 'shortlisted', 'interview', 'assignment', 'offer_proposed'] as const)
      .every((from) => transitionStatus({
        application: application({ status: from }), to: 'rejected',
        actorId: 'emp-A', actorRole: 'employer', now: NOW,
      }).ok));
  check('a hired application is terminal',
    transitionStatus({ application: application({ status: 'hired' }), to: 'reviewing', actorId: 'emp-A', actorRole: 'employer', now: NOW }).error === 'TERMINAL_STATE');
  check('a rejected application is terminal',
    transitionStatus({ application: application({ status: 'rejected' }), to: 'hired', actorId: 'emp-A', actorRole: 'employer', now: NOW }).error === 'TERMINAL_STATE');
  check('setting the SAME status is a no-op, not a duplicate history entry',
    transitionStatus({ application: application({ status: 'reviewing' }), to: 'reviewing', actorId: 'emp-A', actorRole: 'employer', now: NOW }).error === 'NO_CHANGE');

  console.log('\n── 3. Role permissions ──');

  check('a candidate CANNOT shortlist themselves',
    transitionStatus({ application: application(), to: 'shortlisted', actorId: 'cand-1', actorRole: 'candidate', now: NOW }).error === 'NOT_PERMITTED');
  check('a candidate CANNOT hire themselves',
    transitionStatus({ application: application(), to: 'hired', actorId: 'cand-1', actorRole: 'candidate', now: NOW }).error === 'NOT_PERMITTED');
  check('a candidate CAN withdraw',
    transitionStatus({ application: application(), to: 'withdrawn', actorId: 'cand-1', actorRole: 'candidate', now: NOW }).ok);
  check('an employer CANNOT withdraw on the candidate\'s behalf',
    transitionStatus({ application: application(), to: 'withdrawn', actorId: 'emp-A', actorRole: 'employer', now: NOW }).error === 'NOT_PERMITTED');
  check('allowedTransitions offers a candidate only withdrawal',
    allowedTransitions(application(), 'candidate').join(',') === 'withdrawn');
  check('allowedTransitions never offers an employer withdrawal',
    !allowedTransitions(application(), 'employer').includes('withdrawn'));
  check('a terminal application offers nothing to anyone',
    allowedTransitions(application({ status: 'hired' }), 'employer').length === 0);

  console.log('\n── 4. Status history ──');

  const moved = transitionStatus({ application: application(), to: 'reviewing', actorId: 'emp-A', actorRole: 'employer', now: NOW, note: 'Screening' });
  check('history records from, to, when and who', (() => {
    const h = moved.application!.statusHistory![0];
    return h.from === 'submitted' && h.to === 'reviewing' && h.changedAt === NOW && h.changedBy === 'emp-A';
  })());
  check('the note is kept', moved.application!.statusHistory![0].note === 'Screening');
  check('updatedAt moves with the status', moved.application!.updatedAt === NOW);
  check('history is APPENDED, never replaced', (() => {
    const second = transitionStatus({ application: moved.application!, to: 'shortlisted', actorId: 'emp-A', actorRole: 'employer', now: '2026-06-16T00:00:00.000Z' });
    return second.application!.statusHistory!.length === 2
      && second.application!.statusHistory![0].to === 'reviewing';
  })());
  check('the input application is not mutated', (() => {
    const a = application();
    const before = JSON.stringify(a);
    transitionStatus({ application: a, to: 'reviewing', actorId: 'e', actorRole: 'employer', now: NOW });
    return JSON.stringify(a) === before;
  })());
  check('counts cover every status', Object.keys(statusCounts([])).length === 9);
  check('counts are accurate', (() => {
    const c = statusCounts([application(), application({ status: 'hired' }), application({ status: 'hired' })]);
    return c.submitted === 1 && c.hired === 2 && c.rejected === 0;
  })());

  console.log('\n── 5. Rejection email: sent once, never fatal ──');

  const first = transitionStatus({ application: application(), to: 'rejected', actorId: 'emp-A', actorRole: 'employer', now: NOW });
  check('a first rejection asks for an email', first.shouldSendRejectionEmail === true);
  const already = transitionStatus({
    application: application({ status: 'reviewing', rejectionEmailSentAt: '2026-06-10T00:00:00.000Z' }),
    to: 'rejected', actorId: 'emp-A', actorRole: 'employer', now: NOW,
  });
  check('a second rejection does NOT ask for another email', already.shouldSendRejectionEmail === false);
  check('the guard refuses to send when already sent',
    (await sendRejectionEmail(application({ rejectionEmailSentAt: NOW }))).emailSent === false);
  check('an invalid recipient is refused without throwing',
    (await sendRejectionEmail(application({ candidateEmail: 'not-an-email' }))).emailError === 'no_valid_recipient');
  const mail = buildRejectionEmail({ candidateName: 'Asha', jobTitle: 'Backend Engineer', organizationName: 'Acme' });
  check('the email names the role', mail.subject.includes('Backend Engineer'));
  check('it has a plain-text part', mail.text.length > 0);
  check('employer-supplied text is escaped', (() => {
    const m = buildRejectionEmail({ candidateName: 'A', jobTitle: '<script>x</script>', organizationName: 'Acme' });
    return !m.html.includes('<script>');
  })());
  check('it never claims a reason for the decision',
    !/because|due to|unfortunately your (skills|experience)/i.test(mail.text));

  console.log('\n── 6. Resume access (IDOR) ──');

  const app1 = application({ resumeRef: { source: 'upload', fileName: 'asha.pdf', url: 'https://r2/x.pdf' } });
  check('the candidate may read their own resume',
    canAccessResume({ viewerUserId: 'cand-1', application: app1 }).allowed);
  check('the owning employer may read it',
    canAccessResume({ viewerUserId: 'emp-A', viewerOrganizationIds: ['org-A'], application: app1 }).allowed);
  /* The four denials that matter. */
  check('ANOTHER employer may NOT read it',
    canAccessResume({ viewerUserId: 'emp-B', viewerOrganizationIds: ['org-B'], application: app1 }).reason === 'FORBIDDEN');
  check('ANOTHER candidate may NOT read it',
    canAccessResume({ viewerUserId: 'cand-2', application: app1 }).reason === 'FORBIDDEN');
  check('an unauthenticated caller is refused',
    canAccessResume({ viewerUserId: null, application: app1 }).reason === 'UNAUTHENTICATED');
  check('a signed-in stranger with no org is refused',
    canAccessResume({ viewerUserId: 'rando', viewerOrganizationIds: [], application: app1 }).reason === 'FORBIDDEN');
  check('an unknown application is not found',
    canAccessResume({ viewerUserId: 'cand-1', application: null }).reason === 'NOT_FOUND');
  check('an application with no resume reports NO_RESUME, not access granted',
    canAccessResume({ viewerUserId: 'cand-1', application: application({ resumeText: '' }) }).reason === 'NO_RESUME');
  check('the result never leaks a storage path when denied',
    canAccessResume({ viewerUserId: 'emp-B', viewerOrganizationIds: ['org-B'], application: app1 }).file === undefined);
  check('an admin may read it, and it is recorded as such',
    canAccessResume({ viewerUserId: 'root', viewerOrganizationIds: [], isAdmin: true, application: app1 }).via === 'admin');

  console.log('\n── 7. Filename and content type safety ──');

  check('a path is stripped from the filename', safeResumeFileName('../../etc/passwd') === 'passwd');
  check('a quote cannot break the header', !safeResumeFileName('a".pdf').includes('"'));
  check('a newline cannot inject a header', !/[\r\n]/.test(safeResumeFileName('a\r\nX: y.pdf')));
  check('an empty name falls back', safeResumeFileName('') === 'resume.pdf');
  check('a dots-only name falls back', safeResumeFileName('...') === 'resume.pdf');
  check('the name is length-capped', safeResumeFileName(`${'a'.repeat(500)}.pdf`).length <= 180);
  check('a pdf is served as pdf', resumeContentType('cv.pdf') === 'application/pdf');
  check('a docx has its own type', resumeContentType('cv.docx').includes('wordprocessing'));
  check('an unknown type is a download, never inline-rendered',
    resumeContentType('cv.svg') === 'application/octet-stream');

  console.log('\n── 8. Employer ownership ──');

  check('the owning org owns the application', employerOwnsApplication(app1, ['org-A']));
  check('another org does NOT', !employerOwnsApplication(app1, ['org-B']));
  check('an empty org list owns nothing', !employerOwnsApplication(app1, []));
  check('a null application is never owned', !employerOwnsApplication(null, ['org-A']));
  check('the candidate is recognised', isApplicationCandidate(app1, 'cand-1'));
  check('another user is not', !isApplicationCandidate(app1, 'cand-2'));
  check('an unauthenticated viewer is not', !isApplicationCandidate(app1, null));

  console.log('\n── 9. Employer job editing is allow-listed ──');

  const patch = employerJobPatch({
    title: 'New Title', description: 'New description',
    id: 'hacked', organizationId: 'org-B', createdByUserId: 'emp-B',
    sourceId: 'lever:evil', sourceJobId: 'X', contentHash: 'fake', createdAt: '1999-01-01',
  });
  check('permitted fields pass through', patch.title === 'New Title' && patch.description === 'New description');
  check('the job id can never be set', !('id' in patch));
  check('ownership can never be reassigned',
    !('organizationId' in patch) && !('createdByUserId' in patch));
  check('source provenance can never be forged',
    !('sourceId' in patch) && !('sourceJobId' in patch));
  check('the dedup hash can never be set by a client', !('contentHash' in patch));
  check('createdAt can never be rewritten', !('createdAt' in patch));
  check('the two lists never overlap',
    !EMPLOYER_EDITABLE.some((f) => (NEVER_EDITABLE as readonly string[]).includes(f)));

  console.log('\n── 10. Employer job list ──');

  const jobs = [job({ id: 'j1' }), job({ id: 'j2', createdAt: '2026-06-05T00:00:00.000Z' })];
  const apps = [
    application({ id: 'a1', jobId: 'j1' }),
    application({ id: 'a2', jobId: 'j1', status: 'hired', candidateUserId: 'c2' }),
    application({ id: 'a3', jobId: 'j2', status: 'rejected', candidateUserId: 'c3' }),
  ];
  const list = employerJobs(jobs, apps);
  check('every owned job is listed', list.total === 2);
  check('applicant counts are correct',
    list.items.find((r) => r.id === 'j1')?.applicantCount === 2);
  check('per-status counts use API names',
    list.items.find((r) => r.id === 'j1')?.counts.HIRED === 1);
  check('a job with no applicants reports zero, not undefined',
    employerJobs([job({ id: 'j9' })], []).items[0].applicantCount === 0);
  check('newest is the default sort', employerJobs(jobs, apps).items[0].id === 'j2');
  check('oldest reverses it', employerJobs(jobs, apps, { sort: 'oldest' }).items[0].id === 'j1');
  check('sorting by applicants works', employerJobs(jobs, apps, { sort: 'applicants' }).items[0].id === 'j1');
  check('search filters by title', employerJobs(jobs, apps, { search: 'backend' }).total === 2);
  check('search that matches nothing returns nothing',
    employerJobs(jobs, apps, { search: 'zzzz' }).total === 0);
  check('closed jobs can be filtered out', (() => {
    const mixed = [job({ id: 'open' }), job({ id: 'shut', status: 'closed' })];
    return employerJobs(mixed, [], { state: 'active' }).total === 1;
  })());
  check('an expired job is reported inactive', (() => {
    const rows = employerJobs([job({ id: 'x', expiresAt: NOW })], []);
    return rows.items[0].isActive === false;
  })());

  console.log('\n── 11. Applicant ranking ──');

  const many: HiringJobApplication[] = [];
  for (let i = 0; i < 200; i += 1) {
    many.push(application({
      id: `app-${i}`, candidateUserId: `cand-${String(i).padStart(3, '0')}`,
      atsScore: 100 - Math.floor(i / 2), candidateName: `Person ${i}`,
    }));
  }
  const ranked = rankApplicants(many);
  check('the default order is ATS descending', (() => {
    for (let i = 1; i < ranked.items.length; i += 1) {
      if (ranked.items[i - 1].atsScore < ranked.items[i].atsScore) return false;
    }
    return true;
  })());
  check('ties break on candidate id, deterministically', (() => {
    const a = rankApplicants(many).items.map((r) => r.applicationId);
    const b = rankApplicants([...many].reverse()).items.map((r) => r.applicationId);
    return JSON.stringify(a) === JSON.stringify(b);
  })());
  check('200 applicants are paginated, not all returned',
    ranked.items.length === 20 && ranked.total === 200);
  check('page 2 continues without repeating page 1', (() => {
    const p1 = rankApplicants(many, { page: 1 }).items.map((r) => r.applicationId);
    const p2 = rankApplicants(many, { page: 2 }).items.map((r) => r.applicationId);
    return p1.every((id) => !p2.includes(id));
  })());
  check('an absurd pageSize is clamped',
    rankApplicants(many, { pageSize: 100000 }).items.length <= 100);
  /* The performance rule: no resume is touched while listing. */
  check('rows expose hasResume, never a resume URL', (() => {
    const rows = rankApplicants([application({ resumeRef: { source: 'upload', fileName: 'a.pdf', url: 'https://r2/secret.pdf' } })]);
    const row = rows.items[0] as unknown as Record<string, unknown>;
    return row.hasResume === true && !JSON.stringify(row).includes('r2/secret');
  })());
  check('no ATS score is recomputed — the stored value is returned',
    rankApplicants([application({ atsScore: 41 })]).items[0].atsScore === 41);
  check('a missing ATS score becomes 0, never NaN',
    rankApplicants([application({ atsScore: undefined as unknown as number })]).items[0].atsScore === 0);
  check('status filtering uses API names',
    rankApplicants([application(), application({ id: 'x', status: 'hired', candidateUserId: 'c9' })], { status: 'HIRED' }).total === 1);
  check('an ATS range filters', rankApplicants(many, { minAts: 95 }).total < 200);
  check('search matches a candidate name',
    rankApplicants(many, { search: 'Person 7' }).total > 0);

  console.log('\n── 12. Candidate isolation ──');

  const mine = application({ id: 'mine', candidateUserId: 'cand-1' });
  const theirs = application({ id: 'theirs', candidateUserId: 'cand-2' });
  const forMe = candidateApplications([mine, theirs], 'cand-1');
  check('a candidate sees only their own applications', forMe.total === 1);
  check("and never another candidate's", !forMe.items.some((r) => r.applicationId === 'theirs'));
  check('appliedAt is preserved', forMe.items[0].appliedAt === mine.appliedAt);
  check('the ATS score is exposed as a match score', forMe.items[0].atsScore === 88);
  check('NO selection probability is invented', (() => {
    const row = forMe.items[0] as unknown as Record<string, unknown>;
    return !('chance' in row) && !('probability' in row) && !('selectionChance' in row)
      && !('likelihood' in row);
  })());
  check('status history is returned in API names', (() => {
    const withHistory = application({
      candidateUserId: 'cand-1',
      statusHistory: [{ from: 'submitted', to: 'shortlisted', changedAt: NOW, changedBy: 'emp-A' }],
    });
    return candidateApplications([withHistory], 'cand-1').items[0].statusHistory[0].to === 'SHORTLISTED';
  })());
  check('an application with no history returns an empty list, not null',
    Array.isArray(forMe.items[0].statusHistory));
  check('newest first is the default', (() => {
    const older = application({ id: 'old', candidateUserId: 'cand-1', appliedAt: '2026-01-01T00:00:00.000Z' });
    return candidateApplications([older, mine], 'cand-1').items[0].applicationId === 'mine';
  })());
  check('status filtering works',
    candidateApplications([mine], 'cand-1', { status: 'APPLIED' }).total === 1);
  check('a date filter works',
    candidateApplications([mine], 'cand-1', { since: '2026-01-01' }).total === 1);

  console.log('\n── 13. Public discovery ──');

  const feed = [
    job({ id: 'live' }),
    job({ id: 'closed', status: 'closed' }),
    job({ id: 'draft', status: 'draft' }),
    job({ id: 'expired', expiresAt: NOW }),
  ];
  const pub = publicJobs(feed);
  check('only active jobs are public', pub.total === 1 && pub.items[0].id === 'live');
  check('a closed job is never public', !pub.items.some((j) => j.id === 'closed'));
  check('an expired job is never public', !pub.items.some((j) => j.id === 'expired'));
  check('a draft job is never public', !pub.items.some((j) => j.id === 'draft'));
  const view = publicJobView(job());
  for (const secret of ['organizationId', 'createdByUserId', 'createdByEmail', 'contentHash',
    'sourceId', 'sourceJobId', 'canonicalUrl', 'dedupGroupId', 'ingestedAt', 'lastSeenAt',
    'minimumAtsScore', 'classificationVersion']) {
    check(`the public view omits ${secret}`, !(secret in view));
  }
  check('the public view keeps what a candidate needs',
    Boolean(view.title && view.description && 'workMode' in view && 'domain' in view));
  check('search filters the feed', publicJobs(feed, { search: 'backend' }).total === 1);
  check('a domain filter works', publicJobs(feed, { domain: 'software' }).total === 1);
  check('a domain that matches nothing returns nothing',
    publicJobs(feed, { domain: 'legal' }).total === 0);
  check('a work-mode filter works', publicJobs(feed, { workMode: 'hybrid' }).total === 1);
  check('an employment-type filter works', publicJobs(feed, { employmentType: 'full_time' }).total === 1);
  check('a city filter also matches the raw location',
    publicJobs([job({ id: 'multi', city: undefined, location: 'Bengaluru / Pune' })], { city: 'pune' }).total === 1);
  /* Absence is not evidence of a low salary. */
  check('a job with NO salary survives a salary filter',
    publicJobs(feed, { minSalary: 1000000 }).total === 1);
  check('a job below the salary floor is excluded',
    publicJobs([job({ id: 's', salaryMax: 100 })], { minSalary: 1000 }).total === 0);
  check('a job above the floor is included',
    publicJobs([job({ id: 's', salaryMax: 5000 })], { minSalary: 1000 }).total === 1);

  console.log('\n── 14. Pagination contract ──');

  const items = Array.from({ length: 55 }, (_, i) => i);
  const p = paginate(items, 2, 10);
  check('the shape is items/page/pageSize/total',
    Array.isArray(p.items) && p.page === 2 && p.pageSize === 10 && p.total === 55);
  check('page 2 returns the right slice', p.items[0] === 10);
  check('a page past the end is empty, not an error', paginate(items, 99, 10).items.length === 0);
  check('page 0 is treated as page 1', paginate(items, 0, 10).page === 1);
  check('a negative page is treated as page 1', paginate(items, -5, 10).page === 1);
  check('pageSize is clamped to a maximum', paginate(items, 1, 100000).pageSize <= 100);
  check('pageSize 0 falls back to a sane default', paginate(items, 1, 0).pageSize > 0);
  check('a non-numeric page does not break it', paginate(items, 'abc', 'xyz').page === 1);

  console.log('\n── 15. Interview / assignment / offer ──');

  const emp = { actorRole: 'employer' as const, actorId: 'emp-A', now: NOW };
  const cand = { actorRole: 'candidate' as const, actorId: 'cand-1', now: NOW };

  check('an employer can schedule an interview',
    setInterview({ application: application(), ...emp, scheduledAt: '2026-06-20T09:00:00Z', mode: 'Google Meet' }).ok);
  check('a candidate CANNOT schedule their own interview',
    setInterview({ application: application(), ...cand }).error === 'NOT_PERMITTED');
  check('an unparseable interview date becomes absent, never a wrong date',
    setInterview({ application: application(), ...emp, scheduledAt: 'soon' }).application!.interview!.scheduledAt === undefined);

  const assigned = setAssignment({ application: application(), ...emp, title: 'Build a parser', dueAt: '2026-06-25' });
  check('an employer can set an assignment', assigned.ok);
  check('an assignment with no title is refused',
    setAssignment({ application: application(), ...emp, title: '  ' }).error === 'INVALID_INPUT');
  check('a candidate CANNOT set their own assignment',
    setAssignment({ application: application(), ...cand, title: 'x' }).error === 'NOT_PERMITTED');

  const submitted = submitAssignment({ application: assigned.application!, ...cand, submissionUrl: 'https://github.com/x/y' });
  check('a candidate can submit their work', submitted.ok);
  check('the submission time is recorded', submitted.application!.assignment!.submittedAt === NOW);
  check('an employer CANNOT submit on the candidate\'s behalf',
    submitAssignment({ application: assigned.application!, actorRole: 'employer', now: NOW, submissionUrl: 'https://a.com' }).error === 'NOT_PERMITTED');
  check('submitting with no assignment set is refused',
    submitAssignment({ application: application(), ...cand, submissionUrl: 'https://a.com' }).error === 'NO_ASSIGNMENT');
  /* A candidate link is rendered to a recruiter. */
  check('a javascript: submission URL is refused',
    submitAssignment({ application: assigned.application!, ...cand, submissionUrl: 'javascript:alert(1)' }).error === 'INVALID_INPUT');
  check('re-issuing an assignment does NOT destroy a submission', (() => {
    const again = setAssignment({ application: submitted.application!, ...emp, title: 'Revised brief' });
    return again.application!.assignment!.submissionUrl === 'https://github.com/x/y';
  })());

  const offered = proposeOffer({ application: application(), ...emp, salaryAmount: 1800000, salaryCurrency: 'inr', salaryPeriod: 'year' });
  check('an employer can propose an offer', offered.ok);
  check('the salary is recorded with its units',
    offered.application!.offer!.salaryAmount === 1800000 && offered.application!.offer!.salaryCurrency === 'INR');
  /* Absence must never render as an offer of nothing. */
  check('an offer with NO salary stores no salary, not zero',
    proposeOffer({ application: application(), ...emp }).application!.offer!.salaryAmount === undefined);
  check('a zero salary is treated as unstated',
    proposeOffer({ application: application(), ...emp, salaryAmount: 0 }).application!.offer!.salaryAmount === undefined);
  check('a candidate CANNOT propose an offer to themselves',
    proposeOffer({ application: application(), ...cand }).error === 'NOT_PERMITTED');

  const accepted = respondToOffer({ application: offered.application!, ...cand, response: 'accepted' });
  check('a candidate can accept', accepted.ok && accepted.application!.offer!.response === 'accepted');
  check('a candidate can decline',
    respondToOffer({ application: offered.application!, ...cand, response: 'declined' }).ok);
  check('an employer CANNOT answer on the candidate\'s behalf',
    respondToOffer({ application: offered.application!, actorRole: 'employer', now: NOW, response: 'accepted' }).error === 'NOT_PERMITTED');
  check('answering twice is refused',
    respondToOffer({ application: accepted.application!, ...cand, response: 'declined' }).error === 'ALREADY_ANSWERED');
  check('an unrecognised answer is refused',
    respondToOffer({ application: offered.application!, ...cand, response: 'maybe' }).error === 'INVALID_INPUT');
  check('responding with no offer is refused',
    respondToOffer({ application: application(), ...cand, response: 'accepted' }).error === 'NO_OFFER');

  console.log('\n── 16. Stage visibility ──');

  const withNotes = setInterview({ application: application(), ...emp, notes: 'Weak on system design' }).application!;
  check('the employer sees their own interview notes',
    (stageView(withNotes, 'employer').interview as Record<string, unknown>).notes === 'Weak on system design');
  /* A recruiter's private assessment is not the candidate's to read. */
  check('the CANDIDATE never sees the recruiter notes',
    !('notes' in (stageView(withNotes, 'candidate').interview as Record<string, unknown>)));
  check('an absent stage is null, not a placeholder',
    stageView(application(), 'candidate').interview === null);
  check('the offer response is null until answered',
    (stageView(offered.application!, 'candidate').offer as Record<string, unknown>).response === null);
  check('stage functions never mutate the input', (() => {
    const a = application();
    const before = JSON.stringify(a);
    setInterview({ application: a, ...emp });
    proposeOffer({ application: a, ...emp, salaryAmount: 100 });
    return JSON.stringify(a) === before;
  })());
  check('no selection probability appears in any stage payload', (() => {
    const v = JSON.stringify(stageView(offered.application!, 'candidate'));
    return !/probability|chance|likelihood/i.test(v);
  })());

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
