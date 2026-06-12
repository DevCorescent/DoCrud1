import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getTelemetryOverview, getSecurityBlocklist, saveSecurityBlocklist } from '@/lib/server/telemetry';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [overview, blocklist] = await Promise.all([getTelemetryOverview(), getSecurityBlocklist()]);
    return NextResponse.json({ ...overview, security: { ...overview.security, blockedIps: blocklist.blockedIps } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load telemetry overview' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null) as any;
    const blockedIps = Array.isArray(payload?.blockedIps)
      ? payload.blockedIps.map((ip: unknown) => String(ip || '').trim()).filter(Boolean).slice(0, 400)
      : [];
    await saveSecurityBlocklist({ blockedIps, updatedAt: new Date().toISOString() });
    return NextResponse.json(await getSecurityBlocklist());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update blocklist' }, { status: 500 });
  }
}

