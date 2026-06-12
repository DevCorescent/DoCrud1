import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getHistoryEntries } from '@/lib/server/history';
import { getCustomTemplatesFromRepository, saveCustomTemplatesToRepository } from '@/lib/server/repositories';

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
    const [histRaw, templates] = await Promise.all([
      getHistoryEntries().catch(() => []),
      getCustomTemplatesFromRepository().catch(() => []),
    ]);
    type HistDoc = { createdAt?: string; templateName?: string; generatedBy?: string; userEmail?: string; organizationName?: string };
    const history = histRaw as HistDoc[];

    // Recent documents
    const recentDocs = [...history]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit)
      .filter((h) => {
        if (!query) return true;
        return (h.templateName || '').toLowerCase().includes(query) || (h.generatedBy || '').toLowerCase().includes(query);
      });

    // Template stats
    const templateUsage: Record<string, number> = {};
    (history as (HistDoc & { templateId?: string })[]).forEach((h) => {
      const key = h.templateId || h.templateName || 'unknown';
      templateUsage[key] = (templateUsage[key] || 0) + 1;
    });

    const enrichedTemplates = templates.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      isCustom: t.isCustom,
      organizationId: t.organizationId,
      organizationName: t.organizationName,
      createdAt: t.createdAt,
      usageCount: templateUsage[t.id] || 0,
    }));

    return NextResponse.json({
      documents: recentDocs,
      templates: enrichedTemplates,
      totalDocuments: history.length,
      totalTemplates: templates.length,
    });
  } catch (err) {
    console.error('[super-admin/documents GET]', err);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, templateId } = await req.json();

    if (action === 'delete_template') {
      if (!templateId) return NextResponse.json({ error: 'templateId required' }, { status: 400 });
      const templates = await getCustomTemplatesFromRepository();
      const filtered = templates.filter((t) => t.id !== templateId);
      await saveCustomTemplatesToRepository(filtered);
      await appendSuperAdminAudit({ action: 'template_deleted', targetType: 'template', targetId: templateId, ip: req.headers.get('x-forwarded-for') || undefined });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/documents POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
