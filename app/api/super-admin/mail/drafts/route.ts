/**
 * GET/POST/DELETE /api/super-admin/mail/drafts — Compose drafts.
 *
 * `createdBy`/`updatedBy` come from the authenticated Super Admin session, not
 * from the request body: an identity the browser supplies is not an identity.
 *
 * HTML is sanitized inside `saveMailDraft`, so it cannot reach storage
 * unsanitized regardless of which caller writes it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import {
  getMailDrafts, getMailDraftById, saveMailDraft, deleteMailDraft,
  duplicateMailDraft, DraftConflictError,
} from '@/lib/server/mail-drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  return session.valid ? session : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      const draft = await getMailDraftById(id);
      if (!draft) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
      return NextResponse.json({ draft });
    }
    /* The list omits bodies: it feeds a picker, not an editor. */
    const params = new URL(req.url).searchParams;
    const search = (params.get('q') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(params.get('page')) || 1);
    const PAGE_SIZE = 20;

    let all = await getMailDrafts();
    if (search) all = all.filter((d) => d.subject.toLowerCase().includes(search));

    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;

    return NextResponse.json({
      drafts: all.slice(start, start + PAGE_SIZE).map((d) => ({
        id: d.id, subject: d.subject, updatedAt: d.updatedAt, updatedBy: d.updatedBy,
        createdAt: d.createdAt, createdBy: d.createdBy, revision: d.revision,
        hasAttachments: Boolean(d.attachments?.length),
        audienceMode: (d.audience as { mode?: string } | undefined)?.mode ?? null,
      })),
      total, page, totalPages,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load drafts.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  if (body.action === 'duplicate') {
    const sourceId = String(body.id ?? '');
    if (!sourceId) return NextResponse.json({ error: 'A draft id is required.' }, { status: 400 });
    const copy = await duplicateMailDraft(sourceId, session.email || 'super-admin');
    if (!copy) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    await appendSuperAdminAudit({
      action: 'mail.draft.duplicated', targetType: 'mail_draft', targetId: copy.id,
      details: { copiedFrom: sourceId },
    }).catch(() => {});
    return NextResponse.json({ draft: copy });
  }

  const subject = String(body.subject ?? '').trim();
  if (!subject) {
    return NextResponse.json({ error: 'A subject is required.' }, { status: 400 });
  }

  try {
    const isNew = !body.id;
    const draft = await saveMailDraft({
      id: typeof body.id === 'string' ? body.id : undefined,
      subject,
      html: String(body.html ?? ''),
      preheader: typeof body.preheader === 'string' ? body.preheader : undefined,
      replyTo: typeof body.replyTo === 'string' ? body.replyTo : undefined,
      cc: Array.isArray(body.cc) ? body.cc.map(String) : undefined,
      bcc: Array.isArray(body.bcc) ? body.bcc.map(String) : undefined,
      attachments: Array.isArray(body.attachments)
        ? (body.attachments as never[]).slice(0, 10) : undefined,
      audience: body.audience,
      scheduleAt: typeof body.scheduleAt === 'string' ? body.scheduleAt : undefined,
      scheduleTimezone: typeof body.scheduleTimezone === 'string' ? body.scheduleTimezone : undefined,
      baseRevision: typeof body.revision === 'number' ? body.revision : undefined,
      /* Session identity, never the payload. */
      actor: session.email || 'super-admin',
    });

    /* Autosave would otherwise flood the audit log; only a first save is a
       distinct administrative action worth recording. */
    if (isNew) {
      await appendSuperAdminAudit({
        action: 'mail.draft.created',
        targetType: 'mail_draft',
        targetId: draft.id,
        details: { subject: draft.subject },
      }).catch(() => { /* never fail a save for the audit trail */ });
    }

    return NextResponse.json({ draft });
  } catch (error) {
    /* A stale write is a conflict, not a server fault. The current draft is
       returned so the client can reconcile instead of guessing. */
    if (error instanceof DraftConflictError) {
      return NextResponse.json(
        { error: error.message, conflict: true, draft: error.current }, { status: 409 });
    }
    console.error('[super-admin/mail/drafts]', error);
    return NextResponse.json({ error: 'Unable to save draft.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'A draft id is required.' }, { status: 400 });
  try {
    await deleteMailDraft(id);
    await appendSuperAdminAudit({
      action: 'mail.draft.deleted', targetType: 'mail_draft', targetId: id,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to delete draft.' }, { status: 500 });
  }
}
