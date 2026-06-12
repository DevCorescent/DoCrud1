import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById, getPageAnalytics } from '@/lib/server/business-pages';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const analytics = await getPageAnalytics(params.id);
    return NextResponse.json(analytics);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
