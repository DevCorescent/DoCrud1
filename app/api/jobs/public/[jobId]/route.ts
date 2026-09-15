/**
 * One public job.
 *
 * An expired or closed posting answers 404 rather than serving a role nobody
 * can apply to — the same active definition the feed uses.
 */
import { NextResponse } from 'next/server';
import { getHiringJobsCached } from '@/lib/server/hiring';
import { selectPublishedJobDocById } from '@/lib/server/db/hiring-jobs-collection';
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
      /* ═══ ONE DOCUMENT, NOT THE CORPUS ═══

         This read used to be `getHiringJobsCached()` followed by `.find()`:
         every posting pulled into Node to answer a question about one of them.
         At 12,659 jobs that is 72 MB per cache miss, and the cache hid it
         until a cold key — a new posting, an expired entry, a link from
         search — paid the whole cost.

         The employer-facing detail route already made this exact change and
         measured 238,107 ms -> 314 ms. `_id` IS the posting id, so this is a
         primary-key lookup whatever the corpus size.

         `null` from the selector means the store could not answer FOR CERTAIN,
         which is different from "no such job". Only that case falls back to
         the corpus read, so an unavailable collection stays as slow as it is
         today rather than turning into a 404 for a job that exists. */
      const found = await selectPublishedJobDocById(params.jobId);
      const job = found
        ? found.job
        : (await getHiringJobsCached()).find((j) => j.id === params.jobId) ?? null;
      /* isJobActive is Phase 8's single definition — a draft, closed or expired
         posting is never public, cached or not. The selector's own PUBLISHED
         filter is narrower than this, never wider, so the visible set is
         unchanged. */
      return job && isJobActive(job) ? publicJobView(job) : null;
    },
  );
  if (!view) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  return NextResponse.json(view);
}
