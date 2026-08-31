/**
 * Super Admin suppression list.
 *
 * GET     paginated, searchable, filterable
 * POST    add an administrative suppression
 * DELETE  lift an administrative suppression
 *
 * A recipient's unsubscribe cannot be lifted here. The store refuses it, and
 * this route reports the refusal rather than pretending it succeeded.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import {
  getSuppressionRecords, addSuppression, removeSuppression, normalizeEmail,
} from '@/lib/server/mail-suppression';
import { isValidEmail } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const search = normalizeEmail(p.get('search') || '').slice(0, 200);
  const reason = p.get('reason');
  const activeParam = p.get('active');
  const page = Math.max(1, Number(p.get('page')) || 1);

  let records = await getSuppressionRecords();
  if (search) records = records.filter((r) => r.email.includes(search));
  if (reason === 'unsubscribe' || reason === 'admin_suppressed') {
    records = records.filter((r) => r.reason === reason);
  }
  if (activeParam === 'true') records = records.filter((r) => r.active);
  else if (activeParam === 'false') records = records.filter((r) => !r.active);

  records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const total = records.length;
  const start = (page - 1) * PAGE_SIZE;

  return NextResponse.json({
    records: records.slice(start, start + PAGE_SIZE),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actor = session.email || 'super-admin';

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const email = normalizeEmail(String(body.email ?? ''));
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const { record, created } = await addSuppression({
    email, reason: 'admin_suppressed', actor, source: 'admin',
  });

  await appendSuperAdminAudit({
    action: 'mail.suppression.added',
    targetType: 'mail_suppression',
    targetId: email,
    /* The address is the subject of the action, so it belongs here. Nothing
       else does - no token, no content, no credential. */
    details: { reason: record.reason, created: String(created) },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    record,
    /* Adding an address that is already suppressed is not an error, and saying
       so is more useful than a silent success. */
    alreadySuppressed: !created,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actor = session.email || 'super-admin';

  const email = normalizeEmail(new URL(req.url).searchParams.get('email') || '');
  if (!email) return NextResponse.json({ error: 'An email address is required.' }, { status: 400 });

  const result = await removeSuppression(email, actor);
  if (!result.ok) {
    if (result.reason === 'unsubscribe_protected') {
      return NextResponse.json({
        error: 'This person unsubscribed themselves. An administrator cannot re-enable '
          + 'marketing email on their behalf.',
      }, { status: 409 });
    }
    return NextResponse.json({ error: 'No active suppression for that address.' }, { status: 404 });
  }

  await appendSuperAdminAudit({
    action: 'mail.suppression.removed',
    targetType: 'mail_suppression',
    targetId: email,
    details: { reason: 'admin_suppressed' },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
