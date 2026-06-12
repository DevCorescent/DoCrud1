import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import {
  getAllVerifications,
  reviewVerification,
  getVerificationForPage,
} from '@/lib/server/business-verification';
import type { VerificationStatus } from '@/lib/server/business-verification';
import {
  sendVerificationApprovedEmail,
  sendVerificationRejectedEmail,
} from '@/lib/server/business-verification-emails';
import { getBusinessPageById } from '@/lib/server/business-pages';
import { getStoredUserById } from "@/lib/server/users";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { valid } = await getSuperAdminSessionFromRequest(req);
  if (!valid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status') as VerificationStatus | null;
  const list = await getAllVerifications(status ?? undefined);
  return NextResponse.json({ verifications: list });
}

export async function PATCH(req: NextRequest) {
  const { valid, email: adminEmail } = await getSuperAdminSessionFromRequest(req);
  if (!valid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, status, adminNotes } = await req.json() as {
    id: string;
    status: 'approved' | 'rejected';
    adminNotes?: string;
  };

  if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
  if (status === 'rejected' && !adminNotes?.trim()) {
    return NextResponse.json({ error: 'Admin notes are required when rejecting' }, { status: 400 });
  }

  const updated = await reviewVerification(id, status, adminNotes ?? '', adminEmail ?? 'admin');
  if (!updated) return NextResponse.json({ error: 'Verification not found' }, { status: 404 });

  // ── Send decision email to business owner (non-blocking) ──────────────────
  void (async () => {
    try {
      // Get business page for its name + slug
      const page = await getBusinessPageById(updated.businessPageId);
      const businessName = page?.name ?? updated.legalName;

      // Get owner details
      const user = await getStoredUserById(updated.ownerUserId);
      const ownerEmail = user?.email ?? updated.contactEmail;
      const ownerName  = user?.name  ?? updated.contactName ?? 'Business Owner';

      if (status === 'approved') {
        await sendVerificationApprovedEmail({
          ownerEmail,
          ownerName,
          businessName,
          verif: updated,
          adminNotes: adminNotes?.trim(),
        });
      } else {
        await sendVerificationRejectedEmail({
          ownerEmail,
          ownerName,
          businessName,
          verif: updated,
          adminNotes: adminNotes ?? '',
        });
      }
    } catch { /* email failure must not break the API response */ }
  })();

  return NextResponse.json({ verification: updated });
}
