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
import { selectPublicJobsPage } from '@/lib/server/db/public-jobs-query';
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
        const fromDb = await selectPublicJobsPage(query);
        if (fromDb) return fromDb;

        /* Mongo unconfigured, or the document is not shaped for a projection.
           Unchanged behaviour, unchanged cost — never an empty result. */
        return publicJobs(await getHiringJobsCached(), query);
      },
    );
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'Failed to load jobs.' }, { status: 500 });
  }
}
