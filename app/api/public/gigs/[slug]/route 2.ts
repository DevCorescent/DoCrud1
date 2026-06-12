import { NextRequest, NextResponse } from 'next/server';
import { getPublicGigListings, getGigBids, getGigConnections } from '@/lib/server/gigs';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const slug = params.slug;
    const gigs = await getPublicGigListings();
    const gig = gigs.find((g) => g.slug === slug);
    if (!gig) {
      return NextResponse.json({ error: 'Gig not found' }, { status: 404 });
    }

    // Get bid count for this gig (without exposing bidder details publicly)
    const allBids = await getGigBids();
    const gigBids = allBids.filter((b) => b.gigId === gig.id);
    const bidCount = gigBids.length;
    const acceptedBidCount = gigBids.filter((b) => b.status === 'accepted').length;

    // Check if current user already bid
    const session = await getAuthSession();
    const userId = session?.user?.id;
    const userBid = userId
      ? gigBids.find((b) => b.bidderUserId === userId && b.status !== 'withdrawn')
      : null;

    // Related gigs (same category, excluding this one)
    const related = gigs
      .filter((g) => g.id !== gig.id && g.category === gig.category)
      .slice(0, 4);

    return NextResponse.json({
      gig,
      bidCount,
      acceptedBidCount,
      userBid: userBid
        ? { id: userBid.id, status: userBid.status, amountInRupees: userBid.amountInRupees, timelineLabel: userBid.timelineLabel, note: userBid.note }
        : null,
      related,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load gig' }, { status: 500 });
  }
}
