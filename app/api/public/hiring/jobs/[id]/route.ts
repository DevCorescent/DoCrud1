import { NextResponse } from 'next/server';
import { getPublishedHiringJobById, toPublicHiringJob } from '@/lib/server/hiring';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const job = await getPublishedHiringJobById(params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }
    // Public detail: strip internal/PII fields before returning.
    return NextResponse.json(toPublicHiringJob(job));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load job.' }, { status: 500 });
  }
}
