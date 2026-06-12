import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getAllServices, getAllBookings, getAllReviews } from '@/lib/server/services';
import { getStoredUsers } from '@/lib/server/auth';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [servicesRaw, allBookings, allReviews, users] = await Promise.all([
      getAllServices().catch(() => ({} as Record<string, unknown[]>)),
      getAllBookings().catch(() => []),
      getAllReviews().catch(() => []),
      getStoredUsers(),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));

    type Service = { id: string; userId: string; title: string; description?: string; category?: string; deliveryUnit?: string; priceInPaise?: number; bookingCount?: number; rating?: number; reviewCount?: number; isActive?: boolean; createdAt?: string };

    const allServices: Service[] = Object.values(servicesRaw || {}).flatMap((v) => Array.isArray(v) ? v : [v]) as Service[];

    const now = Date.now();
    const day30 = now - 30 * 86400000;
    const day7 = now - 7 * 86400000;

    // Booking status distribution
    const bookingStatuses: Record<string, number> = {};
    allBookings.forEach((b) => { bookingStatuses[b.status] = (bookingStatuses[b.status] || 0) + 1; });

    // Category distribution
    const categories: Record<string, number> = {};
    allServices.forEach((s) => { const c = s.category || 'Other'; categories[c] = (categories[c] || 0) + 1; });

    // Revenue from completed bookings
    const completedBookings = allBookings.filter((b) => b.status === 'completed');
    const totalRevenuePaise = completedBookings.reduce((s, b) => s + ((b.price || 0) * 100), 0);
    const recentRevenue30d = completedBookings.filter((b) => b.createdAt && new Date(b.createdAt).getTime() >= day30).reduce((s, b) => s + ((b.price || 0) * 100), 0);

    // Average rating
    const totalRating = allReviews.reduce((s, r) => s + r.rating, 0);
    const avgRating = allReviews.length > 0 ? (totalRating / allReviews.length).toFixed(1) : '0.0';

    // Top services by bookings
    const bookingsByService: Record<string, number> = {};
    allBookings.forEach((b) => { bookingsByService[b.serviceId || ''] = (bookingsByService[b.serviceId || ''] || 0) + 1; });

    const topServices = [...allServices]
      .sort((a, b) => (bookingsByService[b.id] || 0) - (bookingsByService[a.id] || 0))
      .slice(0, 15)
      .map((s) => ({
        id: s.id,
        title: s.title,
        category: s.category,
        priceInPaise: s.priceInPaise,
        bookings: bookingsByService[s.id] || 0,
        rating: s.rating,
        reviewCount: s.reviewCount,
        isActive: s.isActive,
        providerName: userMap.get(s.userId)?.name || s.userId,
        providerEmail: userMap.get(s.userId)?.email || '',
        createdAt: s.createdAt,
      }));

    // Recent bookings
    const recentBookings = [...allBookings]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 20)
      .map((b) => ({
        id: b.id,
        status: b.status,
        priceInPaise: (b.price || 0) * 100,
        clientName: b.clientName,
        clientEmail: b.clientEmail,
        providerName: userMap.get(b.serviceUserId)?.name || b.serviceUserId,
        serviceName: b.serviceTitle || allServices.find((s) => s.id === b.serviceId)?.title || b.serviceId,
        createdAt: b.createdAt,
      }));

    // Recent bookings 7d count
    const bookings7d = allBookings.filter((b) => b.createdAt && new Date(b.createdAt).getTime() >= day7).length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalServices: allServices.length,
        activeServices: allServices.filter((s) => s.isActive !== false).length,
        totalBookings: allBookings.length,
        completedBookings: completedBookings.length,
        pendingBookings: allBookings.filter((b) => b.status === 'pending').length,
        bookings7d,
        totalReviews: allReviews.length,
        avgRating,
        totalRevenuePaise,
        recentRevenue30d,
      },
      bookingStatuses,
      categories,
      topServices,
      recentBookings,
    });
  } catch (err) {
    console.error('[super-admin/services-overview GET]', err);
    return NextResponse.json({ error: 'Failed to load services data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, serviceId, userId } = await req.json() as { action: string; serviceId?: string; userId?: string };

    await appendSuperAdminAudit({
      action: `service_${action}`,
      targetType: 'service',
      targetId: serviceId,
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    if (action === 'remove_service' && serviceId) {
      const { getUserServices, deleteService } = await import('@/lib/server/services');
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
      await deleteService(userId, serviceId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/services-overview POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
