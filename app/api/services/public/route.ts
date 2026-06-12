import { NextRequest, NextResponse } from 'next/server';
import { getPublicUserServices } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const services = await getPublicUserServices(userId);
    return NextResponse.json({ services });
  } catch (error) {
    console.error('[services/public] GET error', error);
    return NextResponse.json({ error: 'Failed to load services.' }, { status: 500 });
  }
}
