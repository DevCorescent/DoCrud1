import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { listResumeLeads } from '@/lib/server/resume-leads';
import { getStoredUsers } from '@/lib/server/auth';
import { canUserAccessFeature, isSubscriptionPeriodExpired } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const actor = users.find((u) => u.id === session.user.id) || null;
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Talent Directory.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'talent_directory');
    if (!ok) {
      return NextResponse.json({ error: 'Talent Directory access is not included on your plan.' }, { status: 402 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const status = searchParams.get('status') || '';
    const limit = Number(searchParams.get('limit') || '24');
    const offset = Number(searchParams.get('offset') || '0');

    const result = await listResumeLeads({
      buyerUserId: session.user.id,
      q,
      status,
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load leads.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
