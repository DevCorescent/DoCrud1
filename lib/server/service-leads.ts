/**
 * Service Leads — the single lead store behind the Services feature.
 *
 * Every meaningful conversion event on a service (an enquiry today, a booking
 * request later) produces exactly one lead for the provider. There is
 * deliberately ONE lead architecture: `type` distinguishes where the lead came
 * from, so the provider's Leads screen never has to merge two shapes.
 *
 * Persistence follows `lib/server/resume-leads.ts` structurally — a dedicated
 * Mongo collection when the database is configured, a JSON file otherwise.
 * It intentionally does NOT use the whole-array app_state blob pattern that
 * `lib/server/services.ts` uses for bookings: a lead insert must never
 * read-modify-write every other lead, or concurrent enquiries lose each other.
 */
import path from 'path';
import { getMongoDb } from '@/lib/server/database';
import { dataDir, readJsonFile, writeJsonFile } from '@/lib/server/storage';

const COL = 'service_leads';
const serviceLeadsPath = path.join(dataDir, 'service-leads.json');

export type ServiceLeadType = 'enquiry' | 'booking';

/** §23 lead lifecycle. Providers move a lead through these. */
export type ServiceLeadStatus =
  | 'new'
  | 'contacted'
  | 'discussion'
  | 'quote_sent'
  | 'booking_requested'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'cancelled';

export const SERVICE_LEAD_STATUSES: ServiceLeadStatus[] = [
  'new',
  'contacted',
  'discussion',
  'quote_sent',
  'booking_requested',
  'accepted',
  'in_progress',
  'completed',
  'declined',
  'cancelled',
];

/** How the customer asked to be reached. `docrud_chat` keeps contact details private. */
export type ServiceContactMethod = 'docrud_chat' | 'email' | 'phone';

export interface ServiceLeadAttachment {
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

export interface ServiceLeadBudget {
  min?: number;
  max?: number;
  currency: string;
}

export interface ServiceLeadTimeline {
  startDate?: string;      // YYYY-MM-DD
  completionDate?: string; // YYYY-MM-DD
}

export interface ServiceLeadNote {
  id: string;
  body: string;
  createdAt: string;
  createdByUserId: string;
}

export interface ServiceLead {
  id: string;
  type: ServiceLeadType;

  /* Who / what */
  providerId: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceTitle: string;

  /* Source records — exactly one of these is set, matching `type`. */
  enquiryId?: string;
  bookingId?: string;

  /* What the customer wants */
  requirement: string;
  budget?: ServiceLeadBudget;
  timeline?: ServiceLeadTimeline;
  attachments: ServiceLeadAttachment[];
  companyInfo?: string;

  /* How to reach them — only the channel the customer chose is stored. */
  contactMethod: ServiceContactMethod;
  contactEmail?: string;
  contactPhone?: string;

  /* Booking specifics — unset on enquiry leads. */
  packageName?: string;
  price?: number;

  /* Where the discussion lives */
  conversationId?: string;

  status: ServiceLeadStatus;
  notes: ServiceLeadNote[];
  createdAt: string;
  updatedAt: string;
}

type LeadDoc = ServiceLead & { _id: string };

function strip({ _id: _unused, ...rest }: LeadDoc): ServiceLead {
  return rest;
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value?: string) {
  return (value || '').trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNotes(raw: unknown): ServiceLeadNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      id: normalize((item as ServiceLeadNote)?.id),
      body: normalize((item as ServiceLeadNote)?.body),
      createdAt: normalize((item as ServiceLeadNote)?.createdAt),
      createdByUserId: normalize((item as ServiceLeadNote)?.createdByUserId),
    }))
    .filter((note) => note.id && note.body && note.createdAt && note.createdByUserId)
    .slice(0, 300);
}

/**
 * Deterministic lead id, derived from the source record.
 *
 * This is what makes lead creation idempotent: two concurrent requests that
 * somehow reach `createServiceLead` for the same enquiry resolve to the same
 * `_id`, and the upsert's `$setOnInsert` keeps the first write. No duplicate
 * lead can exist for one enquiry, with or without a unique index.
 */
export function serviceLeadIdFor(type: ServiceLeadType, sourceId: string) {
  return `svclead_${type}_${sourceId}`;
}

export interface CreateServiceLeadInput {
  type: ServiceLeadType;
  providerId: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceTitle: string;
  enquiryId?: string;
  bookingId?: string;
  requirement: string;
  budget?: ServiceLeadBudget;
  timeline?: ServiceLeadTimeline;
  attachments?: ServiceLeadAttachment[];
  companyInfo?: string;
  contactMethod: ServiceContactMethod;
  contactEmail?: string;
  contactPhone?: string;
  conversationId?: string;
  /** Package / pricing chosen, for booking leads. */
  packageName?: string;
  price?: number;
  /** Defaults to 'new'. Booking leads open at 'booking_requested' (§23). */
  status?: ServiceLeadStatus;
}

/**
 * Create the lead for a conversion event. Idempotent per source record —
 * calling it twice for the same enquiry returns the original lead unchanged.
 */
export async function createServiceLead(input: CreateServiceLeadInput): Promise<ServiceLead> {
  const sourceId = input.type === 'enquiry' ? input.enquiryId : input.bookingId;
  if (!sourceId) {
    throw new Error(`A ${input.type} lead requires its source id.`);
  }

  const now = nowIso();
  const lead: ServiceLead = {
    id: serviceLeadIdFor(input.type, sourceId),
    type: input.type,
    providerId: input.providerId,
    customerId: input.customerId,
    customerName: input.customerName,
    serviceId: input.serviceId,
    serviceTitle: input.serviceTitle,
    ...(input.enquiryId ? { enquiryId: input.enquiryId } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    requirement: input.requirement,
    ...(input.budget ? { budget: input.budget } : {}),
    ...(input.timeline ? { timeline: input.timeline } : {}),
    attachments: input.attachments ?? [],
    ...(input.companyInfo ? { companyInfo: input.companyInfo } : {}),
    contactMethod: input.contactMethod,
    ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.packageName ? { packageName: input.packageName } : {}),
    ...(input.price != null ? { price: input.price } : {}),
    status: input.status && SERVICE_LEAD_STATUSES.includes(input.status) ? input.status : 'new',
    notes: [],
    createdAt: now,
    updatedAt: now,
  };

  const db = await getMongoDb();
  if (db) {
    await db.collection(COL).updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: lead.id as any },
      { $setOnInsert: { ...lead, _id: lead.id } },
      { upsert: true },
    );
    const saved = await db.collection<LeadDoc>(COL).findOne({ _id: lead.id });
    return saved ? strip(saved) : lead;
  }

  const existing = await readJsonFile<ServiceLead[]>(serviceLeadsPath, []);
  const already = existing.find((item) => item.id === lead.id);
  if (already) return already;
  await writeJsonFile(serviceLeadsPath, [lead, ...existing].slice(0, 6000));
  return lead;
}

export async function getServiceLeadById(leadId: string): Promise<ServiceLead | null> {
  const id = normalize(leadId);
  if (!id) return null;

  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<LeadDoc>(COL).findOne({ _id: id });
    return doc ? strip(doc) : null;
  }

  const existing = await readJsonFile<ServiceLead[]>(serviceLeadsPath, []);
  return existing.find((lead) => lead.id === id) ?? null;
}

/** Lead already created for a given source record, if any. */
export async function getServiceLeadForSource(
  type: ServiceLeadType,
  sourceId: string,
): Promise<ServiceLead | null> {
  return getServiceLeadById(serviceLeadIdFor(type, sourceId));
}

export interface ListServiceLeadsParams {
  providerId: string;
  q?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

/** Provider-side listing. §22 UI will build on this; nothing else uses it yet. */
export async function listServiceLeadsForProvider(
  params: ListServiceLeadsParams,
): Promise<{ leads: ServiceLead[]; total: number }> {
  const providerId = normalize(params.providerId);
  const q = normalize(params.q);
  const status = normalize(params.status);
  const type = normalize(params.type);
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const offset = Math.max(0, params.offset ?? 0);

  const db = await getMongoDb();
  if (db) {
    const filter: Record<string, unknown> = { providerId };
    if (status && SERVICE_LEAD_STATUSES.includes(status as ServiceLeadStatus)) filter.status = status;
    if (type === 'enquiry' || type === 'booking') filter.type = type;
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { customerName: re },
        { serviceTitle: re },
        { requirement: re },
        { companyInfo: re },
      ];
    }
    const [total, docs] = await Promise.all([
      db.collection(COL).countDocuments(filter),
      db.collection<LeadDoc>(COL)
        .find(filter).sort({ updatedAt: -1 }).skip(offset).limit(limit).toArray(),
    ]);
    return { leads: docs.map(strip), total };
  }

  const raw = await readJsonFile<ServiceLead[]>(serviceLeadsPath, []);
  const qLow = q.toLowerCase();
  const filtered = raw
    .filter((lead) => lead.providerId === providerId)
    .filter((lead) => (status ? lead.status === status : true))
    .filter((lead) => (type === 'enquiry' || type === 'booking' ? lead.type === type : true))
    .filter((lead) => {
      if (!qLow) return true;
      return [lead.customerName, lead.serviceTitle, lead.requirement, lead.companyInfo]
        .filter(Boolean).join(' ').toLowerCase().includes(qLow);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return { leads: filtered.slice(offset, offset + limit), total: filtered.length };
}

/** Provider-only mutation. Ownership is enforced by the `providerId` filter. */
export async function updateServiceLead(params: {
  providerId: string;
  leadId: string;
  status?: string;
  noteBody?: string;
}): Promise<ServiceLead> {
  const providerId = normalize(params.providerId);
  const leadId = normalize(params.leadId);
  const requestedStatus = normalize(params.status);
  const noteBody = normalize(params.noteBody).slice(0, 1400);
  const nextStatus = SERVICE_LEAD_STATUSES.includes(requestedStatus as ServiceLeadStatus)
    ? (requestedStatus as ServiceLeadStatus)
    : undefined;
  const now = nowIso();

  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<LeadDoc>(COL).findOne({ _id: leadId, providerId });
    if (!doc) throw new Error('Lead not found.');
    const nextNotes = noteBody
      ? [{ id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, body: noteBody, createdAt: now, createdByUserId: providerId }, ...parseNotes(doc.notes)].slice(0, 240)
      : parseNotes(doc.notes);
    const setFields: Record<string, unknown> = { notes: nextNotes, updatedAt: now };
    if (nextStatus) setFields.status = nextStatus;
    await db.collection<LeadDoc>(COL).updateOne({ _id: leadId, providerId }, { $set: setFields });
    const saved = await db.collection<LeadDoc>(COL).findOne({ _id: leadId });
    if (!saved) throw new Error('Lead not found.');
    return strip(saved);
  }

  const existing = await readJsonFile<ServiceLead[]>(serviceLeadsPath, []);
  const idx = existing.findIndex((lead) => lead.id === leadId && lead.providerId === providerId);
  if (idx === -1) throw new Error('Lead not found.');
  const current = existing[idx];
  const nextNotes = noteBody
    ? [{ id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, body: noteBody, createdAt: now, createdByUserId: providerId }, ...(current.notes || [])].slice(0, 240)
    : current.notes || [];
  const updated: ServiceLead = { ...current, status: nextStatus || current.status, notes: nextNotes, updatedAt: now };
  existing[idx] = updated;
  await writeJsonFile(serviceLeadsPath, existing.slice(0, 6000));
  return updated;
}
