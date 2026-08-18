/**
 * The provider lead pipeline.
 *
 * The specification says every enquiry *and* every booking request becomes a
 * lead, so this module presents both as one list without merging the two
 * stores. Each keeps its own record and its own semantics; a lead is a *view*
 * over them plus a pipeline status.
 *
 * The enquiry and booking modules are deliberately not edited — this reads
 * their exported paths and types and adds the pipeline status as an
 * additive field, so the two features stay independently owned and the change
 * carries no merge risk for whoever is working in them.
 *
 * A lead's status starts where its origin implies: an enquiry enters at "New",
 * a booking request enters at "Booking Requested" — a status the
 * specification lists precisely because a booking arrives further along the
 * pipeline than a cold enquiry does.
 */
import { readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { serviceEnquiriesPath, type ServiceEnquiry } from '@/lib/server/service-enquiries';
import {
  serviceBookingRequestsPath,
  type ServiceBookingRequest,
} from '@/lib/server/service-booking-requests';
import { type LeadStatus } from '@/lib/service-lead-status';

/** Pipeline status is stored alongside the source record, added on demand. */
type WithLeadStatus<T> = T & { leadStatus?: LeadStatus };

type StoredEnquiry = WithLeadStatus<ServiceEnquiry>;
type StoredBooking = WithLeadStatus<ServiceBookingRequest>;

export type LeadSource = 'enquiry' | 'booking';

/** One row of the provider's pipeline, from either origin. */
export interface Lead {
  id: string;
  reference: string;
  source: LeadSource;

  serviceId: string;
  serviceTitle: string;
  providerId: string;
  requesterId: string;

  requirement: string;
  budget: string | null;
  /** Human-readable timeline built from whichever dates the record carries. */
  timeline: string | null;
  contactMethod: string | null;
  phone: string | null;
  company: string | null;

  /** Booking-only: the package and the server-resolved price. */
  packageName: string | null;
  price: number | null;
  currency: string | null;

  status: LeadStatus;
  createdAt: string;
}

function readEnquiries() {
  return readJsonFile<StoredEnquiry[]>(serviceEnquiriesPath, []);
}
function readBookings() {
  return readJsonFile<StoredBooking[]>(serviceBookingRequestsPath, []);
}

function timelineOf(start?: string, end?: string): string | null {
  if (start && end) return `${start} → ${end}`;
  if (start) return `From ${start}`;
  if (end) return `By ${end}`;
  return null;
}

function enquiryToLead(e: StoredEnquiry): Lead {
  return {
    id: e.id,
    reference: e.reference,
    source: 'enquiry',
    serviceId: e.serviceId,
    serviceTitle: e.serviceTitle,
    providerId: e.providerId,
    requesterId: e.requesterId,
    requirement: e.message,
    budget: e.budget ?? null,
    timeline: timelineOf(e.preferredStartDate, e.expectedCompletionDate),
    contactMethod: e.contactMethod ?? null,
    phone: e.phone ?? null,
    company: e.company ?? null,
    packageName: null,
    price: null,
    currency: null,
    // An enquiry begins at the start of the pipeline.
    status: e.leadStatus ?? 'new',
    createdAt: e.createdAt,
  };
}

function bookingToLead(b: StoredBooking): Lead {
  return {
    id: b.id,
    reference: b.reference,
    source: 'booking',
    serviceId: b.serviceId,
    serviceTitle: b.serviceTitle,
    providerId: b.providerId,
    requesterId: b.requesterId,
    requirement: b.requirements,
    budget: b.price !== null && b.price !== undefined ? String(b.price) : null,
    timeline: timelineOf(b.preferredStartDate, b.expectedCompletionDate),
    contactMethod: null,
    phone: b.phone ?? null,
    company: null,
    packageName: b.packageName ?? null,
    price: b.price ?? null,
    currency: b.currency ?? null,
    /* A booking request arrives already at "Booking Requested" — the
       specification lists that status for exactly this case. */
    status: b.leadStatus ?? 'booking_requested',
    createdAt: b.createdAt,
  };
}

const newestFirst = (a: Lead, b: Lead) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/** Every lead addressed to this provider's own services. */
export async function getLeadsForProvider(providerId: string): Promise<Lead[]> {
  const [enquiries, bookings] = await Promise.all([readEnquiries(), readBookings()]);
  return [
    ...enquiries.filter((e) => e.providerId === providerId).map(enquiryToLead),
    ...bookings.filter((b) => b.providerId === providerId).map(bookingToLead),
  ].sort(newestFirst);
}

/** Everything this person has sent, so they can track their own requests. */
export async function getLeadsForRequester(requesterId: string): Promise<Lead[]> {
  const [enquiries, bookings] = await Promise.all([readEnquiries(), readBookings()]);
  return [
    ...enquiries.filter((e) => e.requesterId === requesterId).map(enquiryToLead),
    ...bookings.filter((b) => b.requesterId === requesterId).map(bookingToLead),
  ].sort(newestFirst);
}

export type UpdateResult =
  | { ok: true; lead: Lead }
  | { ok: false; reason: 'not_found' | 'forbidden' };

/**
 * Set a lead's pipeline status.
 *
 * Authorisation is decided here rather than by the caller: the write only
 * happens when the stored record's own `providerId` matches the acting
 * provider, so a client cannot reach another provider's lead whatever it
 * sends. A lead that exists but belongs to somebody else is reported as
 * `forbidden` and surfaced as a 404, so ids cannot be probed.
 */
export async function updateLeadStatus(
  leadId: string,
  actingProviderId: string,
  status: LeadStatus,
): Promise<UpdateResult> {
  const enquiries = await readEnquiries();
  const eIndex = enquiries.findIndex((e) => e.id === leadId || e.reference === leadId);
  if (eIndex !== -1) {
    const row = enquiries[eIndex];
    if (row.providerId !== actingProviderId) return { ok: false, reason: 'forbidden' };
    enquiries[eIndex] = { ...row, leadStatus: status };
    await writeJsonFile(serviceEnquiriesPath, enquiries);
    return { ok: true, lead: enquiryToLead(enquiries[eIndex]) };
  }

  const bookings = await readBookings();
  const bIndex = bookings.findIndex((b) => b.id === leadId || b.reference === leadId);
  if (bIndex !== -1) {
    const row = bookings[bIndex];
    if (row.providerId !== actingProviderId) return { ok: false, reason: 'forbidden' };
    bookings[bIndex] = { ...row, leadStatus: status };
    await writeJsonFile(serviceBookingRequestsPath, bookings);
    return { ok: true, lead: bookingToLead(bookings[bIndex]) };
  }

  return { ok: false, reason: 'not_found' };
}
