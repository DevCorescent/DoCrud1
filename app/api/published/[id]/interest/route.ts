import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { toggleInterest } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const identifier = session?.user?.id || session?.user?.email || '';
    const name = session?.user?.name || session?.user?.email?.split('@')[0] || 'Anonymous';
    if (!identifier) {
      return NextResponse.json({ error: 'Sign in to mark interest.' }, { status: 401 });
    }
    const result = await toggleInterest(id, identifier, name);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
