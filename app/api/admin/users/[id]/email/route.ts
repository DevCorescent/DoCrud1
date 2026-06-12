import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { sendTrackedMail } from '@/lib/server/mailer';
import { appendAdminAuditEvent } from '@/lib/server/admin-audit';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session || !isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const params = await ctx.params;
    const id = String(params?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'User id is required' }, { status: 400 });

    const payload = await request.json().catch(() => null) as any;
    const subject = String(payload?.subject || '').trim().slice(0, 140);
    const message = String(payload?.message || '').trim().slice(0, 8000);
    if (!subject || !message) {
      return NextResponse.json({ error: 'subject and message are required' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const target = users.find((u) => u.id === id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const origin = request.nextUrl.origin;
    const sentBy = session.user.email || 'admin';

    const result = await sendTrackedMail({
      policyKey: 'admin_user_message',
      typeLabel: 'system',
      to: target.email,
      subject,
      text: message,
      sentBy,
      origin,
      metadata: {
        targetUserId: target.id,
        targetRole: target.role,
      },
    });

    await appendAdminAuditEvent({
      actorUserId: session.user.id || 'admin',
      actorEmail: session.user.email || undefined,
      actorRole: session.user.role || undefined,
      targetUserId: target.id,
      targetEmail: target.email,
      action: 'send_email',
      reason: `Subject: ${subject}`,
      metadata: {
        outboxId: result.outboxId,
        skipped: result.skipped ? 'true' : 'false',
      },
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send email' }, { status: 500 });
  }
}
