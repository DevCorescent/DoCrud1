/**
 * How many opportunities the public feed holds. Nothing else.
 *
 * ═══ WHY A SEPARATE ROUTE ═══
 *
 * The onboarding footer states a live count on the FIRST screen, before the
 * user has typed anything. It was getting that from `/api/jobs/public?pageSize=1`,
 * which loads the entire ~12 MB corpus out of one `app_state` document, filters
 * it, sorts it, and discards all but one row — measured at ~136 s cold against
 * the live cluster. `pageSize` cannot help: `paginate()` slices in JS, long
 * after the bytes have crossed the wire.
 *
 * This asks Mongo to count inside the document and return an integer, using
 * the SAME active predicate — see `selectActiveJobCount`, which is pinned
 * against the real `isJobActive` by a self-test.
 *
 * ═══ THE NUMBER STAYS THE FEED'S NUMBER ═══
 *
 * `/api/jobs/public` is untouched — same handler, same response, same shape.
 * This route reports the total that feed would report for an unfiltered query,
 * and the fallback path proves it by literally calling `publicJobs()`.
 *
 * PUBLIC BY DESIGN: no session is read, no user scope enters the key, and the
 * body is a single integer already visible on the jobs page. A failure returns
 * a 503 with no `total` rather than `{ total: 0 }` — a broken read must never
 * render as "there are no jobs", and the caller is built to show nothing at
 * all when the count is unavailable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { selectActiveJobCount } from '@/lib/server/db/hiring-jobs-rows';
import { getHiringJobsCached } from '@/lib/server/hiring';
import { publicJobs } from '@/lib/server/job-api/queries';
import { TTL, cached } from '@/lib/server/cache';
import { countPublicJobs } from '@/lib/server/db/public-jobs-query';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    /* ═══ THIS IS WHERE EXACT COUNTS LIVE NOW ═══

       The listing endpoint stopped computing one: its `$count` branch consumed
       every matching document before a page could be returned, so asking for
       twenty rows cost the whole match set. Counting is a separate question
       with a separate cost, asked for deliberately and cached — not attached to
       every listing request whether anyone reads it or not.

       The same filter vocabulary as the feed, so a count always describes the
       set the feed would return. */
    const q = request.nextUrl.searchParams;
    const filters = {
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
    };
    const filtered = Object.values(filters).some((v) => v !== undefined && v !== '');

    const total = await cached(
      { ns: 'jobs:public', kind: 'count', params: filters, ttlSeconds: TTL.publicList },
      async () => {
        /* A filtered count has to ask the collection; only the unfiltered one
           can use the cheap stored figure below. */
        if (filtered) {
          const n = await countPublicJobs(filters);
          if (n !== null) return n;
        }
        /* The cheap path: one integer off the wire. */
        const counted = await selectActiveJobCount();
        if (counted !== null) return counted;

        /* Mongo unconfigured, or the document is not shaped for a projection.
           Fall back to the exact path the feed uses, so the answer is the same
           number rather than an approximation of it. */
        return publicJobs(await getHiringJobsCached(), { pageSize: 1 }).total;
      },
    );
    return NextResponse.json({ total });
  } catch {
    return NextResponse.json({ error: 'Failed to count jobs.' }, { status: 503 });
  }
}
