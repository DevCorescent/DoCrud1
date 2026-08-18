/**
 * Booking requests — the specification's Book Service flow.
 *
 * Kept separate from `serviceBookings` on purpose. That older store is written
 * by the catalogue's legacy modal, which also posts *enquiries* into it behind
 * an "[ENQUIRY]" message prefix, and it carries a booking vocabulary
 * (pending/confirmed/cancelled) that does not match the lifecycle the
 * specification defines. Extending it would have meant either breaking the
 * catalogue's working form or perpetuating the conflation.
 *
 * A booking request is a distinct thing from an enquiry: an enquiry asks a
 * question, a booking request proposes work. Each has its own record, and
 * neither borrows the other's status vocabulary.
 *
 * Storage follows the same JSON-file convention as the rest of the service
 * layer; the path lives here so the feature stays self-contained.
 */
import path from 'path';
import { randomUUID } from 'crypto';
import { readJsonFile, writeJsonFile, dataDir } from '@/lib/server/storage';

export const serviceBookingRequestsPath = path.join(dataDir, 'service-booking-requests.json');

/**
 * The specification's lifecycle. A request always begins at `requested`;
 * every later transition is the provider's decision and belongs to the
 * provider lead-management task, not to this flow.
 */
export type BookingRequestStatus =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'in_progress'
  | 'completed';

export interface ServiceBookingRequest {
  id: string;
  /** Short human-quotable reference shown on the confirmation screen. */
  reference: string;

  /* relationship — every field resolved server-side */
  serviceId: string;
  serviceTitle: string;
  providerId: string;
  requesterId: string;

  /* what is being booked. `packageName` is null when the service has no
     packages and the base pricing model applies instead. */
  packageName: string | null;
  /** Price as the SERVER resolved it from the service record, never as sent. */
  price: number | null;
  currency: string;
  pricingModel: string;

  /* the request */
  requirements: string;
  preferredStartDate?: string;
  expectedCompletionDate?: string;
  phone?: string;
  notes?: string;

  status: BookingRequestStatus;
  createdAt: string;
}

type Store = ServiceBookingRequest[];

async function readStore(): Promise<Store> {
  return readJsonFile<Store>(serviceBookingRequestsPath, []);
}

function makeReference(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `BKG-${out}`;
}

/** Window in which an identical repeat is treated as a double-submit. */
const DUPLICATE_WINDOW_MS = 60_000;

/**
 * A recent identical request from the same person for the same service and
 * package. Used to collapse rapid double-clicks into one booking.
 */
export async function findRecentDuplicate(
  requesterId: string,
  serviceId: string,
  packageName: string | null,
  requirements: string,
): Promise<ServiceBookingRequest | null> {
  const store = await readStore();
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
  const normalised = requirements.trim();
  for (let i = store.length - 1; i >= 0; i -= 1) {
    const b = store[i];
    if (b.requesterId !== requesterId || b.serviceId !== serviceId) continue;
    if ((b.packageName ?? null) !== (packageName ?? null)) continue;
    if (b.requirements.trim() !== normalised) continue;
    if (Date.parse(b.createdAt) < cutoff) break;
    return b;
  }
  return null;
}

export async function createBookingRequest(
  input: Omit<ServiceBookingRequest, 'id' | 'reference' | 'status' | 'createdAt'>,
): Promise<ServiceBookingRequest> {
  const store = await readStore();
  const booking: ServiceBookingRequest = {
    ...input,
    id: randomUUID(),
    reference: makeReference(),
    // Never anything else on creation — a provider has not seen it yet.
    status: 'requested',
    createdAt: new Date().toISOString(),
  };
  store.push(booking);
  await writeJsonFile(serviceBookingRequestsPath, store);
  return booking;
}

/** Requests addressed to a provider's own services. */
export async function getBookingRequestsForProvider(providerId: string): Promise<ServiceBookingRequest[]> {
  const store = await readStore();
  return store.filter((b) => b.providerId === providerId).reverse();
}

/** Requests a person has sent. */
export async function getBookingRequestsForRequester(requesterId: string): Promise<ServiceBookingRequest[]> {
  const store = await readStore();
  return store.filter((b) => b.requesterId === requesterId).reverse();
}

/**
 * A single request, readable only by the two parties. Anyone else gets null,
 * so an unauthorised id guess is indistinguishable from a miss.
 */
export async function getBookingRequestForViewer(
  id: string,
  viewerId: string,
): Promise<ServiceBookingRequest | null> {
  const store = await readStore();
  const found = store.find((b) => b.id === id || b.reference === id);
  if (!found) return null;
  if (found.requesterId !== viewerId && found.providerId !== viewerId) return null;
  return found;
}
