import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getPlatformConfig, savePlatformConfig } from '@/lib/server/platform';
import { PlatformConfig } from '@/types/document';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getPlatformConfig());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load platform config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as PlatformConfig;
    await savePlatformConfig(payload);
    return NextResponse.json(await getPlatformConfig());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save platform config' }, { status: 500 });
  }
}
