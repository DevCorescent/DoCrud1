import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { approveGigsSafetyReport, listGigsSafetyReports, rejectGigsSafetyReport } from '@/lib/server/gigs-safety';
import { getOriginForRequest } from '@/lib/server/request';
import { sendTrackedMail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(1200, Number(searchParams.get('limit') || '400')));
  const status = String(searchParams.get('status') || 'all').trim();
  const reports = await listGigsSafetyReports(limit);
  const filtered = status === 'pending' || status === 'approved' || status === 'rejected'
    ? reports.filter((r) => r.status === status)
    : reports;
  return NextResponse.json({ reports: filtered }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => null) as any;
    const id = typeof body?.id === 'string' ? body.id : '';
    const action = body?.action === 'approve' || body?.action === 'reject' ? body.action : '';
    const adminNote = typeof body?.adminNote === 'string' ? body.adminNote : undefined;
    if (!id || !action) return NextResponse.json({ error: 'Update payload is incomplete.' }, { status: 400 });

    const origin = getOriginForRequest(request);
    const report = action === 'approve'
      ? await approveGigsSafetyReport({ reportId: id, adminNote })
      : await rejectGigsSafetyReport({ reportId: id, adminNote });

    if (action === 'approve' && report?.accusedEmail) {
      const users = await getStoredUsers();
      const accused = users.find((u) => u.id === report.accusedUserId) || null;
      const suspendedUntil = accused?.safety?.suspendedUntil || '';
      const evidenceList = (report.evidence || []).slice(0, 3);
      const inlineImage = evidenceList.find((ev) => String(ev.dataUrl || '').startsWith('data:image/'))?.dataUrl || '';

      await sendTrackedMail({
        policyKey: 'gigs_safety',
        typeLabel: 'system',
        to: report.accusedEmail,
        subject: 'Account warning: Gig safety report approved',
        preheader: 'A safety report was approved by the admin team.',
        text: `A gig safety report was approved.\n\nReason: ${report.reason}\nGig: ${origin}/gigs/${report.gigSlug}\nEvidence: ${(evidenceList.map((e) => e.name).join(', ') || 'Provided')}\nSuspension until: ${suspendedUntil || 'N/A'}\n\nGuidelines:\n- Keep communication professional and transparent.\n- Do not request off-platform payments.\n- Share only relevant information.\n`,
        html: `
          <div style="padding: 18px 18px 0;">
            <p style="margin:0; font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#64748b; font-weight:700;">Account warning</p>
            <h2 style="margin:10px 0 0; font-size:22px; color:#0f172a;">Safety report approved</h2>
            <p style="margin:10px 0 0; font-size:14px; color:#334155; line-height:1.7;">Your account has been flagged with a warning badge. You may be temporarily suspended from bids/proposals.</p>
          </div>
          <div style="padding:18px;">
            <div style="border:1px solid #e2e8f0; border-radius:18px; padding:16px; background:#ffffff;">
              <p style="margin:0; font-size:14px; color:#0f172a;"><strong>Reason</strong></p>
              <p style="margin:8px 0 0; font-size:14px; color:#334155; line-height:1.7;">${report.reason}</p>
              ${report.details ? `<p style="margin:12px 0 0; font-size:12px; color:#64748b; white-space:pre-wrap; line-height:1.7;">${report.details.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : ''}
              ${evidenceList.length ? `<p style="margin:12px 0 0; font-size:12px; color:#64748b;"><strong>Proofs:</strong> ${evidenceList.map((e) => e.name.replace(/</g, '&lt;').replace(/>/g, '&gt;')).join(', ')}</p>` : ''}
              ${inlineImage ? `<div style="margin-top:12px;"><img src="${inlineImage}" alt="Evidence" style="width:100%; max-width:520px; border-radius:14px; border:1px solid #e2e8f0;" /></div>` : ''}
              ${suspendedUntil ? `<p style="margin:12px 0 0; font-size:13px; color:#0f172a;"><strong>Suspended until:</strong> <span style="color:#334155;">${new Date(suspendedUntil).toLocaleString('en-IN')}</span></p>` : ''}
            </div>
            <div style="margin-top:14px; border:1px solid #e2e8f0; border-radius:18px; padding:14px; background:#f8fafc; color:#334155; font-size:13px; line-height:1.7;">
              <strong>Guidelines</strong>
              <ul style="margin:10px 0 0; padding-left:18px;">
                <li>Keep terms and timelines explicit.</li>
                <li>Avoid off-platform payments or pressure tactics.</li>
                <li>Only share verifiable work and proofs.</li>
              </ul>
            </div>
          </div>
        `,
        origin,
        metadata: {
          reportId: report.id,
          type: 'gigs_safety_approved',
        },
      });
    }

    return NextResponse.json({ report }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update report.' }, { status: 400 });
  }
}
