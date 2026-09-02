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

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const jobs = await getHiringJobsCached();
    return NextResponse.json(publicJobs(jobs, {
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
    }));
  } catch {
    return NextResponse.json({ error: 'Failed to load jobs.' }, { status: 500 });
  }
}
