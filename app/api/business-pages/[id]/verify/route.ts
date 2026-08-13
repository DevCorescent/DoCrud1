import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getVerificationForPage, submitVerification } from '@/lib/server/business-verification';
import { getBusinessPageById, getBusinessPageBySlug } from '@/lib/server/business-pages';
import {
  sendVerificationSubmittedEmail,
  sendVerificationAdminAlertEmail,
} from '@/lib/server/business-verification-emails';
import { getStoredUserById } from "@/lib/server/users";

export const dynamic = 'force-dynamic';

/**
 * [id] may be either the page UUID or the page slug.
 *
 * The UI calls this route with `page.id` (a randomUUID from POST /api/business-pages),
 * exactly like every other /api/business-pages/[id]/* route, while shared/public links
 * use the slug. Resolving only by slug meant a UUID never matched and every submission
 * 404'd. This mirrors the id-or-slug resolution in app/api/business-pages/[id]/route.ts.
 */
async function resolvePage(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id)
    ? await getBusinessPageById(id)
    : await getBusinessPageBySlug(id);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const page = await resolvePage(params.id);
  const pageId = page?.id ?? params.id;

  const verif = await getVerificationForPage(pageId);
  return NextResponse.json({ verification: verif });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve UUID or slug → page
  const page = await resolvePage(params.id);
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

  let body: Record<string, string>;
  try {
    body = await req.json() as Record<string, string>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // ── Validate required fields (the * fields in the submission form) ──
  // Without this a submission with blank fields was stored as a pending request,
  // leaving the admin queue to reject empty records.
  const REQUIRED: Array<[key: string, label: string]> = [
    ['legalName',         'Legal business name'],
    ['businessType',      'Business type'],
    ['registrationNumber','Registration / CIN number'],
    ['pan',               'PAN'],
    ['registeredAddress', 'Registered address'],
    ['city',              'City'],
    ['state',             'State'],
    ['pincode',           'Pincode'],
    ['contactName',       'Contact person name'],
    ['contactEmail',      'Contact email'],
    ['contactPhone',      'Contact phone'],
  ];
  const missing = REQUIRED.filter(([k]) => !String(body[k] ?? '').trim()).map(([, label]) => label);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Please complete: ${missing.join(', ')}`, missingFields: missing },
      { status: 400 },
    );
  }

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
