/**
 * §25 Contact and Spam Protection.
 *
 * One module for the four safeguards the Services flows need: rate limiting,
 * spam heuristics, user blocks, and abuse reports — plus the provider's
 * contact-visibility preference that decides what a customer may see after
 * their request is accepted.
 *
 * Persistence follows `lib/server/service-leads.ts`: dedicated Mongo
 * collections when the database is configured, JSON files otherwise. Counters
 * are incremented with $inc so two concurrent submissions cannot both read a
 * stale count.
 */
import path from 'path';
import { getMongoDb } from '@/lib/server/database';
import { dataDir, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import type { ServiceLeadStatus } from '@/lib/server/service-leads';

const RATE_COL = 'service_rate_limits';
const BLOCK_COL = 'service_blocks';
const REPORT_COL = 'service_reports';
const CONTACT_COL = 'service_contact_settings';

const rateLimitsPath = path.join(dataDir, 'service-rate-limits.json');
const blocksPath = path.join(dataDir, 'service-blocks.json');
const reportsPath = path.join(dataDir, 'service-reports.json');
const contactSettingsPath = path.join(dataDir, 'service-contact-settings.json');

function nowIso() { return new Date().toISOString(); }
function normalize(v?: string) { return (v || '').trim(); }

/* ─── Rate limiting ────────────────────────────────────────────────────── */

/**
 * Chosen limits. Generous for a person sending real requests, tight enough
 * that a script cannot spray a provider:
 *   - 5 enquiries per hour and 5 booking requests per hour (counted apart)
 *   - 20 service requests per day across both flows
 */
export const RATE_LIMITS = {
  enquiry: { limit: 5, windowMs: 60 * 60 * 1000, label: 'enquiries' },
  booking: { limit: 5, windowMs: 60 * 60 * 1000, label: 'booking requests' },
  daily: { limit: 20, windowMs: 24 * 60 * 60 * 1000, label: 'service requests' },
  /* Anonymous onboarding résumé reads, counted per client address rather than
     per user because there is no user yet. Deliberately small: parsing is
     deterministic and cheap, but an open file endpoint still deserves a ceiling. */
  resumeExtract: { limit: 10, windowMs: 60 * 60 * 1000, label: 'resume reads' },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window rolls over. */
  retryAfterSeconds: number;
  label: string;
}

interface RateRow { _id: string; count: number; windowStart: number; expiresAt: string }

/** Fixed-window counter. Call once per attempt; it both counts and decides. */
export async function consumeRateLimit(action: RateLimitAction, userId: string): Promise<RateLimitResult> {
  const { limit, windowMs, label } = RATE_LIMITS[action];
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = `${action}:${userId}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs).toISOString();
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - Date.now()) / 1000));

  let count = 1;
  const db = await getMongoDb();
  if (db) {
    const res = await db.collection<RateRow>(RATE_COL).findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 }, $setOnInsert: { windowStart, expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
    const doc = (res as unknown as { value?: RateRow; count?: number });
    count = doc?.value?.count ?? doc?.count ?? 1;
  } else {
    const all = await readJsonFile<Record<string, RateRow>>(rateLimitsPath, {});
    const fresh: Record<string, RateRow> = {};
    const cutoff = nowIso();
    for (const [k, row] of Object.entries(all)) {
      if (row?.expiresAt && row.expiresAt > cutoff) fresh[k] = row;   // drop expired windows
    }
    const existing = fresh[key];
    count = (existing?.count ?? 0) + 1;
    fresh[key] = { _id: key, count, windowStart, expiresAt };
    await writeJsonFile(rateLimitsPath, fresh);
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
    label,
  };
}

/* ─── Spam heuristics ──────────────────────────────────────────────────── */

export interface SpamVerdict { spam: boolean; reason?: string }

const SPAM_PHRASES = [
  'make money fast', 'work from home guaranteed', 'investment opportunity guaranteed',
  'crypto investment', 'forex signals', 'buy followers', 'seo backlinks unlimited',
  'click here now', 'limited time offer act now',
];

/**
 * Deliberately blunt and conservative — it catches link farms and keyboard
 * mash, and lets ordinary badly-typed requirements through. Anything subtler
 * belongs in Report/Block, not in an automatic reject.
 */
export function detectSpam(text: string): SpamVerdict {
  const body = normalize(text);
  if (!body) return { spam: false };
  const lower = body.toLowerCase();

  const links = (body.match(/https?:\/\/|www\.[a-z0-9-]+\./gi) ?? []).length;
  if (links > 3) return { spam: true, reason: 'Too many links.' };

  if (/(.)\1{14,}/.test(body)) return { spam: true, reason: 'Repeated characters.' };

  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length >= 20) {
    const unique = new Set(words).size;
    if (unique / words.length < 0.25) return { spam: true, reason: 'Repeated content.' };
  }

  const letters = body.replace(/[^a-z]/gi, '');
  if (letters.length > 40) {
    const caps = (body.match(/[A-Z]/g) ?? []).length;
    if (caps / letters.length > 0.8) return { spam: true, reason: 'Excessive capitals.' };
  }

  const hits = SPAM_PHRASES.filter((p) => lower.includes(p)).length;
  if (hits >= 2 || (hits >= 1 && links >= 2)) return { spam: true, reason: 'Promotional content.' };

  return { spam: false };
}

/* ─── Blocks ───────────────────────────────────────────────────────────── */

export interface ServiceBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: string;
}

function blockId(blockerId: string, blockedId: string) { return `${blockerId}__${blockedId}`; }

export async function blockUser(blockerId: string, blockedId: string, reason?: string): Promise<ServiceBlock> {
  if (!blockerId || !blockedId) throw new Error('Both users are required.');
  if (blockerId === blockedId) throw new Error('You cannot block yourself.');

  const block: ServiceBlock = {
    id: blockId(blockerId, blockedId),
    blockerId,
    blockedId,
    ...(normalize(reason) ? { reason: normalize(reason).slice(0, 300) } : {}),
    createdAt: nowIso(),
  };

  const db = await getMongoDb();
  if (db) {
    await db.collection(BLOCK_COL).updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: block.id as any },
      { $setOnInsert: { ...block, _id: block.id } },
      { upsert: true },
    );
    return block;
  }
  const all = await readJsonFile<ServiceBlock[]>(blocksPath, []);
  const found = all.find((b) => b.id === block.id);
  if (found) return found;
  await writeJsonFile(blocksPath, [block, ...all].slice(0, 20000));
  return block;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
  const id = blockId(blockerId, blockedId);
  const db = await getMongoDb();
  if (db) {
    const res = await db.collection<ServiceBlock & { _id: string }>(BLOCK_COL).deleteOne({ _id: id });
    return res.deletedCount > 0;
  }
  const all = await readJsonFile<ServiceBlock[]>(blocksPath, []);
  const next = all.filter((b) => b.id !== id);
  if (next.length === all.length) return false;
  await writeJsonFile(blocksPath, next);
  return true;
}

/** True when either party has blocked the other — blocks cut contact both ways. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const ids = [blockId(a, b), blockId(b, a)];
  const db = await getMongoDb();
  if (db) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await db.collection(BLOCK_COL).countDocuments({ _id: { $in: ids as any } });
    return count > 0;
  }
  const all = await readJsonFile<ServiceBlock[]>(blocksPath, []);
  return all.some((x) => ids.includes(x.id));
}

export async function listBlockedUsers(blockerId: string): Promise<ServiceBlock[]> {
  const db = await getMongoDb();
  if (db) {
    const docs = await db.collection<ServiceBlock & { _id: string }>(BLOCK_COL)
      .find({ blockerId }).sort({ createdAt: -1 }).limit(200).toArray();
    return docs.map(({ _id: _unused, ...rest }) => rest as ServiceBlock);
  }
  const all = await readJsonFile<ServiceBlock[]>(blocksPath, []);
  return all.filter((b) => b.blockerId === blockerId);
}

/* ─── Reports ──────────────────────────────────────────────────────────── */

export type ServiceReportTarget = 'enquiry' | 'booking' | 'lead';
export type ServiceReportStatus = 'pending' | 'reviewed' | 'dismissed';

export const SERVICE_REPORT_REASONS = ['spam', 'abusive', 'scam', 'irrelevant', 'other'] as const;
export type ServiceReportReason = typeof SERVICE_REPORT_REASONS[number];

export interface ServiceReport {
  id: string;
  reporterId: string;
  targetType: ServiceReportTarget;
  targetId: string;
  reportedUserId: string;
  serviceId?: string;
  reason: string;
  details?: string;
  status: ServiceReportStatus;
  createdAt: string;
}

function reportId(reporterId: string, targetType: ServiceReportTarget, targetId: string) {
  return `${reporterId}__${targetType}__${targetId}`;
}

/** Idempotent per (reporter, target): a second report returns the first. */
export async function createServiceReport(input: {
  reporterId: string;
  targetType: ServiceReportTarget;
  targetId: string;
  reportedUserId: string;
  serviceId?: string;
  reason: string;
  details?: string;
}): Promise<{ report: ServiceReport; duplicate: boolean }> {
  const report: ServiceReport = {
    id: reportId(input.reporterId, input.targetType, input.targetId),
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reportedUserId: input.reportedUserId,
    ...(input.serviceId ? { serviceId: input.serviceId } : {}),
    reason: input.reason,
    ...(normalize(input.details) ? { details: normalize(input.details).slice(0, 1200) } : {}),
    status: 'pending',
    createdAt: nowIso(),
  };

  const db = await getMongoDb();
  if (db) {
    const existing = await db.collection<ServiceReport & { _id: string }>(REPORT_COL).findOne({ _id: report.id });
    if (existing) {
      const { _id: _unused, ...rest } = existing;
      return { report: rest as ServiceReport, duplicate: true };
    }
    await db.collection(REPORT_COL).updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: report.id as any },
      { $setOnInsert: { ...report, _id: report.id } },
      { upsert: true },
    );
    return { report, duplicate: false };
  }

  const all = await readJsonFile<ServiceReport[]>(reportsPath, []);
  const found = all.find((r) => r.id === report.id);
  if (found) return { report: found, duplicate: true };
  await writeJsonFile(reportsPath, [report, ...all].slice(0, 20000));
  return { report, duplicate: false };
}

export async function getServiceReport(id: string): Promise<ServiceReport | null> {
  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<ServiceReport & { _id: string }>(REPORT_COL).findOne({ _id: id });
    if (!doc) return null;
    const { _id: _unused, ...rest } = doc;
    return rest as ServiceReport;
  }
  const all = await readJsonFile<ServiceReport[]>(reportsPath, []);
  return all.find((r) => r.id === id) ?? null;
}

/* ─── Provider contact visibility ──────────────────────────────────────── */

export interface ContactVisibilitySettings {
  userId: string;
  /** Share the account email once a request is accepted. */
  shareEmail: boolean;
  /** Share `phone` once a request is accepted. */
  sharePhone: boolean;
  phone?: string;
  updatedAt?: string;
}

/** Private by default — nothing is shared until the provider opts in. */
export const DEFAULT_CONTACT_VISIBILITY: Omit<ContactVisibilitySettings, 'userId'> = {
  shareEmail: false,
  sharePhone: false,
};

/**
 * Lead states that count as "accepted" for §25. Before one of these a customer
 * sees no provider contact details at all — the conversation is the channel.
 */
export const CONTACT_REVEAL_STATUSES: ServiceLeadStatus[] = ['accepted', 'in_progress', 'completed'];

export function isContactRevealStatus(status: ServiceLeadStatus) {
  return CONTACT_REVEAL_STATUSES.includes(status);
}

export async function getContactVisibility(userId: string): Promise<ContactVisibilitySettings> {
  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<ContactVisibilitySettings & { _id: string }>(CONTACT_COL).findOne({ _id: userId });
    if (!doc) return { userId, ...DEFAULT_CONTACT_VISIBILITY };
    const { _id: _unused, ...rest } = doc;
    return { ...DEFAULT_CONTACT_VISIBILITY, ...(rest as ContactVisibilitySettings), userId };
  }
  const all = await readJsonFile<Record<string, ContactVisibilitySettings>>(contactSettingsPath, {});
  return all[userId]
    ? { ...DEFAULT_CONTACT_VISIBILITY, ...all[userId], userId }
    : { userId, ...DEFAULT_CONTACT_VISIBILITY };
}

export async function saveContactVisibility(
  userId: string,
  patch: Partial<Omit<ContactVisibilitySettings, 'userId'>>,
): Promise<ContactVisibilitySettings> {
  const current = await getContactVisibility(userId);
  const next: ContactVisibilitySettings = {
    ...current,
    ...(typeof patch.shareEmail === 'boolean' ? { shareEmail: patch.shareEmail } : {}),
    ...(typeof patch.sharePhone === 'boolean' ? { sharePhone: patch.sharePhone } : {}),
    ...(patch.phone !== undefined ? { phone: normalize(patch.phone).slice(0, 20) || undefined } : {}),
    userId,
    updatedAt: nowIso(),
  };
  /* A phone cannot be advertised when none was provided. */
  if (next.sharePhone && !next.phone) next.sharePhone = false;

  const db = await getMongoDb();
  if (db) {
    await db.collection(CONTACT_COL).replaceOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: userId as any },
      { ...next, _id: userId },
      { upsert: true },
    );
    return next;
  }
  const all = await readJsonFile<Record<string, ContactVisibilitySettings>>(contactSettingsPath, {});
  all[userId] = next;
  await writeJsonFile(contactSettingsPath, all);
  return next;
}

export interface RevealedProviderContact {
  email?: string;
  phone?: string;
  /** False until the request is accepted AND the provider opted in. */
  revealed: boolean;
}

/**
 * What a customer may see of the provider's contact details for one lead.
 * Both conditions must hold: an accepted-or-later lead, and an explicit
 * provider opt-in per channel.
 */
export async function resolveProviderContact(params: {
  providerId: string;
  providerEmail?: string;
  leadStatus?: ServiceLeadStatus | null;
}): Promise<RevealedProviderContact> {
  if (!params.leadStatus || !isContactRevealStatus(params.leadStatus)) return { revealed: false };
  const settings = await getContactVisibility(params.providerId);
  const email = settings.shareEmail && params.providerEmail ? params.providerEmail : undefined;
  const phone = settings.sharePhone && settings.phone ? settings.phone : undefined;
  return { ...(email ? { email } : {}), ...(phone ? { phone } : {}), revealed: Boolean(email || phone) };
}
