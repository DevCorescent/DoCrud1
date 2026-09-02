/**
 * One public job.
 *
 * An expired or closed posting answers 404 rather than serving a role nobody
 * can apply to — the same active definition the feed uses.
 */
import { NextResponse } from 'next/server';
import { getHiringJobsCached } from '@/lib/server/hiring';
import { publicJobView } from '@/lib/server/job-api/queries';
import { TTL, cached } from '@/lib/server/cache';
import { isJobActive } from '@/lib/server/job-sources/lifecycle';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  /* Cached per posting. `null` is cached too — a 404 for an id that does not
     exist is a real and stable answer, and NOT caching it would leave the one
     shape a scraper or a broken link hits hardest falling through every time.
     Public data only: no session is read, so there is nothing to scope. */
  const view = await cached<Record<string, unknown> | null>(
    { ns: 'jobs:public', kind: 'detail', params: { id: params.jobId }, ttlSeconds: TTL.publicDetail },
    async () => {
      const jobs = await getHiringJobsCached();
      const job = jobs.find((j) => j.id === params.jobId);
      /* isJobActive is Phase 8's single definition — a draft, closed or expired
         posting is never public, cached or not. */
      return job && isJobActive(job) ? publicJobView(job) : null;
    },
  );
  if (!view) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  return NextResponse.json(view);
}
