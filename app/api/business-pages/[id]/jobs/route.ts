import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById, getPageJobs, createJob } from '@/lib/server/business-pages';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const jobs = await getPageJobs(params.id, status);
    return NextResponse.json({ jobs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as {
      title?: string; description?: string; location?: string; jobType?: string;
      experienceLevel?: string; salaryMin?: number; salaryMax?: number;
      skills?: string[]; applyUrl?: string;
    };

    if (!body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json({ error: 'Title and description required' }, { status: 400 });
    }

    const job = await createJob({ id: randomUUID(), pageId: params.id, ...body, title: body.title, description: body.description });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
