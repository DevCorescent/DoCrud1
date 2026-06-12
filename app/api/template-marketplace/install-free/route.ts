import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { installFreeTemplate } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null) as any;
    const itemId = String(body?.itemId || '').trim();
    if (!itemId) return NextResponse.json({ error: 'Template item is required.' }, { status: 400 });
    const result = await installFreeTemplate({ buyer: session.user as any, itemId });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to install template.' }, { status: 400 });
  }
}

