import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { sanitizeHtml } from '@/lib/server/security';
import { getServiceLeadById } from '@/lib/server/service-leads';
import { getServiceEnquiryById } from '@/lib/server/service-enquiries';
import { getBookingById } from '@/lib/server/services';
import {
  createServiceReport,
  SERVICE_REPORT_REASONS,
  type ServiceReportTarget,
} from '@/lib/server/service-safety';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

/**
 * §25 Report enquiry.
 *
 * Only a party to the record may report it, and the reported user is derived
 * from the record — never taken from the request — so nobody can file a report
 * against an arbitrary account.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Please sign in to report.' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as
      | { targetType?: string; targetId?: string; reason?: string; details?: string }
      | null;
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

    const targetType = String(body.targetType ?? '').trim() as ServiceReportTarget;
    const targetId = String(body.targetId ?? '').trim();
    const reason = String(body.reason ?? '').trim();
    const details = typeof body.details === 'string' ? sanitizeHtml(body.details).trim() : undefined;

    if (!['enquiry', 'booking', 'lead'].includes(targetType)) {
      return NextResponse.json({ error: 'Unknown report target.' }, { status: 400 });
    }
    if (!targetId) return NextResponse.json({ error: 'targetId is required.' }, { status: 400 });
    if (!SERVICE_REPORT_REASONS.includes(reason as (typeof SERVICE_REPORT_REASONS)[number])) {
      return NextResponse.json({ error: 'Select a valid reason.' }, { status: 400 });
    }

    /* Resolve the record, confirm the reporter is party to it, and derive who
       is being reported from the stored data. */
    let reportedUserId = '';
    let serviceId: string | undefined;

    if (targetType === 'lead') {
      const lead = await getServiceLeadById(targetId);
      if (!lead) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      if (lead.providerId !== actor.id && lead.customerId !== actor.id) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      }
      reportedUserId = lead.providerId === actor.id ? lead.customerId : lead.providerId;
      serviceId = lead.serviceId;
    } else if (targetType === 'enquiry') {
      const enquiry = await getServiceEnquiryById(targetId);
      if (!enquiry) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      if (enquiry.providerId !== actor.id && enquiry.customerId !== actor.id) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      }
      reportedUserId = enquiry.providerId === actor.id ? enquiry.customerId : enquiry.providerId;
      serviceId = enquiry.serviceId;
    } else {
      const booking = await getBookingById(targetId);
      if (!booking) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      const isProvider = booking.serviceUserId === actor.id;
      const isClient = booking.clientId === actor.id;
      if (!isProvider && !isClient) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      reportedUserId = isProvider ? (booking.clientId ?? '') : booking.serviceUserId;
      serviceId = booking.serviceId;
    }

    if (!reportedUserId || reportedUserId === actor.id) {
      return NextResponse.json({ error: 'You cannot report yourself.' }, { status: 400 });
    }

    const { report, duplicate } = await createServiceReport({
      reporterId: actor.id,
      targetType,
      targetId,
      reportedUserId,
      serviceId,
      reason,
      details,
    });

    return NextResponse.json(
      {
        duplicate,
        report: { id: report.id, targetType: report.targetType, targetId: report.targetId, reason: report.reason, status: report.status, createdAt: report.createdAt },
        message: duplicate ? 'You have already reported this.' : 'Report submitted. Our team will review it.',
      },
      { status: duplicate ? 200 : 201 },
    );
  } catch (error) {
    console.error('[services/safety/report] POST error', error);
    return NextResponse.json({ error: 'Failed to submit the report.' }, { status: 500 });
  }
}
