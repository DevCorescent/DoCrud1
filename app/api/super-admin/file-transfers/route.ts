import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getFileTransfers, saveFileTransfers } from '@/lib/server/file-transfers';
import { SecureFileTransfer } from '@/types/document';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') || '').toLowerCase();
  const limit = Math.min(500, parseInt(searchParams.get('limit') || '200'));

  try {
    const all = await getFileTransfers();
    type TFile = SecureFileTransfer & { authMode?: string; status?: string; downloadCount?: number };

    let filtered: TFile[] = all as TFile[];
    if (query) {
      filtered = filtered.filter((t) =>
        `${t.fileName} ${t.uploadedBy} ${t.recipientEmail} ${(t as unknown as Record<string, string>).organizationId || ''}`.toLowerCase().includes(query)
      );
    }

    filtered = [...filtered].sort((a, b) =>
      new Date(String((b as unknown as Record<string, string>).createdAt || 0)).getTime() -
      new Date(String((a as unknown as Record<string, string>).createdAt || 0)).getTime()
    ).slice(0, limit);

    const authModes: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    (all as TFile[]).forEach((t) => {
      const mode = String(t.authMode || 'none');
      authModes[mode] = (authModes[mode] || 0) + 1;
      const st = String(t.status || 'active');
      statuses[st] = (statuses[st] || 0) + 1;
    });

    return NextResponse.json({
      transfers: filtered,
      total: all.length,
      filtered: filtered.length,
      authModes,
      statuses,
    });
  } catch (err) {
    console.error('[super-admin/file-transfers GET]', err);
    return NextResponse.json({ error: 'Failed to load file transfers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, transferId } = await req.json() as { action: string; transferId?: string };

    if (action === 'delete') {
      if (!transferId) return NextResponse.json({ error: 'transferId required' }, { status: 400 });
      const all = await getFileTransfers();
      const filtered = all.filter((t) => (t as unknown as Record<string, string>).id !== transferId);
      await saveFileTransfers(filtered);
      await appendSuperAdminAudit({
        action: 'file_transfer_deleted',
        targetType: 'file_transfer',
        targetId: transferId,
        ip: req.headers.get('x-forwarded-for') || undefined,
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'clear_all') {
      await saveFileTransfers([]);
      await appendSuperAdminAudit({
        action: 'file_transfers_cleared',
        targetType: 'file_transfer',
        targetId: 'all',
        ip: req.headers.get('x-forwarded-for') || undefined,
      });
      return NextResponse.json({ success: true, cleared: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/file-transfers POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
