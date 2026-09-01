/**
 * One public job.
 *
 * An expired or closed posting answers 404 rather than serving a role nobody
 * can apply to — the same active definition the feed uses.
 */
import { NextResponse } from 'next/server';
import { getHiringJobs } from '@/lib/server/hiring';
import { publicJobView } from '@/lib/server/job-api/queries';
import { isJobActive } from '@/lib/server/job-sources/lifecycle';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const jobs = await getHiringJobs();
  const job = jobs.find((j) => j.id === params.jobId);
  if (!job || !isJobActive(job)) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }
  return NextResponse.json(publicJobView(job));
}
