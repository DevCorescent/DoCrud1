import { NextRequest, NextResponse } from 'next/server';
import { getPublishedHiringJobList, getPublishedHiringJobs, toPublicHiringJob } from '@/lib/server/hiring';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    /* ?view=list — the card fields only. The full payload is ~2.7 MB across 360
       postings and 88% of that is `description`, which a listing never renders;
       the list view is roughly a tenth of the size. It is now also PROJECTED IN
       THE DATABASE, so those bytes are never read either, not just never sent.
       Default stays the FULL record, so existing consumers that do need
       descriptions (the resume/ATS matcher ranks against them client-side) are
       untouched. */
    if (request.nextUrl.searchParams.get('view') === 'list') {
      return NextResponse.json(await getPublishedHiringJobList());
    }

    // Public feed: strip internal/PII fields (creator id/email, org id, import source).
    const jobs = await getPublishedHiringJobs();
    return NextResponse.json(jobs.map(toPublicHiringJob));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load public jobs.' }, { status: 500 });
  }
}
