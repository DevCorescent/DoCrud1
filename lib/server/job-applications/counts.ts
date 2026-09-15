/**
 * Exact application counts per job.
 *
 * ═══ EXACT MEANS EXACT ═══
 *
 * Every number here is derived from actual `HiringJobApplication` records. It
 * is never a recommendation count, a view count, an impression, an ATS score,
 * a shortlist size, or an estimate. If the store cannot be read, these
 * functions THROW — they never return zero, because "nobody applied" and "we
 * could not find out" are different facts and a dashboard that renders them
 * identically is the bug this codebase has already been bitten by twice.
 *
 * ═══ MEASURED STATE AT IMPLEMENTATION ═══
 *
 * Production currently holds ZERO job applications — the
 * `json:data/hiring-applications.json` app_state document does not exist,
 * meaning no application has ever been written. So every count these functions
 * return today is a truthful 0. They exist so the first real application is
 * counted correctly, not to make an empty feature look populated.
 *
 * ═══ THE SCALE CEILING, STATED PLAINLY ═══
 *
 * Applications are stored as ONE JSON array, not a collection, so counting
 * means loading every application. That is fine at zero and fine at thousands;
 * it is the same shape as the whole-corpus job read that took 229 s at 7,105
 * postings. When applications reach that order of magnitude this must become a
 * real collection with an index on `jobId` and a grouped aggregation. Doing it
 * now would be migrating an empty store on speculation; doing it late would
 * repeat a known mistake. The trigger is volume, and it is written down here
 * so the decision is made deliberately rather than discovered.
 */
import type { HiringJobApplication } from '@/types/document';
import { hiringApplicationsPath, readJsonFileStrict } from '@/lib/server/storage';

/**
 * How a job's applicant total treats each recruitment state.
 *
 * ═══ AN AMBIGUITY, REPORTED RATHER THAN INVENTED ═══
 *
 * `withdrawn` is the only status where "did this person apply?" and "is this
 * person an applicant?" disagree: they did apply, and then took it back.
 * `rejected` and `hired` are OUTCOMES of a real application and unambiguously
 * count. Nothing in the existing model states which of the two readings the
 * product wants for a displayed applicant total.
 *
 * So both are returned and neither is hidden. `active` excludes withdrawals
 * and is the sensible default for "applicants"; `total` counts every record
 * ever submitted. A caller picks; this module does not decide for them, and
 * does not quietly fold one into the other.
 */
export interface JobApplicationCounts {
  /** Every application record for the job, whatever its status. */
  total: number;
  /** Records the candidate withdrew. */
  withdrawn: number;
  /** `total` minus `withdrawn`. The default sense of "applicants". */
  active: number;
}

const EMPTY: JobApplicationCounts = { total: 0, withdrawn: 0, active: 0 };

/** Pure: group already-loaded applications by their job. */
export function countApplicationsByJob(
  applications: readonly HiringJobApplication[],
): Map<string, JobApplicationCounts> {
  const out = new Map<string, JobApplicationCounts>();
  for (const app of applications) {
    /* An application with no jobId cannot be attributed to a job. Counting it
       against some default would inflate an unrelated posting. */
    const jobId = typeof app?.jobId === 'string' ? app.jobId.trim() : '';
    if (!jobId) continue;

    const cur = out.get(jobId) ?? { total: 0, withdrawn: 0, active: 0 };
    cur.total += 1;
    if (app.status === 'withdrawn') cur.withdrawn += 1;
    else cur.active += 1;
    out.set(jobId, cur);
  }
  return out;
}

/**
 * Counts for every job that has at least one application.
 *
 * A job absent from the result has zero applications — which is why callers
 * should use {@link getApplicationCountsForJob} or default to `EMPTY` rather
 * than treating a missing key as unknown.
 *
 * THROWS on a storage failure. That is deliberate and is the whole contract:
 * the caller must be able to answer the request with an error rather than with
 * a confident zero.
 */
export async function getApplicationCountsByJob(): Promise<Map<string, JobApplicationCounts>> {
  /* `readJsonFileStrict`, NOT `readJsonFile`. The non-strict variant swallows a
     failed read and returns the fallback, which would turn an outage into
     "0 applicants" on every job in the product. */
  const applications = await readJsonFileStrict<HiringJobApplication[]>(
    hiringApplicationsPath, [],
  );
  return countApplicationsByJob(Array.isArray(applications) ? applications : []);
}

/** Exact counts for ONE job. Throws on storage failure; zero is a real answer. */
export async function getApplicationCountsForJob(
  jobId: string,
): Promise<JobApplicationCounts> {
  const id = (jobId || '').trim();
  if (!id) return { ...EMPTY };
  const byJob = await getApplicationCountsByJob();
  return byJob.get(id) ?? { ...EMPTY };
}

/**
 * Exact counts for several jobs, in ONE read.
 *
 * The alternative — calling the single-job function per job — would re-read
 * the entire application store once per job. At 500 admin rows that is 500
 * full reads to answer one screen.
 */
export async function getApplicationCountsForJobs(
  jobIds: readonly string[],
): Promise<Map<string, JobApplicationCounts>> {
  const byJob = await getApplicationCountsByJob();
  const out = new Map<string, JobApplicationCounts>();
  for (const raw of jobIds) {
    const id = (raw || '').trim();
    if (!id) continue;
    out.set(id, byJob.get(id) ?? { ...EMPTY });
  }
  return out;
}

/* ── Presentation ─────────────────────────────────────────────────────────*/

/**
 * A coarse label for an applicant count.
 *
 * PRESENTATION ONLY. The exact number stays authoritative everywhere it is
 * stored, compared or exported; this exists so a busy screen can show "100+"
 * without the reader mistaking a bucket for a measurement.
 *
 * The bands are half-open and ascending, so every count falls in exactly one —
 * no overlap, and no gap where a number belongs to none. Small counts are shown
 * exactly, because "1-9" is no more readable than "3" and rounding a handful of
 * applicants away is a loss of real information for no gain.
 */
export function applicantBucket(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '—';
  const n = Math.floor(count);
  if (n === 0) return '0';
  if (n < 10) return String(n);
  if (n < 25) return '10+';
  if (n < 50) return '25+';
  if (n < 100) return '50+';
  if (n < 200) return '100+';
  if (n < 500) return '200+';
  if (n < 1_000) return '500+';
  if (n < 5_000) return '1K+';
  return '5K+';
}
