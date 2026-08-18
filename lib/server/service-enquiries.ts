/**
 * Service enquiries and the provider leads they create.
 *
 * Deliberately separate from `serviceBookings`. The existing catalogue enquiry
 * form writes a *booking* row with an "[ENQUIRY]" prefix on the message, which
 * conflates two things the specification keeps apart: an enquiry is a question,
 * a booking is a commitment. This store keeps enquiries as their own record so
 * a lead can carry its own status without polluting booking status.
 *
 * One record serves as both the enquiry and its lead — the relationship
 * (requester → service → provider) is intrinsic to the row, so there is no
 * second table to keep in sync and no way for the two to disagree.
 *
 * Storage follows the same JSON-file convention as the rest of the service
 * layer, and the path is declared here rather than in the shared storage
 * module to keep this feature self-contained.
 */
import path from 'path';
import { randomUUID } from 'crypto';
import { readJsonFile, writeJsonFile, dataDir } from '@/lib/server/storage';

export const serviceEnquiriesPath = path.join(dataDir, 'service-enquiries.json');

/** The specification's initial lead state. Later states belong to the
 *  provider lead-management task and are intentionally not modelled here. */
export type LeadStatus = 'new';

export type ContactMethod = 'platform' | 'email' | 'phone';

export interface ServiceEnquiry {
  id: string;
  /** Short human-quotable reference shown on the success screen. */
  reference: string;

  /* relationship — all resolved server-side, never from the client */
  serviceId: string;
  serviceTitle: string;
  providerId: string;
  requesterId: string;

  /* enquiry content */
  message: string;
  budget?: string;
  preferredStartDate?: string;
  expectedCompletionDate?: string;
  contactMethod: ContactMethod;
  phone?: string;
  company?: string;

  /* lead */
  status: LeadStatus;
  createdAt: string;
}

type EnquiryStore = ServiceEnquiry[];

async function readStore(): Promise<EnquiryStore> {
  return readJsonFile<EnquiryStore>(serviceEnquiriesPath, []);
}

/** Reference is short and unambiguous — no ambiguous 0/O or 1/I. */
function makeReference(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ENQ-${out}`;
}

/** How long an identical repeat from the same person is treated as a double-submit. */
const DUPLICATE_WINDOW_MS = 60_000;

/**
 * The most recent enquiry this requester made about this service, if it is
 * recent enough to be a double-submit rather than a genuine second question.
 */
export async function findRecentDuplicate(
  requesterId: string,
  serviceId: string,
  message: string,
): Promise<ServiceEnquiry | null> {
  const store = await readStore();
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
  const normalised = message.trim();
  for (let i = store.length - 1; i >= 0; i -= 1) {
    const e = store[i];
    if (e.requesterId !== requesterId || e.serviceId !== serviceId) continue;
    if (e.message.trim() !== normalised) continue;
    if (Date.parse(e.createdAt) < cutoff) break;
    return e;
  }
  return null;
}

export async function createEnquiry(
  input: Omit<ServiceEnquiry, 'id' | 'reference' | 'status' | 'createdAt'>,
): Promise<ServiceEnquiry> {
  const store = await readStore();
  const enquiry: ServiceEnquiry = {
    ...input,
    id: randomUUID(),
    reference: makeReference(),
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  store.push(enquiry);
  await writeJsonFile(serviceEnquiriesPath, store);
  return enquiry;
}

/** Leads for a provider — their own services only. */
export async function getEnquiriesForProvider(providerId: string): Promise<ServiceEnquiry[]> {
  const store = await readStore();
  return store.filter((e) => e.providerId === providerId).reverse();
}

/** Enquiries a person has sent. */
export async function getEnquiriesForRequester(requesterId: string): Promise<ServiceEnquiry[]> {
  const store = await readStore();
  return store.filter((e) => e.requesterId === requesterId).reverse();
}

/**
 * A single enquiry, readable only by the two parties to it. Returns null for
 * anybody else, so an unauthorised id guess is indistinguishable from a miss.
 */
export async function getEnquiryForViewer(
  enquiryId: string,
  viewerId: string,
): Promise<ServiceEnquiry | null> {
  const store = await readStore();
  const found = store.find((e) => e.id === enquiryId || e.reference === enquiryId);
  if (!found) return null;
  if (found.requesterId !== viewerId && found.providerId !== viewerId) return null;
  return found;
}
