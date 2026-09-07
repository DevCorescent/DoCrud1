/**
 * The public job feed.
 *
 * Active postings only — Phase 8's `isJobActive` is the single definition, so
 * an expired or closed job can never reappear here because a filter happened
 * not to exclude it. Only fields a candidate may see are returned; ingestion
 * metadata and owner ids are omitted by an allow-list, not stripped afterwards.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getHiringJobsCached } from '@/lib/server/hiring';
import { publicJobs } from '@/lib/server/job-api/queries';
import {
  comparePages, describeQuery, jobReadSource, readPublicJobsPage,
  verifySampleRate, type JobReadSource,
} from '@/lib/server/db/public-jobs-source';
import { TTL, cached } from '@/lib/server/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const query = {
      search: q.get('search') ?? undefined,
      country: q.get('country') ?? undefined,
      state: q.get('state') ?? undefined,
      city: q.get('city') ?? undefined,
      domain: q.get('domain') ?? undefined,
      subDomain: q.get('subDomain') ?? undefined,
      workMode: q.get('workMode') ?? undefined,
      employmentType: q.get('employmentType') ?? undefined,
      experienceLevel: q.get('experienceLevel') ?? undefined,
      minSalary: q.get('minSalary') ?? undefined,
      sort: (q.get('sort') as 'newest' | 'relevance' | 'salary' | null) ?? undefined,
      page: q.get('page') ?? undefined,
      pageSize: q.get('pageSize') ?? undefined,
    };

    /* THE PAGE is cached, not the corpus. Caching the ~2.7 MB job corpus in
       Redis would move that payload over the network on every miss to answer a
       request for twenty rows; the answer itself is a few tens of KB. On a miss
       this falls through to the in-process corpus cache and MongoDB exactly as
       before, so with Redis unconfigured nothing about this route changes.

       Public data only — no session is read here and the key carries no user
       scope, so this response is identical for every visitor by construction. */
    const payload = await cached(
      { ns: 'jobs:public', kind: 'list', params: query, ttlSeconds: TTL.publicList },
      async () => {
        /* THE WORK HAPPENS IN THE DATABASE. Every posting lives in one ~12 MB
           app_state document, and slicing in JavaScript meant transferring all
           of it to return twenty rows — 145 s cold for a pageSize=1 request.
           `selectPublicJobsPage` filters, sorts, pages and applies
           publicJobView's allow-list inside Mongo, so only the page crosses the
           wire. Equivalence with the function below is pinned by
           scripts/public-jobs-equivalence.selftest.ts. */
        /* WHICH STORE — decided server-side by JOB_READ_FROM_HIRING_JOBS, which
           defaults to app_state. See lib/server/db/public-jobs-source.ts. No
           request input can select a source. */
        const source = jobReadSource();
        const fromDb = await readPublicJobsPage(query, source);

        if (fromDb) {
          /* Verification is SAMPLED and never blocks the answer. Running both
             stores on every request would double the cost of the endpoint this
             migration exists to make cheap; running neither would make "dual
             read" a claim rather than a check. The response returned is always
             the selected source's — a mismatch is a signal to investigate, not
             a licence to serve the other store's answer. */
          const rate = verifySampleRate();
          if (rate > 0 && Math.random() < rate) {
            const other: JobReadSource = source === 'hiring_jobs' ? 'app_state' : 'hiring_jobs';
            void readPublicJobsPage(query, other)
              .then((alt) => {
                const a = source === 'app_state' ? fromDb : alt;
                const b = source === 'app_state' ? alt : fromDb;
                const verdict = comparePages(a, b);
                if (!verdict.match) {
                  /* Loud, structured, and free of job or user content. */
                  console.error('[jobs:public] DUAL-READ MISMATCH', {
                    kinds: verdict.kinds,
                    query: describeQuery(query),
                    ...verdict.detail,
                  });
                }
              })
              .catch((error) => {
                console.error('[jobs:public] dual-read verification failed', error);
              });
          }
          return fromDb;
        }

        /* ═══ THE SELECTED SOURCE COULD NOT ANSWER ═══

           There is NO automatic fallback when hiring_jobs is the selected
           source. Quietly answering from app_state would make a broken
           collection path invisible — the endpoint would look healthy while the
           thing being rolled out was failing, which is precisely the signal a
           controlled rollout exists to surface. It would also mean the flag no
           longer describes what is serving traffic.

           Rollback is the FLAG, not a hidden runtime path:
           JOB_READ_FROM_HIRING_JOBS=false restores app_state on the next
           request. So this throws and becomes the 500 below — a failure the
           operator can see, never an empty page dressed as success. */
        if (source === 'hiring_jobs') {
          throw new Error('hiring_jobs read returned no result — refusing to serve app_state silently');
        }

        /* app_state is the selected source, and the projection could not run —
           Mongo unconfigured, or the document not shaped for it. This is the
           behaviour that predates the migration and is not a cross-source
           fallback: it is the same store, read the original way. A read that
           genuinely fails still throws from getHiringJobsCached. */
        return publicJobs(await getHiringJobsCached(), query);
      },
    );
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'Failed to load jobs.' }, { status: 500 });
  }
}
