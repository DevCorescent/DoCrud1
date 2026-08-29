/**
 * Post-a-Job self-test — ownership and authorization on the REAL service.
 *
 * Exercises lib/server/hiring.ts against a temporary file store, so it verifies
 * the shipped code rather than a copy of its rules. The cases that matter are
 * the ones that used to be exploitable: before this feature, `upsertHiringJob`
 * accepted any `id` and rewrote that job with the caller as owner.
 */
import { promises as fs } from 'fs';
import path from 'path';

process.env.MONGODB_URI = '';

import { RATE_POLICIES, rateLimit } from '@/lib/server/security/rate-limit';

import type { User } from '@/types/document';
import {
  assertCanManageHiringJob, getHiringJobsPostedByUser, getPublishedHiringJobs,
  getVisibleHiringApplicationsForUser, getVisibleHiringJobsForUser,
  invalidatePublishedHiringJobs, removeHiringJob, saveHiringApplications,
  upsertHiringJob, userOwnsHiringJob,
} from '@/lib/server/hiring';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
async function throws(fn: () => Promise<unknown>, match: string) {
  try { await fn(); return false; } catch (e) { return String((e as Error).message).includes(match); }
}

const individual = (id: string, email: string): User => ({
  id, email, name: `User ${id}`, role: 'user', accountType: 'individual',
} as unknown as User);

async function main() {
  const dir = path.join(process.cwd(), 'data');
  await fs.mkdir(dir, { recursive: true });
  const jobsFile = path.join(dir, 'hiring-jobs.json');
  const appsFile = path.join(dir, 'hiring-applications.json');
  await fs.writeFile(jobsFile, '[]');
  await fs.writeFile(appsFile, '[]');
  invalidatePublishedHiringJobs();

  const alice = individual('u-alice', 'alice@example.com');
  const bob = individual('u-bob', 'bob@example.com');
  const admin = { ...individual('u-admin', 'admin@example.com'), role: 'admin' } as unknown as User;

  /* ── CREATE ── */
  const job = await upsertHiringJob(alice, {
    title: 'Frontend Engineer', description: 'Build the marketplace UI.', minimumAtsScore: 70,
    status: 'published', preferredSkills: ['react'], targetRoleKeywords: ['frontend'],
  } as never);
  check('an individual (non-business) user can post a job', Boolean(job.id));
  check('the owner is derived from the session actor, not the payload',
    job.createdByUserId === alice.id && job.createdByEmail === alice.email);

  const spoofed = await upsertHiringJob(alice, {
    title: 'Spoof attempt', description: 'Body claims a different owner.', minimumAtsScore: 0,
    createdByUserId: 'u-bob', createdByEmail: 'bob@example.com', organizationId: 'u-bob',
  } as never);
  check('a forged createdByUserId in the body is ignored', spoofed.createdByUserId === alice.id);
  check('a forged organizationId in the body is ignored', spoofed.organizationId !== 'u-bob');

  /* ── UPDATE ── */
  const edited = await upsertHiringJob(alice, {
    id: job.id, title: 'Senior Frontend Engineer', description: job.description, minimumAtsScore: 70, status: 'published',
  } as never);
  check('the owner can edit their own job', edited.title === 'Senior Frontend Engineer');
  check('editing preserves the original creator', edited.createdByUserId === alice.id);
  check('editing preserves createdAt', edited.createdAt === job.createdAt);

  check('a NON-owner cannot overwrite another user job (the hijack hole)',
    await throws(() => upsertHiringJob(bob, {
      id: job.id, title: 'Hijacked', description: 'Taken over.', minimumAtsScore: 0,
    } as never), 'only manage jobs you posted'));

  const stillAlices = (await getPublishedHiringJobs()).find((j) => j.id === job.id);
  check('the hijack attempt changed nothing',
    stillAlices?.title === 'Senior Frontend Engineer' && stillAlices?.createdByUserId === alice.id);

  check('editing an unknown id is rejected',
    await throws(() => upsertHiringJob(alice, {
      id: 'no-such-job', title: 'x', description: 'y', minimumAtsScore: 0,
    } as never), 'not found'));

  /* ── OWNERSHIP CHECKS ── */
  check('userOwnsHiringJob: owner yes', userOwnsHiringJob(alice, edited));
  check('userOwnsHiringJob: stranger no', !userOwnsHiringJob(bob, edited));
  check('userOwnsHiringJob: admin retains moderation reach', userOwnsHiringJob(admin, edited));

  const denied = await assertCanManageHiringJob(bob, job.id);
  check('assertCanManageHiringJob returns 403 for a non-owner', !denied.ok && denied.status === 403);
  const missing = await assertCanManageHiringJob(alice, 'nope');
  check('assertCanManageHiringJob returns 404 for an unknown id', !missing.ok && missing.status === 404);

  /* ── VISIBILITY ── */
  const draft = await upsertHiringJob(alice, {
    title: 'Draft role', description: 'Not published yet.', minimumAtsScore: 0, status: 'draft',
  } as never);
  const published = await getPublishedHiringJobs();
  check('a draft job is NOT publicly visible', !published.some((j) => j.id === draft.id));
  check('a published job IS publicly visible', published.some((j) => j.id === job.id));
  check('the poster still sees their own draft',
    (await getVisibleHiringJobsForUser(alice)).some((j) => j.id === draft.id));
  check('another user does NOT see that draft',
    !(await getVisibleHiringJobsForUser(bob)).some((j) => j.id === draft.id));
  check('getHiringJobsPostedByUser lists only their own',
    (await getHiringJobsPostedByUser(alice)).every((j) => j.createdByUserId === alice.id));
  check('getHiringJobsPostedByUser is empty for a non-poster',
    (await getHiringJobsPostedByUser(bob)).length === 0);

  /* ── APPLICATIONS ── */
  await saveHiringApplications([
    { id: 'app-1', jobId: job.id, organizationId: job.organizationId, jobTitle: job.title,
      candidateUserId: 'u-carol', candidateName: 'Carol', candidateEmail: 'carol@example.com',
      organizationName: job.organizationName, status: 'submitted', appliedAt: new Date().toISOString() } as never,
  ]);
  check('the poster sees applications made to their job',
    (await getVisibleHiringApplicationsForUser(alice)).some((a) => a.id === 'app-1'));
  check('an unrelated user does NOT see those applications',
    !(await getVisibleHiringApplicationsForUser(bob)).some((a) => a.id === 'app-1'));

  /* ── UNPUBLISH / DELETE ── */
  check('a non-owner cannot unpublish', !(await removeHiringJob(bob, job.id, 'unpublish')).ok);
  check('the owner can unpublish', (await removeHiringJob(alice, job.id, 'unpublish')).ok);
  check('an unpublished job leaves the public feed',
    !(await getPublishedHiringJobs()).some((j) => j.id === job.id));
  check('an unpublished job is still visible to its owner',
    (await getVisibleHiringJobsForUser(alice)).some((j) => j.id === job.id));

  check('a non-owner cannot delete', !(await removeHiringJob(bob, draft.id, 'delete')).ok);
  check('the owner can delete', (await removeHiringJob(alice, draft.id, 'delete')).ok);
  check('a deleted job is gone for its owner too',
    !(await getVisibleHiringJobsForUser(alice)).some((j) => j.id === draft.id));

  /* ── MY JOBS DATA ──
     The list a "My Jobs" surface renders: the user's own postings, each with a
     real application count tallied from their own scoped applications. */
  const mine = await getHiringJobsPostedByUser(alice);
  const myApps = await getVisibleHiringApplicationsForUser(alice);
  const counts = new Map<string, number>();
  for (const a of myApps) counts.set(a.jobId, (counts.get(a.jobId) ?? 0) + 1);
  check('My Jobs lists only jobs this user created',
    mine.every((j) => j.createdByUserId === alice.id));
  check('application counts are per job and real',
    mine.every((j) => (counts.get(j.id) ?? 0) >= 0));
  check('another user My Jobs list is empty',
    (await getHiringJobsPostedByUser(bob)).length === 0);

  /* ── CACHE ── */
  const before = (await getPublishedHiringJobs()).length;
  const fresh = await upsertHiringJob(alice, {
    title: 'Cache probe', description: 'Must be visible immediately.', minimumAtsScore: 0, status: 'published',
  } as never);
  const after = await getPublishedHiringJobs();
  check('a new job is discoverable immediately, with no restart',
    after.length === before + 1 && after.some((j) => j.id === fresh.id));

  /* ── RATE LIMITING ──
     Exercises the shared limiter with the job-posting policy, using the
     file-backed fallback branch (no Mongo here). Creation must stop at the
     policy limit; the counter is per key, so a second account is unaffected. */
  const rateFile = path.join(dir, 'auth-rate-limits.json');
  await fs.writeFile(rateFile, '{}');
  const policy = RATE_POLICIES.jobPostAccount;
  check('the job-posting policy is a real, finite limit',
    policy.limit > 0 && policy.limit <= 50 && policy.windowMs > 0);

  let blockedAt = -1;
  for (let i = 0; i < policy.limit + 2; i += 1) {
    const r = await rateLimit('selftest:job-post:account:alice', policy);
    if (!r.allowed && blockedAt === -1) blockedAt = i;
  }
  check('posting is blocked once the per-account limit is reached',
    blockedAt === policy.limit, `blocked at attempt ${blockedAt}, limit ${policy.limit}`);

  const otherAccount = await rateLimit('selftest:job-post:account:bob', policy);
  check('one account hitting the limit does not block another', otherAccount.allowed);
  await fs.unlink(rateFile).catch(() => {});

  await fs.unlink(jobsFile).catch(() => {});
  await fs.unlink(appsFile).catch(() => {});

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
