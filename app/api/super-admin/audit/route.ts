import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, getSuperAdminAuditLog } from '@/lib/server/super-admin-auth';
import { getAdminAuditEvents } from '@/lib/server/admin-audit';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, parseInt(searchParams.get('limit') || '200'));
  const source = searchParams.get('source') || 'all'; // 'super-admin' | 'admin' | 'all'

  try {
    const [saAudit, adminAudit] = await Promise.all([
      getSuperAdminAuditLog(limit),
      getAdminAuditEvents(limit).catch(() => []),
    ]);

    let combined: object[] = [];
    if (source === 'super-admin') combined = saAudit.map((e) => ({ ...e, source: 'super-admin' }));
    else if (source === 'admin') combined = adminAudit.map((e: object) => ({ ...e, source: 'admin' }));
    else {
      combined = [
        ...saAudit.map((e) => ({ ...e, source: 'super-admin' })),
        ...adminAudit.map((e: object) => ({ ...e, source: 'admin' })),
      ].sort((a, b) => {
        const at = (a as { timestamp?: string; createdAt?: string }).timestamp || (a as { timestamp?: string; createdAt?: string }).createdAt || '';
        const bt = (b as { timestamp?: string; createdAt?: string }).timestamp || (b as { timestamp?: string; createdAt?: string }).createdAt || '';
        return new Date(bt).getTime() - new Date(at).getTime();
      }).slice(0, limit);
    }

    return NextResponse.json({ entries: combined, total: combined.length });
  } catch (err) {
    console.error('[super-admin/audit GET]', err);
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 });
  }
}
