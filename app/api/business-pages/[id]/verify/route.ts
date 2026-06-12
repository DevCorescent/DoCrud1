import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getVerificationForPage, submitVerification } from '@/lib/server/business-verification';
import { getBusinessPageBySlug } from '@/lib/server/business-pages';
import {
  sendVerificationSubmittedEmail,
  sendVerificationAdminAlertEmail,
} from '@/lib/server/business-verification-emails';
import { getStoredUserById } from "@/lib/server/users";

export const dynamic = 'force-dynamic';

// [id] in this route is the page SLUG — we resolve it to the UUID before saving

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const page = await getBusinessPageBySlug(params.id);
  const pageId = page?.id ?? params.id;

  const verif = await getVerificationForPage(pageId);
  return NextResponse.json({ verification: verif });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve slug → page
  const page = await getBusinessPageBySlug(params.id);
  if (!page) return NextResponse.json({ error: 'Business page not found' }, { status: 404 });

  // Ownership check
  if (page.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden — you do not own this page' }, { status: 403 });
  }

  // Prevent duplicate pending/approved submissions
  const existing = await getVerificationForPage(page.id);
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return NextResponse.json({ error: 'Verification already submitted', verification: existing }, { status: 409 });
  }

  const body = await req.json() as Record<string, string>;

  const verif = await submitVerification({
    businessPageId: page.id,
    ownerUserId: session.user.id,
    legalName: body.legalName,
    businessType: body.businessType,
    registrationNumber: body.registrationNumber,
    gstin: body.gstin || undefined,
    pan: body.pan,
    registeredAddress: body.registeredAddress,
    city: body.city,
    state: body.state,
    pincode: body.pincode,
    country: body.country || 'India',
    website: body.website || undefined,
    contactName: body.contactName,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
    yearsInBusiness: body.yearsInBusiness || undefined,
    employeeCount: body.employeeCount || undefined,
    annualRevenue: body.annualRevenue || undefined,
    businessCategory: body.businessCategory || undefined,
  });

  // ── Fire emails (non-blocking — don't let email failure break the response) ──
  const ownerEmail = session.user.email ?? verif.contactEmail;
  const ownerName  = session.user.name  ?? verif.contactName ?? 'Business Owner';

  // Try to get a richer name from user profile
  try {
    const user = await getStoredUserById(session.user.id);
    const resolvedName  = user?.name  ?? ownerName;
    const resolvedEmail = user?.email ?? ownerEmail;

    void sendVerificationSubmittedEmail({
      ownerEmail: resolvedEmail,
      ownerName:  resolvedName,
      businessName: page.name,
      verif,
    }).catch(() => {});

    void sendVerificationAdminAlertEmail({
      businessName: page.name,
      ownerEmail:   resolvedEmail,
      verif,
    }).catch(() => {});
  } catch {
    // Fallback with session data
    void sendVerificationSubmittedEmail({
      ownerEmail,
      ownerName,
      businessName: page.name,
      verif,
    }).catch(() => {});

    void sendVerificationAdminAlertEmail({
      businessName: page.name,
      ownerEmail,
      verif,
    }).catch(() => {});
  }

  return NextResponse.json({ verification: verif }, { status: 201 });
}
