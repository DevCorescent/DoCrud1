import { readJsonFile, writeJsonFile, servicesPath, serviceBookingsPath, serviceReviewsPath, serviceAnalyticsPath, catalogueSettingsPath } from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';
import {
  existsServiceReviewForBooking,
  selectAllServiceReviewRows,
  selectServiceReviewAggregateForService,
  selectServiceReviewsForService,
  upsertServiceReviewRow,
} from '@/lib/server/db/service-reviews-rows';

export type ServiceCategory =
  | 'design'
  | 'development'
  | 'writing'
  | 'marketing'
  | 'consulting'
  | 'photography'
  | 'video'
  | 'music'
  | 'business'
  | 'legal'
  | 'finance'
  | 'coaching'
  | 'education'
  | 'health'
  /* Added to complete the specification's twenty-category list. The three
     values above that the list does not name (music, coaching, health) are
     kept so services already using them keep working. */
  | 'architecture'
  | 'engineering'
  | 'technology'
  | 'ai'
  | 'data'
  | 'hr'
  | 'events'
  | 'personal'
  | 'other';

export type PricingModel = 'fixed' | 'hourly' | 'starting_from' | 'contact';
/** Where the work happens. Absent on services created before this existed. */
export type ServiceWorkMode = 'remote' | 'onsite' | 'hybrid';
/** Provider-stated availability. Absent means the provider did not say. */
export type ServiceAvailability = 'available' | 'limited' | 'unavailable';
export type DeliveryUnit = 'hours' | 'days' | 'weeks' | 'months';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface ServicePackage {
  name: string;
  description: string;
  price: number;
  deliveryTime: number;
  deliveryUnit: DeliveryUnit;
  features: string[];
}

export interface Service {
  id: string;
  userId: string;
  title: string;
  tagline: string;
  description: string;
  category: ServiceCategory;
  /** Optional per the specification ("where appropriate"). Services created
   *  before subcategories existed simply have none. */
  subcategory?: string;
  tags: string[];
  pricingModel: PricingModel;
  basePrice: number;
  currency: string;
  packages?: ServicePackage[];
  deliveryTime?: number;
  deliveryUnit?: DeliveryUnit;
  imageUrl?: string;
  /** Service-specific cover, independent of the user's main profile cover. */
  coverImageUrl?: string;
  /** Service-specific profile image, independent of the main profile photo.
   *  When `useMainProfileImage` is true this is ignored and the provider's
   *  own avatar is shown instead — the explicit opt-in the spec describes. */
  serviceImageUrl?: string;
  useMainProfileImage?: boolean;
  /** Where the service is offered. */
  location?: string;
  workMode?: ServiceWorkMode;
  availability?: ServiceAvailability;
  gallery?: string[];
  /* Content sections the specification names for the detail page. Every one
     is optional: unset means the section is absent, never empty or invented. */
  /** Skills — the specification lists these separately from tags. */
  skills?: string[];
  /** What the customer receives. */
  deliverables?: string[];
  /** What the provider needs from the customer before starting. */
  requirements?: string;
  /** How the engagement runs, step by step. */
  process?: string;
  /** Languages the service is delivered in. */
  languages?: string[];
  /** Geographic area served, distinct from the provider's own location. */
  serviceArea?: string;
  /** A single reference video (link only — no upload system is introduced). */
  videoUrl?: string;
  faqs?: Array<{ question: string; answer: string }>;
  isActive: boolean;
  featured: boolean;
  bookingCount: number;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceBooking {
  id: string;
  serviceId: string;
  serviceTitle: string;
  serviceUserId: string;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientMessage: string;
  packageName?: string;
  price?: number;
  currency: string;
  status: BookingStatus;
  scheduledDate?: string;
  createdAt: string;
  updatedAt: string;
  /* ── §20 Booking Form additions. All optional, so bookings written before
     these existed stay valid and every existing reader is unaffected. ── */
  /** What the customer needs. Mirrors clientMessage for legacy readers. */
  requirement?: string;
  /** Expected delivery / completion date (YYYY-MM-DD). `scheduledDate` stays the start date. */
  expectedDeliveryDate?: string;
  budgetMin?: number;
  budgetMax?: number;
  attachments?: Array<{ url: string; name: string; size?: number; mimeType?: string }>;
  additionalNotes?: string;
  /** Lead + conversation created alongside the request (§22). */
  leadId?: string;
  conversationId?: string;
  /** Dedupe key: customer + service + package + normalized requirement. */
  fingerprint?: string;
}

type ServicesStore = Record<string, Service[]>;
type BookingsStore = ServiceBooking[];

export async function getAllServices(): Promise<ServicesStore> {
  return readJsonFile<ServicesStore>(servicesPath, {});
}

export async function getUserServices(userId: string): Promise<Service[]> {
  const store = await getAllServices();
  return (store[userId] ?? []).sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function getPublicUserServices(userId: string): Promise<Service[]> {
  const services = await getUserServices(userId);
  return services.filter((s) => s.isActive);
}

export async function createService(userId: string, data: Omit<Service, 'id' | 'userId' | 'bookingCount' | 'rating' | 'reviewCount' | 'createdAt' | 'updatedAt'>): Promise<Service> {
  const store = await getAllServices();
  const service: Service = {
    ...data,
    id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    bookingCount: 0,
    rating: 0,
    reviewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store[userId] = [...(store[userId] ?? []), service];
  await writeJsonFile(servicesPath, store);
  return service;
}

export async function updateService(userId: string, serviceId: string, data: Partial<Service>): Promise<Service | null> {
  const store = await getAllServices();
  const list = store[userId] ?? [];
  const idx = list.findIndex((s) => s.id === serviceId);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...data, userId, id: serviceId, updatedAt: new Date().toISOString() };
  store[userId] = list;
  await writeJsonFile(servicesPath, store);
  return list[idx];
}

export async function deleteService(userId: string, serviceId: string): Promise<boolean> {
  const store = await getAllServices();
  const list = store[userId] ?? [];
  const filtered = list.filter((s) => s.id !== serviceId);
  if (filtered.length === list.length) return false;
  store[userId] = filtered;
  await writeJsonFile(servicesPath, store);
  return true;
}

export async function getServiceById(serviceId: string): Promise<Service | null> {
  const store = await getAllServices();
  for (const list of Object.values(store)) {
    const found = list.find((s) => s.id === serviceId);
    if (found) return found;
  }
  return null;
}

export async function getAllBookings(): Promise<BookingsStore> {
  return readJsonFile<BookingsStore>(serviceBookingsPath, []);
}

export async function createBooking(data: Omit<ServiceBooking, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceBooking> {
  const bookings = await getAllBookings();
  const booking: ServiceBooking = {
    ...data,
    id: `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  bookings.push(booking);
  await writeJsonFile(serviceBookingsPath, bookings);

  // increment booking count on the service
  const store = await getAllServices();
  const list = store[data.serviceUserId] ?? [];
  const idx = list.findIndex((s) => s.id === data.serviceId);
  if (idx !== -1) {
    list[idx].bookingCount = (list[idx].bookingCount ?? 0) + 1;
    store[data.serviceUserId] = list;
    await writeJsonFile(servicesPath, store);
  }

  return booking;
}

export async function getBookingById(bookingId: string): Promise<ServiceBooking | null> {
  const bookings = await getAllBookings();
  return bookings.find((b) => b.id === bookingId) ?? null;
}

/**
 * Most recent identical request from the same customer inside `windowMs`.
 * Mirrors the enquiry duplicate guard so a double-tapped "Send Booking Request"
 * cannot produce two bookings.
 */
export async function findRecentDuplicateBooking(
  clientId: string,
  fingerprint: string,
  windowMs: number,
): Promise<ServiceBooking | null> {
  if (!clientId || !fingerprint) return null;
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const bookings = await getAllBookings();
  return (
    bookings.find((b) => b.clientId === clientId && b.fingerprint === fingerprint && b.createdAt >= cutoff)
    ?? null
  );
}

/** Attach the lead / conversation ids once those exist. */
export async function linkBooking(
  bookingId: string,
  links: { leadId?: string; conversationId?: string },
): Promise<ServiceBooking | null> {
  const bookings = await getAllBookings();
  const idx = bookings.findIndex((b) => b.id === bookingId);
  if (idx === -1) return null;
  bookings[idx] = {
    ...bookings[idx],
    ...(links.leadId ? { leadId: links.leadId } : {}),
    ...(links.conversationId ? { conversationId: links.conversationId } : {}),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(serviceBookingsPath, bookings);
  return bookings[idx];
}

export async function getBookingsForProvider(userId: string): Promise<ServiceBooking[]> {
  const bookings = await getAllBookings();
  return bookings
    .filter((b) => b.serviceUserId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getBookingsForClient(clientId: string): Promise<ServiceBooking[]> {
  const bookings = await getAllBookings();
  return bookings
    .filter((b) => b.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus): Promise<ServiceBooking | null> {
  const bookings = await getAllBookings();
  const idx = bookings.findIndex((b) => b.id === bookingId);
  if (idx === -1) return null;
  bookings[idx] = { ...bookings[idx], status, updatedAt: new Date().toISOString() };
  await writeJsonFile(serviceBookingsPath, bookings);
  return bookings[idx];
}

/* ─── Reviews ─────────────────────────────────────────────────────── */
export interface ServiceReview {
  id: string;
  serviceId: string;
  serviceUserId: string;
  bookingId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;           // 1–5
  headline: string;
  body: string;
  testimonial?: string;     // optional public quote
  createdAt: string;
  updatedAt: string;
}

type ReviewsStore = ServiceReview[];

export async function getAllReviews(): Promise<ReviewsStore> {
  if (getDbPool()) {
    return selectAllServiceReviewRows();
  }
  return readJsonFile<ReviewsStore>(serviceReviewsPath, []);
}

export async function getReviewsForService(serviceId: string): Promise<ServiceReview[]> {
  if (getDbPool()) {
    return selectServiceReviewsForService(serviceId);
  }
  const all = await getAllReviews();
  return all
    .filter((r) => r.serviceId === serviceId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function hasReviewedBooking(bookingId: string): Promise<boolean> {
  if (getDbPool()) {
    return existsServiceReviewForBooking(bookingId);
  }
  const all = await getAllReviews();
  return all.some((r) => r.bookingId === bookingId);
}

export async function getCompletedBookingForReviewer(
  reviewerId: string,
  serviceId: string,
): Promise<ServiceBooking | null> {
  const bookings = await getAllBookings();
  return (
    bookings.find(
      (b) =>
        b.clientId === reviewerId &&
        b.serviceId === serviceId &&
        b.status === 'completed',
    ) ?? null
  );
}

export async function createReview(data: Omit<ServiceReview, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceReview> {
  const review: ServiceReview = {
    ...data,
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (getDbPool()) {
    await upsertServiceReviewRow(review);
    // Aggregate stays in the DB — query it instead of re-scanning every review.
    const aggregate = await selectServiceReviewAggregateForService(data.serviceId);
    const store = await getAllServices();
    const list = store[data.serviceUserId] ?? [];
    const idx = list.findIndex((s) => s.id === data.serviceId);
    if (idx !== -1) {
      list[idx].rating = aggregate.average;
      list[idx].reviewCount = aggregate.count;
      store[data.serviceUserId] = list;
      await writeJsonFile(servicesPath, store);
    }
    return review;
  }

  const all = await getAllReviews();
  all.push(review);
  await writeJsonFile(serviceReviewsPath, all);

  // Recalculate average rating on the service
  const serviceReviews = all.filter((r) => r.serviceId === data.serviceId);
  const avg = serviceReviews.reduce((s, r) => s + r.rating, 0) / serviceReviews.length;
  const store = await getAllServices();
  const list = store[data.serviceUserId] ?? [];
  const idx = list.findIndex((s) => s.id === data.serviceId);
  if (idx !== -1) {
    list[idx].rating = Math.round(avg * 10) / 10;
    list[idx].reviewCount = serviceReviews.length;
    store[data.serviceUserId] = list;
    await writeJsonFile(servicesPath, store);
  }

  return review;
}

/* ─── Analytics ────────────────────────────────────────────────────── */
export type AnalyticsEventType = 'view' | 'detail_open' | 'book_click' | 'booking_submitted';

export interface ServiceAnalyticsEvent {
  id: string;
  serviceId: string;
  serviceUserId: string;
  type: AnalyticsEventType;
  visitorId?: string;
  source?: 'profile' | 'catalogue' | 'direct';
  createdAt: string;
}

export interface ServiceAnalyticsSummary {
  serviceId: string;
  serviceTitle: string;
  views: number;
  uniqueViews: number;
  detailOpens: number;
  bookClicks: number;
  bookingsSubmitted: number;
  bookingsConfirmed: number;
  bookingsCompleted: number;
  reviews: number;
  avgRating: number;
  estimatedRevenue: number;
  currency: string;
  clickThroughRate: number;   // detailOpens / views
  bookClickRate: number;      // bookClicks / views
  conversionRate: number;     // bookingsSubmitted / views
  completionRate: number;     // bookingsCompleted / bookingsSubmitted
  trend7d: number[];          // views per day for last 7 days
}

export interface ProviderAnalytics {
  totalViews: number;
  totalUniqueViews: number;
  totalBookClicks: number;
  totalBookings: number;
  totalCompleted: number;
  totalRevenue: number;
  avgRating: number;
  totalReviews: number;
  overallConversionRate: number;
  trend30d: number[];         // views per day for last 30 days
  services: ServiceAnalyticsSummary[];
  topService: ServiceAnalyticsSummary | null;
  peakHour: number;           // 0-23
  sourceBreakdown: { profile: number; catalogue: number; direct: number };
}

type AnalyticsStore = ServiceAnalyticsEvent[];

export async function getAllAnalyticsEvents(): Promise<AnalyticsStore> {
  return readJsonFile<AnalyticsStore>(serviceAnalyticsPath, []);
}

export async function trackAnalyticsEvent(
  data: Omit<ServiceAnalyticsEvent, 'id' | 'createdAt'>,
): Promise<void> {
  const events = await getAllAnalyticsEvents();
  events.push({
    ...data,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  });
  // Keep only last 10 000 events to prevent unbounded growth
  const trimmed = events.slice(-10000);
  await writeJsonFile(serviceAnalyticsPath, trimmed);
}

function dayKey(iso: string) {
  return iso.slice(0, 10); // YYYY-MM-DD
}

export async function getProviderAnalytics(userId: string): Promise<ProviderAnalytics> {
  const [events, allServices, allBookings, allReviews] = await Promise.all([
    getAllAnalyticsEvents(),
    getUserServices(userId),
    getAllBookings(),
    getAllReviews(),
  ]);

  const myServiceIds = new Set(allServices.map((s) => s.id));
  const myEvents = events.filter((e) => myServiceIds.has(e.serviceId));
  const myBookings = allBookings.filter((b) => b.serviceUserId === userId);
  const myReviews = allReviews.filter((r) => r.serviceUserId === userId);

  // 30-day trend
  const now = new Date();
  const trend30d = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    const dk = d.toISOString().slice(0, 10);
    return myEvents.filter((e) => e.type === 'view' && dayKey(e.createdAt) === dk).length;
  });

  // Source breakdown
  const sourceBreakdown = { profile: 0, catalogue: 0, direct: 0 };
  myEvents.filter((e) => e.type === 'view').forEach((e) => {
    sourceBreakdown[e.source ?? 'direct']++;
  });

  // Peak hour
  const hourCounts = Array(24).fill(0) as number[];
  myEvents.filter((e) => e.type === 'view').forEach((e) => {
    hourCounts[new Date(e.createdAt).getHours()]++;
  });
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Per-service summaries
  const serviceSummaries: ServiceAnalyticsSummary[] = allServices.map((svc) => {
    const sevents = myEvents.filter((e) => e.serviceId === svc.id);
    const views = sevents.filter((e) => e.type === 'view');
    const uniqueVisitors = new Set(views.map((e) => e.visitorId ?? e.id)).size;
    const detailOpens = sevents.filter((e) => e.type === 'detail_open').length;
    const bookClicks = sevents.filter((e) => e.type === 'book_click').length;
    const submitted = sevents.filter((e) => e.type === 'booking_submitted').length;
    const svcBookings = myBookings.filter((b) => b.serviceId === svc.id);
    const confirmed = svcBookings.filter((b) => b.status === 'confirmed' || b.status === 'completed').length;
    const completed = svcBookings.filter((b) => b.status === 'completed').length;
    const svcReviews = myReviews.filter((r) => r.serviceId === svc.id);
    const revenue = svcBookings.filter((b) => b.status === 'completed').reduce((s, b) => s + (b.price ?? 0), 0);

    const trend7d = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const dk = d.toISOString().slice(0, 10);
      return views.filter((e) => dayKey(e.createdAt) === dk).length;
    });

    const vCount = views.length || 1;
    return {
      serviceId: svc.id,
      serviceTitle: svc.title,
      views: views.length,
      uniqueViews: uniqueVisitors,
      detailOpens,
      bookClicks,
      bookingsSubmitted: submitted,
      bookingsConfirmed: confirmed,
      bookingsCompleted: completed,
      reviews: svcReviews.length,
      avgRating: svc.rating,
      estimatedRevenue: revenue,
      currency: svc.currency,
      clickThroughRate: Math.round((detailOpens / vCount) * 1000) / 10,
      bookClickRate: Math.round((bookClicks / vCount) * 1000) / 10,
      conversionRate: Math.round((submitted / vCount) * 1000) / 10,
      completionRate: submitted > 0 ? Math.round((completed / submitted) * 1000) / 10 : 0,
      trend7d,
    };
  });

  const totViews = myEvents.filter((e) => e.type === 'view').length;
  const totBookings = myBookings.length;
  const totRevenue = myBookings.filter((b) => b.status === 'completed').reduce((s, b) => s + (b.price ?? 0), 0);
  const avgRating = myReviews.length > 0
    ? Math.round((myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length) * 10) / 10
    : 0;

  const topService = serviceSummaries.reduce<ServiceAnalyticsSummary | null>(
    (best, s) => (!best || s.views > best.views ? s : best),
    null,
  );

  return {
    totalViews: totViews,
    totalUniqueViews: new Set(myEvents.filter((e) => e.type === 'view').map((e) => e.visitorId ?? e.id)).size,
    totalBookClicks: myEvents.filter((e) => e.type === 'book_click').length,
    totalBookings: totBookings,
    totalCompleted: myBookings.filter((b) => b.status === 'completed').length,
    totalRevenue: totRevenue,
    avgRating,
    totalReviews: myReviews.length,
    overallConversionRate: totViews > 0 ? Math.round((totBookings / totViews) * 1000) / 10 : 0,
    trend30d,
    services: serviceSummaries,
    topService,
    peakHour,
    sourceBreakdown,
  };
}

/* ─── Catalogue Settings ─────────────────────────────────────────────── */

export interface CatalogueSettings {
  userId: string;
  headline?: string;
  subheadline?: string;
  accentColor?: string;
  accentColorSecondary?: string;
  gridColumns?: 2 | 3 | 4;
  cardStyle?: 'default' | 'minimal' | 'detailed';
  showBio?: boolean;
  showWhyBook?: boolean;
  showStats?: boolean;
  ctaText?: string;
  heroLayout?: 'default' | 'centered' | 'minimal';
  bannerOverlayOpacity?: number;
  catalogueBannerUrl?: string;
  catalogueAvatarUrl?: string;
  chatEnabled?: boolean;
  updatedAt?: string;
}

export async function getCatalogueSettings(userId: string): Promise<CatalogueSettings | null> {
  const all = await readJsonFile<Record<string, CatalogueSettings>>(catalogueSettingsPath, {});
  return all[userId] ?? null;
}

export async function saveCatalogueSettings(userId: string, settings: Partial<CatalogueSettings>): Promise<CatalogueSettings> {
  const all = await readJsonFile<Record<string, CatalogueSettings>>(catalogueSettingsPath, {});
  const existing = all[userId] ?? { userId };
  const updated: CatalogueSettings = { ...existing, ...settings, userId, updatedAt: new Date().toISOString() };
  all[userId] = updated;
  await writeJsonFile(catalogueSettingsPath, all);
  return updated;
}
