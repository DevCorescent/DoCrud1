import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getInviteByToken, acceptInvite } from '@/lib/server/business-members';
import { getBusinessPageById } from '@/lib/server/business-pages';

export const dynamic = 'force-dynamic';

/** GET — preview invite details (public, no auth required) */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const invite = await getInviteByToken(params.token);
    if (!invite) return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });

    const page = await getBusinessPageById(invite.businessPageId);
    if (!page) return NextResponse.json({ error: 'Business page not found.' }, { status: 404 });

    // Compute validity
    const expired  = invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
    const maxed    = (invite.maxUses != null) ? invite.useCount >= invite.maxUses : false;
    const valid    = invite.isActive && !expired && !maxed;

    return NextResponse.json({
      valid,
      reason: !invite.isActive ? 'revoked' : expired ? 'expired' : maxed ? 'limit_reached' : null,
      invite: {
        id: invite.id,
        label: invite.label,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        useCount: invite.useCount,
      },
      page: {
        id: page.id,
        slug: page.slug,
        name: page.name,
        tagline: page.tagline,
        logoUrl: page.logoUrl,
        coverUrl: page.coverUrl,
        industry: page.industry,
        companySize: page.companySize,
        city: page.city,
        country: page.country,
        verified: page.verified,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST — accept the invite (authenticated) */
export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'You must be logged in to accept this invite.', code: 'AUTH_REQUIRED' }, { status: 401 });
    }

    const result = await acceptInvite({ token: params.token, userId: session.user.id });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const page = await getBusinessPageById(result.invite.businessPageId);
    return NextResponse.json({
      success: true,
      member: result.member,
      pageSlug: page?.slug,
      pageName: page?.name,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
