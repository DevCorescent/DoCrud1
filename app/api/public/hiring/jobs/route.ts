import { NextResponse } from 'next/server';
import { getPublishedHiringJobs, toPublicHiringJob } from '@/lib/server/hiring';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await getPublishedHiringJobs();
    // Public feed: strip internal/PII fields (creator id/email, org id, import source).
    return NextResponse.json(jobs.map(toPublicHiringJob));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load public jobs.' }, { status: 500 });
  }
}
