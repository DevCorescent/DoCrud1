import { NextRequest, NextResponse } from 'next/server';
import { getPublishedHiringJobs, toPublicHiringJob, toPublicHiringJobListItem } from '@/lib/server/hiring';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const jobs = await getPublishedHiringJobs();

    /* ?view=list — the card fields only. The full payload is ~2.7 MB across 360
       postings and 88% of that is `description`, which a listing never renders;
       the list view is roughly a tenth of the size. Default stays the FULL
       record, so existing consumers that do need descriptions (the resume/ATS
       matcher ranks against them client-side) are untouched. */
    const list = request.nextUrl.searchParams.get('view') === 'list';

    // Public feed: strip internal/PII fields (creator id/email, org id, import source).
    return NextResponse.json(jobs.map(list ? toPublicHiringJobListItem : toPublicHiringJob));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load public jobs.' }, { status: 500 });
  }
}
