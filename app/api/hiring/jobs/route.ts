import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getVisibleHiringJobsForUser, upsertHiringJob } from '@/lib/server/hiring';
import { canUserAccessFeature } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((entry) => entry.email.toLowerCase() === session.user.email!.toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    const jobs = await getVisibleHiringJobsForUser(storedUser);
    return NextResponse.json(jobs);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load jobs.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((entry) => entry.email.toLowerCase() === session.user.email!.toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }
    if (storedUser.accountType !== 'business' && storedUser.role !== 'client' && storedUser.role !== 'member' && storedUser.role !== 'admin') {
      return NextResponse.json({ error: 'Only company workspaces can post jobs.' }, { status: 403 });
    }
    if (storedUser.role !== 'admin') {
      const allowed = await canUserAccessFeature(storedUser, 'hiring_desk');
      if (!allowed) {
        return NextResponse.json({ error: 'Your current plan does not include the hiring desk.' }, { status: 403 });
      }
    }

    const payload = await request.json();
    if (!payload?.title?.trim() || !payload?.description?.trim()) {
      return NextResponse.json({ error: 'Job title and description are required.' }, { status: 400 });
    }

    const job = await upsertHiringJob(storedUser, payload);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save job posting.' }, { status: 400 });
  }
}
