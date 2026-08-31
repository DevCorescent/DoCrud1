/**
 * Super Admin email templates.
 *
 * GET            paginated list, with search / category / status filters
 * GET ?id=       one template
 * POST           create or update (send `revision` to guard against a stale write)
 * POST action=duplicate | archive | restore
 * DELETE ?id=    remove
 *
 * A template holds content only. Nothing here creates a campaign, and no
 * send path reads a template — using one copies its content into a draft, so
 * editing a template later cannot alter an email that already went out.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import {
  getMailTemplates, getMailTemplateById, saveMailTemplate, deleteMailTemplate,
  duplicateMailTemplate, TemplateConflictError, TEMPLATE_CATEGORIES,
} from '@/lib/server/mail-templates';
import { SUPPORTED_VARIABLES, unknownVariables } from '@/lib/server/mail-recipients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

async function guard(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  return session.valid ? session : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = params.get('id');

  try {
    if (id) {
      const template = await getMailTemplateById(id);
      if (!template) return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
      return NextResponse.json({
        template,
        /* The variable list comes from the server so the UI cannot drift from
           the resolver that will actually run. */
        variables: SUPPORTED_VARIABLES,
        unknown: unknownVariables(`${template.subject} ${template.html}`),
      });
    }

    const search = (params.get('q') ?? '').trim().toLowerCase();
    const category = params.get('category') ?? '';
    const status = params.get('status') ?? '';
    const page = Math.max(1, Number(params.get('page')) || 1);

    let rows = await getMailTemplates();
    if (category) rows = rows.filter((t) => t.category === category);
    if (status) rows = rows.filter((t) => t.status === status);
    if (search) {
      rows = rows.filter((t) =>
        t.name.toLowerCase().includes(search) || t.subject.toLowerCase().includes(search));
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;

    return NextResponse.json({
      /* The list omits bodies: it feeds a picker, not an editor. */
      templates: rows.slice(start, start + PAGE_SIZE).map((t) => ({
        id: t.id, name: t.name, category: t.category, subject: t.subject,
        status: t.status, revision: t.revision,
        createdBy: t.createdBy, updatedBy: t.updatedBy,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      })),
      total, page, totalPages,
      categories: TEMPLATE_CATEGORIES,
      variables: SUPPORTED_VARIABLES,
    });
  } catch (error) {
    console.error('[super-admin/mail/templates GET]', error);
    return NextResponse.json({ error: 'Unable to load templates.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const actor = session.email || 'super-admin';
  const action = String(body.action ?? '');

  try {
    if (action === 'duplicate' || action === 'archive' || action === 'restore') {
      const id = String(body.id ?? '');
      if (!id) return NextResponse.json({ error: 'A template id is required.' }, { status: 400 });
      const source = await getMailTemplateById(id);
      if (!source) return NextResponse.json({ error: 'Template not found.' }, { status: 404 });

      if (action === 'duplicate') {
        const copy = await duplicateMailTemplate(id, actor);
        await appendSuperAdminAudit({
          action: 'mail.template.duplicated', targetType: 'mail_template',
          targetId: copy!.id, details: { copiedFrom: id, name: copy!.name },
        }).catch(() => {});
        return NextResponse.json({ template: copy });
      }

      /* Archiving keeps the record: campaigns and drafts already built from it
         are unaffected, and nothing is silently deleted. */
      const updated = await saveMailTemplate({
        id, name: source.name, subject: source.subject, html: source.html,
        preheader: source.preheader, category: source.category,
        status: action === 'archive' ? 'archived' : 'active',
        baseRevision: source.revision, actor,
      });
      await appendSuperAdminAudit({
        action: `mail.template.${action}d`, targetType: 'mail_template',
        targetId: id, details: { name: source.name },
      }).catch(() => {});
      return NextResponse.json({ template: updated });
    }

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'A template name is required.' }, { status: 400 });
    const subject = String(body.subject ?? '').trim();
    if (!subject) return NextResponse.json({ error: 'A subject is required.' }, { status: 400 });

    const isNew = !body.id;
    const template = await saveMailTemplate({
      id: typeof body.id === 'string' ? body.id : undefined,
      name,
      subject,
      html: String(body.html ?? ''),
      preheader: typeof body.preheader === 'string' ? body.preheader : undefined,
      category: typeof body.category === 'string' ? body.category : undefined,
      baseRevision: typeof body.revision === 'number' ? body.revision : undefined,
      /* Session identity, never the payload. */
      actor,
    });

    await appendSuperAdminAudit({
      action: isNew ? 'mail.template.created' : 'mail.template.updated',
      targetType: 'mail_template', targetId: template.id,
      details: { name: template.name, category: template.category },
    }).catch(() => { /* never fail a save for the audit trail */ });

    return NextResponse.json({
      template,
      /* Reported, not silently substituted: an unresolved variable must block
         a send rather than mail a literal "{{city}}". */
      unknown: unknownVariables(`${template.subject} ${template.html}`),
    });
  } catch (error) {
    if (error instanceof TemplateConflictError) {
      return NextResponse.json(
        { error: error.message, conflict: true, template: error.current }, { status: 409 });
    }
    console.error('[super-admin/mail/templates POST]', error);
    return NextResponse.json({ error: 'Unable to save template.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'A template id is required.' }, { status: 400 });
  try {
    const existing = await getMailTemplateById(id);
    if (!existing) return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    await deleteMailTemplate(id);
    await appendSuperAdminAudit({
      action: 'mail.template.deleted', targetType: 'mail_template',
      targetId: id, details: { name: existing.name },
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to delete template.' }, { status: 500 });
  }
}
