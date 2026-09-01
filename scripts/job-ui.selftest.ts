/**
 * Phase 10 — self-test for the My Jobs presentation rules.
 *
 * Everything the UI decides lives in lib/job-ui-status.ts as pure functions,
 * so this suite exercises the real decisions with no DOM, no database and no
 * network. What it is actually defending:
 *
 *   · the ATS score is never rendered as a probability of being hired;
 *   · a missing salary never appears as 0;
 *   · a job with applicants is never described as "deleted";
 *   · a failed rejection email is never reported as sent;
 *   · an employer never gets a control that answers an offer for a candidate;
 *   · a candidate never gets a control that changes their own recruitment status;
 *   · the timeline contains no event the API did not supply;
 *   · a non-http submission link is never turned into an anchor.
 *
 * Run: npm run test:job-ui
 */
import {
  APPLICATION_STATUSES, STATUS_LABEL, STATUS_WIRE_NAME, TERMINAL_STATUSES,
  atsBandLabel, atsMatchLabel, atsPercent, buildTimeline, candidateStatusActions,
  eligibilityLabel, eligibilityTone, employerStatusActions, formatDateOnly,
  formatDateTime, formatOfferSalary, formatSalaryRange, initials, isApiStatus,
  pageMeta, rejectionOutcome, removalCopy, removalOutcome, resumeCanPreview,
  safeExternalUrl, statusLabel, statusTone,
  ATS_TONE_CLASSES, atsAriaLabel, atsTone, postedAgo,
} from '../lib/job-ui-status';
import { resumeDisposition } from '../lib/server/job-api/resume-access';

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean) {
  if (condition) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

/* ═══ Statuses ═══════════════════════════════════════════════════════════ */

check('all nine statuses have a label', APPLICATION_STATUSES.every((s) => Boolean(STATUS_LABEL[s])));
check('all nine statuses have a wire name', APPLICATION_STATUSES.every((s) => Boolean(STATUS_WIRE_NAME[s])));
check('APPLIED reads as "Applied"', STATUS_LABEL.APPLIED === 'Applied');
check('OFFER_PROPOSED reads as "Offer Proposed"', STATUS_LABEL.OFFER_PROPOSED === 'Offer Proposed');
check('APPLIED goes back to the server as "submitted"', STATUS_WIRE_NAME.APPLIED === 'submitted');
check('no status label still contains an underscore',
  APPLICATION_STATUSES.every((s) => !STATUS_LABEL[s].includes('_')));

check('isApiStatus rejects a lookalike', !isApiStatus('SHORTLIST'));
check('isApiStatus rejects a wire name', !isApiStatus('submitted'));
check('isApiStatus accepts a real one', isApiStatus('SHORTLISTED'));

/* An unknown status is shown as-is, never remapped to a nicer one. */
check('unknown status is tidied, not remapped', statusLabel('ON_HOLD') === 'On Hold');
check('empty status reads "Unknown"', statusLabel('') === 'Unknown');
check('unknown status never becomes Applied', statusLabel('ON_HOLD') !== 'Applied');

check('hired is positive', statusTone('HIRED') === 'positive');
check('rejected is negative', statusTone('REJECTED') === 'negative');
check('withdrawn is negative', statusTone('WITHDRAWN') === 'negative');
check('shortlisted is progress', statusTone('SHORTLISTED') === 'progress');
check('unknown status tones neutral', statusTone('ON_HOLD') === 'neutral');

check('three terminal states', TERMINAL_STATUSES.size === 3);
check('hired is terminal', TERMINAL_STATUSES.has('HIRED'));

/* ═══ Who may do what ════════════════════════════════════════════════════ */

const employerFromApplied = employerStatusActions('APPLIED');
check('employer can act on a fresh application', employerFromApplied.length > 0);
check('employer can shortlist', employerFromApplied.some((a) => a.status === 'SHORTLISTED'));
check('employer can reject', employerFromApplied.some((a) => a.status === 'REJECTED'));
check('employer can hire', employerFromApplied.some((a) => a.status === 'HIRED'));

/* THE RULE: withdrawing is the candidate's decision about their own candidacy. */
for (const s of APPLICATION_STATUSES) {
  check(`employer is never offered Withdraw from ${s}`,
    !employerStatusActions(s).some((a) => a.status === 'WITHDRAWN'));
}

check('employer gets nothing once hired', employerStatusActions('HIRED').length === 0);
check('employer gets nothing once rejected', employerStatusActions('REJECTED').length === 0);
check('employer gets nothing once withdrawn', employerStatusActions('WITHDRAWN').length === 0);

/* THE MIRROR RULE: a candidate may not promote themselves. */
const candidateFromApplied = candidateStatusActions('APPLIED');
check('candidate gets exactly one action', candidateFromApplied.length === 1);
check('candidate action is withdraw', candidateFromApplied[0].status === 'WITHDRAWN');
for (const s of APPLICATION_STATUSES) {
  const actions = candidateStatusActions(s);
  check(`candidate cannot shortlist themselves from ${s}`,
    !actions.some((a) => a.status === 'SHORTLISTED'));
  check(`candidate cannot hire themselves from ${s}`,
    !actions.some((a) => a.status === 'HIRED'));
  check(`candidate cannot reject themselves from ${s}`,
    !actions.some((a) => a.status === 'REJECTED'));
  check(`candidate cannot mark an offer proposed from ${s}`,
    !actions.some((a) => a.status === 'OFFER_PROPOSED'));
}
check('candidate gets nothing once hired', candidateStatusActions('HIRED').length === 0);
check('candidate gets nothing once rejected', candidateStatusActions('REJECTED').length === 0);

/* Terminal moves are confirmed; ordinary ones are not. */
check('reject is marked destructive',
  employerStatusActions('APPLIED').find((a) => a.status === 'REJECTED')?.destructive === true);
check('hire is marked destructive',
  employerStatusActions('APPLIED').find((a) => a.status === 'HIRED')?.destructive === true);
check('shortlist is not destructive',
  employerStatusActions('APPLIED').find((a) => a.status === 'SHORTLISTED')?.destructive === false);

/* Buttons say the verb, not the noun. */
check('the shortlist button reads "Shortlist"',
  employerStatusActions('APPLIED').find((a) => a.status === 'SHORTLISTED')?.label === 'Shortlist');
check('every action carries a wire name the API accepts',
  employerStatusActions('APPLIED').every((a) => a.wire === STATUS_WIRE_NAME[a.status]));

/* ═══ ATS — a match, never a forecast ════════════════════════════════════ */

check('score renders as ATS Match', atsMatchLabel(87) === 'ATS Match 87%');
const FORBIDDEN = ['chance', 'probability', 'likelihood', 'odds', 'selection', 'predict', 'forecast', 'guarantee'];
for (const word of FORBIDDEN) {
  check(`"${word}" never appears in an ATS label`,
    !atsMatchLabel(87).toLowerCase().includes(word));
}
/* And it never appears in any status or eligibility copy either. */
const ALL_COPY = [
  ...APPLICATION_STATUSES.map((s) => STATUS_LABEL[s]),
  ...employerStatusActions('APPLIED').map((a) => a.label),
  ...candidateStatusActions('APPLIED').map((a) => a.label),
  eligibilityLabel('eligible'), eligibilityLabel('ineligible'), eligibilityLabel(undefined),
  removalCopy(0).body, removalCopy(3).body,
  rejectionOutcome({ emailSent: true }), rejectionOutcome({ emailSent: false }),
].join(' ').toLowerCase();
for (const word of FORBIDDEN) {
  check(`"${word}" never appears anywhere in My Jobs copy`, !ALL_COPY.includes(word));
}

check('score rounds to a whole percent', atsPercent(86.6) === 87);
check('score is clamped above 100', atsPercent(140) === 100);
check('score is clamped below 0', atsPercent(-5) === 0);
check('a non-numeric score is 0, never NaN', atsPercent('abc') === 0);
check('undefined score is 0', atsPercent(undefined) === 0);
check('NaN never reaches the label', !atsMatchLabel(Number.NaN).includes('NaN'));

check('band is humanised', atsBandLabel('strong_match') === 'Strong Match');
check('absent band stays absent', atsBandLabel(undefined) === null);
check('blank band stays absent', atsBandLabel('   ') === null);

/* ═══ Eligibility — unknown is a real answer ═════════════════════════════ */

check('eligible reads Eligible', eligibilityLabel('eligible') === 'Eligible');
check('ineligible reads Not eligible', eligibilityLabel('ineligible') === 'Not eligible');
/* Missing information must NOT read as a failure — Phase 5's founding rule. */
check('unknown reads "Not stated"', eligibilityLabel('unknown') === 'Not stated');
check('absent reads "Not stated"', eligibilityLabel(undefined) === 'Not stated');
check('unknown is never labelled ineligible', eligibilityLabel('unknown') !== 'Not eligible');
check('unknown tones neutral, not negative', eligibilityTone(undefined) === 'neutral');
check('ineligible tones negative', eligibilityTone('ineligible') === 'negative');

/* ═══ Money — absent stays absent ════════════════════════════════════════ */

check('a real salary formats', (formatOfferSalary({ salaryAmount: 1200000, salaryCurrency: 'INR', salaryPeriod: 'year' }) ?? '').includes('12,00,000'));
check('the period is suffixed',
  (formatOfferSalary({ salaryAmount: 1200000, salaryCurrency: 'INR', salaryPeriod: 'year' }) ?? '').endsWith('/yr'));
/* THE RULE: a missing salary is never rendered as zero. */
check('zero salary is null', formatOfferSalary({ salaryAmount: 0, salaryCurrency: 'INR' }) === null);
check('negative salary is null', formatOfferSalary({ salaryAmount: -5 }) === null);
check('absent salary is null', formatOfferSalary({}) === null);
check('null offer is null', formatOfferSalary(null) === null);
check('non-numeric salary is null', formatOfferSalary({ salaryAmount: 'lots' }) === null);
check('an unknown currency code does not throw',
  typeof formatOfferSalary({ salaryAmount: 100, salaryCurrency: 'ZZZZ' }) === 'string');

check('a range renders both bounds',
  (formatSalaryRange({ salaryMin: 100000, salaryMax: 200000, salaryCurrency: 'INR' }) ?? '').includes('–'));
check('a one-sided range renders one figure',
  !(formatSalaryRange({ salaryMin: 100000, salaryCurrency: 'INR' }) ?? '').includes('–'));
check('a 0–0 range is null', formatSalaryRange({ salaryMin: 0, salaryMax: 0 }) === null);
check('an absent range is null', formatSalaryRange({}) === null);
check('a null job is null', formatSalaryRange(null) === null);

/* ═══ Dates ══════════════════════════════════════════════════════════════ */

const stamped = formatDateTime('2026-08-28T11:02:00.000Z');
check('a timestamp renders a date and a time', Boolean(stamped && stamped.includes('·')));
check('a timestamp never renders "Invalid"', !(stamped ?? '').includes('Invalid'));
check('garbage is null, not "Invalid Date"', formatDateTime('not-a-date') === null);
check('an empty date is null', formatDateTime('') === null);
check('an undefined date is null', formatDateTime(undefined) === null);
check('date-only garbage is null', formatDateOnly('nope') === null);
check('date-only renders', Boolean(formatDateOnly('2026-08-28T11:02:00.000Z')));

/* ═══ Timeline — nothing invented ════════════════════════════════════════ */

const history = [
  { from: null, to: 'APPLIED', changedAt: '2026-08-28T11:02:00.000Z' },
  { from: 'APPLIED', to: 'REVIEWING', changedAt: '2026-08-29T05:50:00.000Z' },
  { from: 'REVIEWING', to: 'SHORTLISTED', changedAt: '2026-08-30T08:40:00.000Z' },
];
const line = buildTimeline({ status: 'SHORTLISTED', appliedAt: '2026-08-28T11:02:00.000Z', statusHistory: history });
check('every recorded change becomes an event', line.length === 3);
check('order is preserved', line[0].status === 'APPLIED' && line[2].status === 'SHORTLISTED');
check('the current status is the live node', line[2].state === 'current');
check('earlier events are complete', line[0].state === 'done' && line[1].state === 'done');
check('the current status is not duplicated',
  line.filter((e) => e.status === 'SHORTLISTED').length === 1);
check('each event carries its recorded time', line.every((e) => Boolean(e.when)));

/* THE RULE: no funnel extrapolation. Being shortlisted implies nothing. */
check('no interview is invented', !line.some((e) => e.status === 'INTERVIEW'));
check('no offer is invented', !line.some((e) => e.status === 'OFFER_PROPOSED'));
check('no hire is invented', !line.some((e) => e.status === 'HIRED'));
check('nothing is marked upcoming without data',
  !line.some((e) => e.state === 'upcoming'));

/* An empty history still records the one fact we have. */
const bare = buildTimeline({ status: 'APPLIED', appliedAt: '2026-08-28T11:02:00.000Z', statusHistory: [] });
check('an empty history still shows the application', bare.length === 1);
check('and marks it current', bare[0].state === 'current');
check('no history and no applied date yields no fabricated event',
  buildTimeline({ status: '', statusHistory: [] }).length === 0);

/* A status ahead of the history is still shown — the server is authoritative. */
const ahead = buildTimeline({ status: 'INTERVIEW', appliedAt: '2026-08-28T11:02:00.000Z', statusHistory: history });
check('a status beyond the history is appended', ahead[ahead.length - 1].status === 'INTERVIEW');
check('and it is the current node', ahead[ahead.length - 1].state === 'current');
check('with no invented timestamp', ahead[ahead.length - 1].when === null);

/* An upcoming node appears ONLY from a real stage record. */
const scheduled = buildTimeline({
  status: 'SHORTLISTED',
  appliedAt: '2026-08-28T11:02:00.000Z',
  statusHistory: history,
  stages: { interview: { scheduledAt: '2026-09-04T09:00:00.000Z' }, assignment: null, offer: null },
});
check('a scheduled interview appears as upcoming',
  scheduled.some((e) => e.status === 'INTERVIEW' && e.state === 'upcoming'));
check('the scheduled time is shown',
  Boolean(scheduled.find((e) => e.status === 'INTERVIEW')?.when));
check('an absent assignment invents nothing',
  !scheduled.some((e) => e.status === 'ASSIGNMENT'));
check('an absent offer invents nothing',
  !scheduled.some((e) => e.status === 'OFFER_PROPOSED'));
check('empty stages invent nothing',
  buildTimeline({ status: 'SHORTLISTED', statusHistory: history, stages: { interview: null, assignment: null, offer: null } })
    .every((e) => e.state !== 'upcoming'));
/* A closed application has no future. */
check('a rejected application shows no upcoming steps',
  buildTimeline({ status: 'REJECTED', statusHistory: history, stages: { interview: { scheduledAt: '2026-09-04T09:00:00.000Z' } } })
    .every((e) => e.state !== 'upcoming'));
check('a stage already reached is not repeated as upcoming',
  buildTimeline({
    status: 'INTERVIEW',
    statusHistory: [...history, { from: 'SHORTLISTED', to: 'INTERVIEW', changedAt: '2026-09-01T09:00:00.000Z' }],
    stages: { interview: { scheduledAt: '2026-09-04T09:00:00.000Z' } },
  }).filter((e) => e.status === 'INTERVIEW').length === 1);
/* Malformed history entries are skipped rather than rendered blank. */
check('an entry with no target status is skipped',
  buildTimeline({ status: 'APPLIED', statusHistory: [{ from: null, to: '', changedAt: 'x' }] })
    .every((e) => e.label !== 'Unknown'));

/* ═══ Close vs delete — never lie about which happened ═══════════════════ */

const withApplicants = removalCopy(3);
check('a job with applicants offers Close', withApplicants.confirmLabel === 'Close job');
check('and says so in the title', withApplicants.title === 'Close this job?');
check('and is flagged as close-only', withApplicants.closesOnly === true);
check('and never promises deletion', !withApplicants.body.toLowerCase().includes('permanently'));
check('and says applications are preserved', withApplicants.body.toLowerCase().includes('stays intact'));
check('and counts the people involved', withApplicants.body.includes('3'));
check('one applicant reads in the singular', removalCopy(1).body.includes('1 person has'));

const noApplicants = removalCopy(0);
check('an empty job offers Delete', noApplicants.confirmLabel === 'Delete job');
check('and is not close-only', noApplicants.closesOnly === false);
check('and warns it is permanent', noApplicants.body.toLowerCase().includes('permanently'));
check('a negative count is treated as none', removalCopy(-4).closesOnly === false);
check('a garbage count is treated as none', removalCopy('lots').closesOnly === false);

/* THE RULE: report the mode the SERVER used, not the one we asked for. */
check('a server delete is reported as deleted', removalOutcome({ mode: 'delete' }) === 'Job deleted.');
check('a server unpublish is reported as closed',
  removalOutcome({ mode: 'unpublish' }).toLowerCase().includes('closed'));
check('a server unpublish is NEVER reported as deleted',
  !removalOutcome({ mode: 'unpublish' }).toLowerCase().includes('deleted'));
check("the server's own note is preferred when present",
  removalOutcome({ mode: 'unpublish', note: 'Closed rather than deleted: 2 application(s) are attached and are preserved.' })
    .includes('2 application(s)'));
check('an unrecognised mode is reported as closed, not deleted',
  !removalOutcome({}).toLowerCase().includes('deleted'));

/* ═══ Rejection email — never claim a send that failed ═══════════════════ */

check('a sent email is reported as sent',
  rejectionOutcome({ emailSent: true }).includes('by email'));
check('a failed email says no email went out',
  rejectionOutcome({ emailSent: false, emailError: 'smtp down' }).toLowerCase().includes('no email has gone out'));
check('a failed email is NEVER reported as sent',
  !/notified in the app and by email/.test(rejectionOutcome({ emailSent: false, emailError: 'smtp down' })));
check('a failed email still confirms the rejection stands',
  rejectionOutcome({ emailSent: false }).toLowerCase().includes('rejected'));
check('an already-sent email is not double-claimed',
  rejectionOutcome({ emailSent: false, emailError: 'already_sent' }).toLowerCase().includes('already notified'));
check('a missing emailSent flag is treated as not sent',
  rejectionOutcome({}).toLowerCase().includes('could not be sent'));

/* ═══ Résumé ═════════════════════════════════════════════════════════════ */

check('a PDF can be previewed', resumeCanPreview('cv.pdf'));
check('an uppercase PDF can be previewed', resumeCanPreview('CV.PDF'));
check('a docx cannot be previewed', !resumeCanPreview('cv.docx'));
check('an extensionless file cannot be previewed', !resumeCanPreview('cv'));
check('an absent filename cannot be previewed', !resumeCanPreview(undefined));
/* A name that merely contains ".pdf" is not a PDF. */
check('a disguised name cannot be previewed', !resumeCanPreview('cv.pdf.exe'));

/* The UI's preview rule must agree with the server's disposition rule. */
check('server serves a PDF inline when asked', resumeDisposition('cv.pdf', true) === 'inline');
check('server still downloads a PDF by default', resumeDisposition('cv.pdf', false) === 'attachment');
check('server NEVER serves a docx inline', resumeDisposition('cv.docx', true) === 'attachment');
check('server NEVER serves an html file inline', resumeDisposition('cv.html', true) === 'attachment');
check('server NEVER serves an svg inline', resumeDisposition('cv.svg', true) === 'attachment');
check('server NEVER serves an unknown type inline', resumeDisposition('cv.weird', true) === 'attachment');
for (const name of ['cv.pdf', 'cv.docx', 'cv.txt', 'cv.html', 'cv.svg', 'cv.exe', 'cv']) {
  check(`UI preview and server disposition agree for ${name}`,
    resumeCanPreview(name) === (resumeDisposition(name, true) === 'inline'));
}

/* ═══ Links ══════════════════════════════════════════════════════════════ */

check('an https link survives', safeExternalUrl('https://example.com/work') === 'https://example.com/work');
check('an http link survives', safeExternalUrl('http://example.com') === 'http://example.com');
/* A submission link is rendered to a recruiter — these must never become hrefs. */
check('javascript: is refused', safeExternalUrl('javascript:alert(1)') === null);
check('data: is refused', safeExternalUrl('data:text/html,<script>x</script>') === null);
check('vbscript: is refused', safeExternalUrl('vbscript:msgbox(1)') === null);
check('a protocol-relative link is refused', safeExternalUrl('//evil.example') === null);
check('a bare path is refused', safeExternalUrl('/etc/passwd') === null);
check('a link with whitespace is refused', safeExternalUrl('https://a b') === null);
check('an empty link is refused', safeExternalUrl('') === null);
check('an undefined link is refused', safeExternalUrl(undefined) === null);
check('a leading-space javascript URL is refused', safeExternalUrl('  javascript:alert(1)') === null);

/* ═══ Paging ═════════════════════════════════════════════════════════════ */

const p1 = pageMeta({ page: 1, pageSize: 25, total: 200 });
check('page 1 of 200 starts at 1', p1.from === 1);
check('page 1 of 200 ends at 25', p1.to === 25);
check('200 at 25 a page is 8 pages', p1.totalPages === 8);
check('page 1 has no previous', p1.hasPrev === false);
check('page 1 has a next', p1.hasNext === true);
check('the summary counts honestly', p1.summary === '1–25 of 200');

const last = pageMeta({ page: 8, pageSize: 25, total: 200 });
check('the last page has no next', last.hasNext === false);
check('the last page ends at the total', last.to === 200);

const partial = pageMeta({ page: 3, pageSize: 25, total: 60 });
check('a partial last page does not overrun', partial.to === 60);

const empty = pageMeta({ page: 1, pageSize: 20, total: 0 });
check('an empty list is one page', empty.totalPages === 1);
check('an empty list starts at 0', empty.from === 0);
check('an empty list says so', empty.summary === 'No results');
check('an empty list has no next', empty.hasNext === false);

/* A page number past the end is clamped rather than showing a blank screen. */
check('an over-range page is clamped', pageMeta({ page: 99, pageSize: 25, total: 200 }).page === 8);
check('a zero page is clamped to 1', pageMeta({ page: 0, pageSize: 25, total: 200 }).page === 1);
check('a negative page is clamped to 1', pageMeta({ page: -3, pageSize: 25, total: 10 }).page === 1);
check('a garbage page size falls back', pageMeta({ page: 1, pageSize: 'x', total: 10 }).pageSize === 20);
check('a zero page size falls back', pageMeta({ page: 1, pageSize: 0, total: 10 }).pageSize === 20);

/* A 2,000-applicant job stays paged — the UI never asks for everything. */
const big = pageMeta({ page: 1, pageSize: 25, total: 2000 });
check('2,000 applicants page to 80 pages', big.totalPages === 80);
check('and one page still shows 25', big.to === 25);

/* ═══ Avatars ════════════════════════════════════════════════════════════ */

check('two names give two initials', initials('Asha Menon') === 'AM');
check('one name gives two letters', initials('Asha') === 'AS');
check('extra names use first and last', initials('Asha R Menon') === 'AM');
check('an empty name gives a placeholder', initials('') === '?');
check('an undefined name gives a placeholder', initials(undefined) === '?');
check('initials never exceed two characters', initials('A B C D E F').length === 2);

/* ═══ Phase 11 — ATS bands ═══════════════════════════════════════════════ */

/* The BACKEND's band decides the colour, so the word and the colour can never
   disagree. Phase 6 bands at 90 / 75 / 60 / 50 / 25 / 0. */
check('an exceptional band is green', atsTone(94, 'Exceptional Match') === 'excellent');
check('a strong band is blue', atsTone(80, 'Strong Match') === 'strong');
check('a competitive band is amber', atsTone(65, 'Good / Competitive') === 'moderate');
check('a moderate band is orange', atsTone(55, 'Moderate Match') === 'weak');
check('a weak band is orange', atsTone(30, 'Weak Match') === 'weak');
check('a poor band is red', atsTone(10, 'Poor Match') === 'low');
check('band casing does not matter', atsTone(94, 'exceptional match') === 'excellent');

/* PRECEDENCE. When the band and the raw score disagree, the BAND wins — it is
   what the card prints, and colouring by the score would put a green chip next
   to the word "Poor". These pairs are deliberately contradictory: a score-only
   implementation gives the opposite answer for both. */
check('the band wins when it disagrees with the score (low score, high band)',
  atsTone(20, 'Exceptional Match') === 'excellent');
check('the band wins when it disagrees with the score (high score, low band)',
  atsTone(95, 'Poor Match') === 'low');
check('a mid score with a strong band follows the band',
  atsTone(45, 'Strong Match') === 'strong');

/* Fallback only where the band is missing or unknown. */
check('an absent band falls back to the score', atsTone(94, undefined) === 'excellent');
check('an unknown band falls back to the score', atsTone(94, 'Mystery Band') === 'excellent');
check('a low score with no band is red', atsTone(5, undefined) === 'low');
check('every tone has classes',
  (['excellent','strong','moderate','weak','low'] as const).every((t) => Boolean(ATS_TONE_CLASSES[t])));
check('every tone defines a light and a dark value',
  (['excellent','strong','moderate','weak','low'] as const)
    .every((t) => ATS_TONE_CLASSES[t].includes('dark:')));

/* Screen readers get the number AND the band, never a bare percentage. */
check('the aria label spells out the score', atsAriaLabel(94, 'Exceptional Match').includes('94 percent'));
check('the aria label names the band', atsAriaLabel(94, 'Exceptional Match').includes('Exceptional Match'));
check('the aria label says ATS Match', atsAriaLabel(94, 'Exceptional Match').startsWith('ATS Match'));
check('the aria label survives a missing band', atsAriaLabel(94, undefined) === 'ATS Match 94 percent');
for (const word of FORBIDDEN) {
  check(`"${word}" never appears in an ATS aria label`,
    !atsAriaLabel(94, 'Exceptional Match').toLowerCase().includes(word));
}

/* ═══ Phase 11 — freshness is a DATE, never a score ══════════════════════ */

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
check('today reads "Posted today"', postedAgo('2026-09-02T09:00:00.000Z', NOW) === 'Posted today');
check('yesterday reads "Posted yesterday"', postedAgo('2026-09-01T09:00:00.000Z', NOW) === 'Posted yesterday');
check('two days reads in days', postedAgo('2026-08-31T09:00:00.000Z', NOW) === 'Posted 2 days ago');
check('a month reads in months', postedAgo('2026-08-01T12:00:00.000Z', NOW) === 'Posted 1 month ago');
check('garbage is null', postedAgo('nope', NOW) === null);
check('an absent date is null', postedAgo(undefined, NOW) === null);
/* A future posted date is not a negative age. */
check('a future date is null', postedAgo('2026-12-01T00:00:00.000Z', NOW) === null);
/* THE RULE: freshness is part of BACKEND ranking and is never shown as a number. */
check('no percentage appears in a freshness string',
  !(postedAgo('2026-08-31T09:00:00.000Z', NOW) ?? '').includes('%'));
check('the word "freshness" is never shown',
  !(postedAgo('2026-08-31T09:00:00.000Z', NOW) ?? '').toLowerCase().includes('freshness'));

/* ═══ Report ═════════════════════════════════════════════════════════════ */

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) {
  console.error('FAILED');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
