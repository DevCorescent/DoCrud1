import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getGigListings, saveGigListings, getGigConnections, getGigBids } from '@/lib/server/gigs';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') || '').toLowerCase();
  const status = searchParams.get('status') || 'all';
  const category = searchParams.get('category') || '';

  try {
    const [gigs, connections, bids] = await Promise.all([
      getGigListings(),
      getGigConnections(),
      getGigBids(),
    ]);

    let filtered = gigs;
    if (query) filtered = filtered.filter((g) => `${g.title} ${g.ownerName} ${g.ownerEmail} ${g.category} ${g.summary}`.toLowerCase().includes(query));
    if (status !== 'all') filtered = filtered.filter((g) => g.status === status);
    if (category) filtered = filtered.filter((g) => g.category === category);

    // Enrich with connection + bid counts
    const connMap: Record<string, number> = {};
    const bidMap: Record<string, number> = {};
    connections.forEach((c) => { connMap[c.gigId] = (connMap[c.gigId] || 0) + 1; });
    bids.forEach((b) => { bidMap[b.gigId] = (bidMap[b.gigId] || 0) + 1; });

    const enriched = filtered.map((g) => ({
      ...g,
      connectionCount: connMap[g.id] || 0,
      bidCount: bidMap[g.id] || 0,
    }));

    // Category distribution
    const catDist: Record<string, number> = {};
    gigs.forEach((g) => { catDist[g.category] = (catDist[g.category] || 0) + 1; });

    // Status distribution
    const statusDist: Record<string, number> = {};
    gigs.forEach((g) => { statusDist[g.status] = (statusDist[g.status] || 0) + 1; });

    // Top categories by connections
    const catConnections: Record<string, number> = {};
    connections.forEach((c) => {
      const gig = gigs.find((g) => g.id === c.gigId);
      if (gig) catConnections[gig.category] = (catConnections[gig.category] || 0) + 1;
    });

    // Recent activity
    const recentConnections = [...connections]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
    const recentBids = [...bids]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    return NextResponse.json({
      gigs: enriched,
      total: enriched.length,
      totalGigs: gigs.length,
      totalConnections: connections.length,
      totalBids: bids.length,
      categoryDistribution: catDist,
      statusDistribution: statusDist,
      categoryConnections: catConnections,
      recentConnections,
      recentBids,
    });
  } catch (err) {
    console.error('[super-admin/gigs GET]', err);
    return NextResponse.json({ error: 'Failed to load gigs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, gigId } = await req.json();
    const gigs = await getGigListings();
    const idx = gigs.findIndex((g) => g.id === gigId);
    if (idx === -1) return NextResponse.json({ error: 'Gig not found' }, { status: 404 });

    await appendSuperAdminAudit({ action: `gig_${action}`, targetType: 'gig', targetId: gigId, ip: req.headers.get('x-forwarded-for') || undefined });

    if (action === 'unpublish') {
      gigs[idx] = { ...gigs[idx], status: 'closed' };
      await saveGigListings(gigs);
      return NextResponse.json({ success: true });
    }
    if (action === 'delete') {
      await saveGigListings(gigs.filter((g) => g.id !== gigId));
      return NextResponse.json({ success: true });
    }
    if (action === 'feature') {
      const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      gigs[idx] = { ...gigs[idx], urgentUntil: until };
      await saveGigListings(gigs);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/gigs POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
