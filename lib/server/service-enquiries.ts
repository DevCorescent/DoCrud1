/**
 * Service Enquiries — §17/§18.
 *
 * An enquiry is a lightweight "I have a question / I need a quote" message.
 * It is deliberately NOT a booking: it creates no `ServiceBooking`, and it never
 * touches `service.bookingCount`. The two flows stay separate all the way down
 * so §24's distinction holds at the data layer, not just in the UI.
 *
 * Persistence mirrors `lib/server/service-leads.ts` — a dedicated Mongo
 * collection when configured, JSON file otherwise. Never the whole-array
 * app_state blob used by bookings.
 */
import crypto from 'node:crypto';
import path from 'path';
import { getMongoDb } from '@/lib/server/database';
import { dataDir, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import type {
  ServiceContactMethod,
  ServiceLeadAttachment,
  ServiceLeadBudget,
  ServiceLeadTimeline,
} from '@/lib/server/service-leads';

const COL = 'service_enquiries';
const serviceEnquiriesPath = path.join(dataDir, 'service-enquiries.json');

/**
 * Window in which an identical enquiry from the same customer for the same
 * service is treated as a double-submit rather than a new enquiry.
 */
export const DUPLICATE_ENQUIRY_WINDOW_MS = 10 * 60 * 1000;

export const CONTACT_METHODS: ServiceContactMethod[] = ['docrud_chat', 'email', 'phone'];

export const REQUIREMENT_MIN_LENGTH = 10;
export const REQUIREMENT_MAX_LENGTH = 4000;
export const COMPANY_INFO_MAX_LENGTH = 600;
export const MAX_ATTACHMENTS = 5;

export interface ServiceEnquiry {
  id: string;

  serviceId: string;
  serviceTitle: string;
  providerId: string;

  /* Always derived from the authenticated session — never from the request body. */
  customerId: string;
  customerName: string;

  requirement: string;

  /* Only the channel the customer picked is stored (§25: no needless contact data). */
  contactMethod: ServiceContactMethod;
  contactEmail?: string;
  contactPhone?: string;

  budget?: ServiceLeadBudget;
  timeline?: ServiceLeadTimeline;
  attachments: ServiceLeadAttachment[];
  companyInfo?: string;

  conversationId?: string;
  leadId?: string;

  /** Dedupe key: customer + service + normalized requirement. */
  fingerprint: string;

  createdAt: string;
  updatedAt: string;
}

type EnquiryDoc = ServiceEnquiry & { _id: string };

function strip({ _id: _unused, ...rest }: EnquiryDoc): ServiceEnquiry {
  return rest;
}

function nowIso() {
  return new Date().toISOString();
}

export function buildEnquiryFingerprint(customerId: string, serviceId: string, requirement: string) {
  const normalized = requirement.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(`${customerId}|${serviceId}|${normalized}`).digest('hex').slice(0, 32);
}

export interface CreateServiceEnquiryInput {
  serviceId: string;
  serviceTitle: string;
  providerId: string;
  customerId: string;
  customerName: string;
  requirement: string;
  contactMethod: ServiceContactMethod;
  contactEmail?: string;
  contactPhone?: string;
  budget?: ServiceLeadBudget;
  timeline?: ServiceLeadTimeline;
  attachments?: ServiceLeadAttachment[];
  companyInfo?: string;
}

/**
 * Most recent identical enquiry inside the duplicate window, if any.
 * Used to short-circuit double-submits before any lead/conversation work.
 */
export async function findRecentDuplicateEnquiry(
  customerId: string,
  serviceId: string,
  requirement: string,
): Promise<ServiceEnquiry | null> {
  const fingerprint = buildEnquiryFingerprint(customerId, serviceId, requirement);
  const cutoff = new Date(Date.now() - DUPLICATE_ENQUIRY_WINDOW_MS).toISOString();

  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<EnquiryDoc>(COL)
      .find({ fingerprint, customerId, createdAt: { $gte: cutoff } })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    return doc[0] ? strip(doc[0]) : null;
  }

  const all = await readJsonFile<ServiceEnquiry[]>(serviceEnquiriesPath, []);
  return (
    all.find((e) => e.fingerprint === fingerprint && e.customerId === customerId && e.createdAt >= cutoff)
    ?? null
  );
}

export async function createServiceEnquiry(input: CreateServiceEnquiryInput): Promise<ServiceEnquiry> {
  const now = nowIso();
  const enquiry: ServiceEnquiry = {
    id: `enq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    serviceId: input.serviceId,
    serviceTitle: input.serviceTitle,
    providerId: input.providerId,
    customerId: input.customerId,
    customerName: input.customerName,
    requirement: input.requirement,
    contactMethod: input.contactMethod,
    ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
    ...(input.budget ? { budget: input.budget } : {}),
    ...(input.timeline ? { timeline: input.timeline } : {}),
    attachments: input.attachments ?? [],
    ...(input.companyInfo ? { companyInfo: input.companyInfo } : {}),
    fingerprint: buildEnquiryFingerprint(input.customerId, input.serviceId, input.requirement),
    createdAt: now,
    updatedAt: now,
  };

  const db = await getMongoDb();
  if (db) {
    await db.collection<EnquiryDoc>(COL).insertOne({ ...enquiry, _id: enquiry.id });
    return enquiry;
  }

  const all = await readJsonFile<ServiceEnquiry[]>(serviceEnquiriesPath, []);
  await writeJsonFile(serviceEnquiriesPath, [enquiry, ...all].slice(0, 6000));
  return enquiry;
}

/** Attach the lead / conversation ids once those exist. Best-effort by design. */
export async function linkServiceEnquiry(
  enquiryId: string,
  links: { leadId?: string; conversationId?: string },
): Promise<ServiceEnquiry | null> {
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  if (links.leadId) patch.leadId = links.leadId;
  if (links.conversationId) patch.conversationId = links.conversationId;

  const db = await getMongoDb();
  if (db) {
    await db.collection<EnquiryDoc>(COL).updateOne({ _id: enquiryId }, { $set: patch });
    const doc = await db.collection<EnquiryDoc>(COL).findOne({ _id: enquiryId });
    return doc ? strip(doc) : null;
  }

  const all = await readJsonFile<ServiceEnquiry[]>(serviceEnquiriesPath, []);
  const idx = all.findIndex((e) => e.id === enquiryId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch } as ServiceEnquiry;
  await writeJsonFile(serviceEnquiriesPath, all);
  return all[idx];
}

export async function getServiceEnquiryById(enquiryId: string): Promise<ServiceEnquiry | null> {
  const id = (enquiryId || '').trim();
  if (!id) return null;

  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<EnquiryDoc>(COL).findOne({ _id: id });
    return doc ? strip(doc) : null;
  }

  const all = await readJsonFile<ServiceEnquiry[]>(serviceEnquiriesPath, []);
  return all.find((e) => e.id === id) ?? null;
}

export async function listServiceEnquiries(params: {
  role: 'customer' | 'provider';
  userId: string;
  serviceId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ enquiries: ServiceEnquiry[]; total: number }> {
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const offset = Math.max(0, params.offset ?? 0);
  const key = params.role === 'provider' ? 'providerId' : 'customerId';

  const db = await getMongoDb();
  if (db) {
    const filter: Record<string, unknown> = { [key]: params.userId };
    if (params.serviceId) filter.serviceId = params.serviceId;
    const [total, docs] = await Promise.all([
      db.collection(COL).countDocuments(filter),
      db.collection<EnquiryDoc>(COL)
        .find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
    ]);
    return { enquiries: docs.map(strip), total };
  }

  const all = await readJsonFile<ServiceEnquiry[]>(serviceEnquiriesPath, []);
  const filtered = all
    .filter((e) => (params.role === 'provider' ? e.providerId === params.userId : e.customerId === params.userId))
    .filter((e) => (params.serviceId ? e.serviceId === params.serviceId : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { enquiries: filtered.slice(offset, offset + limit), total: filtered.length };
}
