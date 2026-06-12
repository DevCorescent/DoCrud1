import { NextResponse } from 'next/server';
import { getPublishedHiringJobs } from '@/lib/server/hiring';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await getPublishedHiringJobs();
    return NextResponse.json(jobs);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load public jobs.' }, { status: 500 });
  }
}
