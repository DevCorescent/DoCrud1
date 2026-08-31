/**
 * Super Admin system (transactional) email configuration.
 *
 * GET            the registry plus each type's saved configuration
 * GET ?type=     one type, with its variables and sample data
 * POST           save the DRAFT (send `revision` to guard a stale write)
 * POST action=publish | reset
 *
 * Saving never changes production. Only publish does, and only after the
 * content validates — an unsupported variable would otherwise reach a user as
 * a literal `{{something}}`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import {
  SYSTEM_EMAILS, getSystemEmailDefinition, getSystemEmailConfig, getAllSystemEmailConfigs,
  saveSystemEmailDraft, publishSystemEmail, resetSystemEmailToDefault,
  unsupportedVariables, renderSystemEmail, SystemEmailConflictError, type SystemEmailType,
} from '@/lib/server/system-emails';
import { sanitizeEmailHtml } from '@/lib/security/email-html-sanitizer';
import { emailHtmlToText } from '@/lib/email/html-to-text';
import { sendTrackedMail } from '@/lib/server/mailer';
import { classifyMailError } from '@/lib/server/mail-provider';
import { isValidEmail } from '@/lib/server/security';
import { getPublicAppBaseUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  return session.valid ? session : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const type = new URL(req.url).searchParams.get('type');

  try {
    if (type) {
      /* The type must be one the registry knows — an arbitrary string cannot
         address storage. */
      const def = getSystemEmailDefinition(type);
      if (!def) return NextResponse.json({ error: 'Unknown system email.' }, { status: 404 });
      const config = await getSystemEmailConfig(def.type);
      const subject = config?.draftSubject ?? def.defaultSubject;
      const html = config?.draftHtml ?? def.defaultHtml;
      return NextResponse.json({
        definition: def,
        config,
        draft: { subject, html },
        published: config?.publishedSubject
          ? { subject: config.publishedSubject, html: config.publishedHtml }
          : null,
        unsupported: unsupportedVariables(`${subject} ${html}`, def),
      });
    }

    const configs = await getAllSystemEmailConfigs();
    return NextResponse.json({
      emails: SYSTEM_EMAILS.map((def) => {
        const c = configs.find((x) => x.type === def.type);
        return {
          type: def.type, name: def.name, trigger: def.trigger, sender: def.sender,
          required: def.required,
          customised: Boolean(c),
          published: Boolean(c?.publishedSubject),
          /* A saved draft that has not been published is worth flagging: the
             admin may believe production already changed. */
          hasUnpublishedChanges: Boolean(
            c && (c.draftSubject !== c.publishedSubject || c.draftHtml !== c.publishedHtml)),
          updatedAt: c?.updatedAt ?? null,
          updatedBy: c?.updatedBy ?? null,
          publishedAt: c?.publishedAt ?? null,
          revision: c?.revision ?? 0,
        };
      }),
    });
  } catch (error) {
    console.error('[super-admin/mail/system-emails GET]', error);
    return NextResponse.json({ error: 'Unable to load system emails.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const def = getSystemEmailDefinition(String(body.type ?? ''));
  if (!def) return NextResponse.json({ error: 'Unknown system email.' }, { status: 404 });

  const actor = session.email || 'super-admin';
  const action = String(body.action ?? 'save');

  try {
    if (action === 'publish') {
      const result = await publishSystemEmail(def.type as SystemEmailType, actor);
      if ('error' in result) {
        return NextResponse.json(
          { error: result.error, unsupported: result.unsupported }, { status: 400 });
      }
      await appendSuperAdminAudit({
        action: 'mail.system_email.published',
        targetType: 'system_email', targetId: def.type,
        /* The subject can contain a variable NAME but never a value: no OTP,
           token or recipient is recorded here. */
        details: { name: def.name, revision: result.config.revision },
      }).catch(() => {});
      return NextResponse.json({ ok: true, config: result.config });
    }

    /* `action: 'test'` used to live here, as a second test-send implementation
       alongside the composer's. Both are now POST /api/super-admin/mail/test-send,
       which takes the source and type and applies THIS email's variable contract.
       One test send, one renderer, one set of rules. */

    if (action === 'reset') {
      const config = await resetSystemEmailToDefault(def.type as SystemEmailType, actor);
      await appendSuperAdminAudit({
        action: 'mail.system_email.reset',
        targetType: 'system_email', targetId: def.type, details: { name: def.name },
      }).catch(() => {});
      /* Restored as a DRAFT — production is unchanged until publish. */
      return NextResponse.json({ ok: true, config, published: false });
    }

    const subject = String(body.subject ?? '').trim();
    if (!subject) return NextResponse.json({ error: 'A subject is required.' }, { status: 400 });

    const config = await saveSystemEmailDraft({
      type: def.type as SystemEmailType,
      subject,
      html: String(body.html ?? ''),
      baseRevision: typeof body.revision === 'number' ? body.revision : undefined,
      actor,
    });

    await appendSuperAdminAudit({
      action: 'mail.system_email.updated',
      targetType: 'system_email', targetId: def.type,
      details: { name: def.name, revision: config.revision },
    }).catch(() => { /* never fail a save for the audit trail */ });

    return NextResponse.json({
      config,
      unsupported: unsupportedVariables(`${subject} ${config.draftHtml}`, def),
      /* Saving is explicitly not publishing. */
      published: false,
    });
  } catch (error) {
    if (error instanceof SystemEmailConflictError) {
      return NextResponse.json(
        { error: error.message, conflict: true, config: error.current }, { status: 409 });
    }
    console.error('[super-admin/mail/system-emails POST]', error);
    return NextResponse.json({ error: 'Unable to save the system email.' }, { status: 500 });
  }
}
