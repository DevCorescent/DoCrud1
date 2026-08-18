import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getUserServices, getBookingsForProvider, getProviderAnalytics } from '@/lib/server/services';
import { listServiceLeadsForProvider } from '@/lib/server/service-leads';

export const dynamic = 'force-dynamic';

/**
 * §36 Provider Service Dashboard.
 *
 * Pure composition: every number here comes from an existing helper
 * (`getUserServices`, `listServiceLeadsForProvider`, `getBookingsForProvider`,
 * `getProviderAnalytics`). No new aggregation, no second analytics system.
 */
async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

export async function GET() {
  try {
    /* Provider identity comes from the session only — never from the request. */
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [services, leadsPage, bookings, analytics] = await Promise.all([
      getUserServices(actor.id),
      listServiceLeadsForProvider({ providerId: actor.id, limit: 60 }),
      getBookingsForProvider(actor.id),
      getProviderAnalytics(actor.id).catch(() => null),
    ]);
    const leads = leadsPage.leads;

    /* SERVICES — the model carries `isActive` only; there is no draft state, so
       Draft is reported as unsupported rather than invented. */
    const servicesSection = {
      active: services.filter((s) => s.isActive).length,
      paused: services.filter((s) => !s.isActive).length,
      draft: 0,
      draftSupported: false,
      total: services.length,
    };

    /* LEADS — mapped from the §23 lead lifecycle. */
    const ACTIVE_DISCUSSION: string[] = ['contacted', 'discussion', 'quote_sent'];
    const leadsSection = {
      newEnquiries: leads.filter((l) => l.type === 'enquiry' && l.status === 'new').length,
      bookingRequests: leads.filter((l) => l.type === 'booking' && l.status === 'booking_requested').length,
      activeDiscussions: leads.filter((l) => ACTIVE_DISCUSSION.includes(l.status)).length,
      total: leadsPage.total,
    };

    /* BOOKINGS — from the existing BookingStatus values. "In Progress" is not a
       booking status; it lives on the lead lifecycle, so it is read from there. */
    const bookingsSection = {
      requested: bookings.filter((b) => b.status === 'pending').length,
      accepted: bookings.filter((b) => b.status === 'confirmed').length,
      inProgress: leads.filter((l) => l.type === 'booking' && l.status === 'in_progress').length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      total: bookings.length,
    };

    /* PERFORMANCE — straight off the §35 funnel; conversion rate keeps the
       existing definition (`overallConversionRate`). */
    const funnel = analytics?.funnel;
    const performance = {
      serviceViews: analytics?.totalViews ?? 0,
      catalogueViews: funnel?.catalogueOpens ?? 0,
      saves: funnel?.saves ?? 0,
      enquiries: funnel?.enquiries ?? 0,
      bookingRequests: funnel?.bookingRequests ?? bookings.length,
      conversionRate: analytics?.overallConversionRate ?? 0,
      impressions: funnel?.impressions ?? 0,
      completedServices: funnel?.completedServices ?? bookingsSection.completed,
      available: Boolean(analytics),
    };

    return NextResponse.json({
      services: servicesSection,
      leads: leadsSection,
      bookings: bookingsSection,
      performance,
    });
  } catch (error) {
    console.error('[services/dashboard] GET error', error);
    return NextResponse.json({ error: 'Failed to load your dashboard.' }, { status: 500 });
  }
}
