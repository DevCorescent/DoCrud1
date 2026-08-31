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
    const drafts = (await getMailDrafts()).map((d) => ({
      id: d.id, subject: d.subject, updatedAt: d.updatedAt, updatedBy: d.updatedBy,
      hasAttachments: Boolean(d.attachments?.length),
    }));
    return NextResponse.json({ drafts });
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
