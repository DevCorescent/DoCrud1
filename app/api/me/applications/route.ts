/**
 * The signed-in candidate's own applications.
 *
 * Scoped to the SESSION user twice over: the store is filtered here, and
 * `candidateApplications` re-filters by candidate id as defence in depth. A
 * client cannot request another person's applications because it never gets to
 * name whose it wants.
 *
 * The ATS score is exposed as a MATCH SCORE. Nothing here converts it into a
 * probability of being hired, and no such field is returned.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getHiringApplications } from '@/lib/server/hiring';
import { candidateApplications } from '@/lib/server/job-api/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const users = await getStoredUsers();
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const all = await getHiringApplications();
  return NextResponse.json(candidateApplications(all, actor.id, {
    status: q.get('status') ?? undefined,
    since: q.get('since') ?? undefined,
    sort: (q.get('sort') as 'newest' | 'oldest' | 'updated' | null) ?? undefined,
    page: q.get('page') ?? undefined,
    pageSize: q.get('pageSize') ?? undefined,
  }));
}
