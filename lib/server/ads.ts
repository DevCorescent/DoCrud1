/**
 * Sponsored advertising — model, lifecycle, targeting and counters.
 *
 * Two sources feed the same serving surface:
 *
 *   1. Legacy `ad-banners.json` records that Superadmin already manages. They
 *      have no owner, payment or targeting, so they are adapted read-only into
 *      the new shape and treated as superadmin-owned, always-approved, always
 *      untargeted. Existing data is never rewritten or destroyed.
 *   2. New `sponsored-ads.json` campaigns, which carry the full lifecycle.
 *
 * Only the server decides whether an ad is servable. Nothing a client sends can
 * set price, payment state, approval state or active state.
 */

import {
  readJsonFile, writeJsonFile,
  sponsoredAdsPath, adEventsPath, adBannersPath,
} from '@/lib/server/storage';
import { getRazorpayConfig } from '@/lib/server/billing';

/** Explicit lifecycle. An ad is only servable in `active`. */
export type AdStatus =
  | 'draft'
  | 'payment_pending'
  | 'payment_success'
  | 'pending_approval'
  | 'active'
  | 'rejected'
  | 'expired'
  | 'disabled';

export type AdvertiserType = 'superadmin' | 'user';

export type SponsoredAd = {
  id: string;
  ownerId: string;                 // '' for legacy superadmin banners
  ownerName?: string;
  advertiserType: AdvertiserType;

  imageUrl: string;
  title: string;
  subtitle?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;

  /* Targeting. Empty array = no restriction on that dimension. */
  targetSection?: string[];
  targetDomain?: string[];
  targetProfession?: string[];
  targetSkills?: string[];
  targetLocation?: string[];

  /* Commercial. Amounts are paise, computed server-side only. */
  durationDays: number;
  feeInPaise: number;
  orderId?: string;
  paymentId?: string;
  paymentStatus: 'none' | 'pending' | 'paid' | 'failed';

  status: AdStatus;
  rejectionReason?: string;
  startAt?: string;
  endAt?: string;

  impressions: number;
  clicks: number;

  createdAt: string;
  updatedAt: string;
  /** Legacy banners are served but cannot be edited through the new APIs. */
  legacy?: boolean;
};

type LegacyBanner = {
  id?: string; imageUrl: string; title: string; subtitle?: string;
  ctaLabel?: string; ctaHref?: string; active: boolean; order?: number; createdAt?: string;
};
type LegacyData = { heading?: string; banners: LegacyBanner[] };

/** Price list. Server-side only — the client never supplies a fee. */
export const AD_PRICE_PER_DAY_PAISE = 20_000;      // ₹200 / day
export const AD_MIN_DAYS = 1;
export const AD_MAX_DAYS = 90;

export function calculateAdFeeInPaise(durationDays: number): number {
  const days = Math.min(AD_MAX_DAYS, Math.max(AD_MIN_DAYS, Math.round(durationDays || 0)));
  return days * AD_PRICE_PER_DAY_PAISE;
}

export async function getAllSponsoredAds(): Promise<SponsoredAd[]> {
  const list = await readJsonFile<SponsoredAd[]>(sponsoredAdsPath, []);
  return Array.isArray(list) ? list : [];
}

async function saveAll(ads: SponsoredAd[]): Promise<void> {
  await writeJsonFile(sponsoredAdsPath, ads);
}

/** Legacy banners, adapted. Read-only: the source file is never modified here. */
export async function getLegacyAds(): Promise<SponsoredAd[]> {
  const raw = await readJsonFile<LegacyBanner[] | LegacyData>(adBannersPath, []);
  const data: LegacyData = Array.isArray(raw) ? { banners: raw } : (raw ?? { banners: [] });
  const banners = Array.isArray(data.banners) ? data.banners : [];
  return banners
    .filter((b) => b && b.active && b.imageUrl)
    .map((b, i) => ({
      id: b.id || `legacy_${i}`,
      ownerId: '',
      ownerName: 'Docrud',
      advertiserType: 'superadmin' as const,
      imageUrl: b.imageUrl,
      title: b.title ?? '',
      subtitle: b.subtitle,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      durationDays: 0,
      feeInPaise: 0,
      paymentStatus: 'none' as const,
      status: 'active' as AdStatus,
      impressions: 0,
      clicks: 0,
      createdAt: b.createdAt ?? new Date(0).toISOString(),
      updatedAt: b.createdAt ?? new Date(0).toISOString(),
      legacy: true,
    }));
}

export async function getAdById(adId: string): Promise<SponsoredAd | null> {
  const ads = await getAllSponsoredAds();
  return ads.find((a) => a.id === adId) ?? null;
}

export async function getAdsByOwner(ownerId: string): Promise<SponsoredAd[]> {
  const ads = await getAllSponsoredAds();
  return ads.filter((a) => a.ownerId === ownerId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createAd(
  data: Omit<SponsoredAd, 'id' | 'impressions' | 'clicks' | 'createdAt' | 'updatedAt'>,
): Promise<SponsoredAd> {
  const ads = await getAllSponsoredAds();
  const now = new Date().toISOString();
  const ad: SponsoredAd = {
    ...data,
    id: `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    impressions: 0,
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  };
  await saveAll([ad, ...ads]);
  return ad;
}

/** Patch an ad. Callers are responsible for authorising the change. */
export async function updateAd(adId: string, patch: Partial<SponsoredAd>): Promise<SponsoredAd | null> {
  const ads = await getAllSponsoredAds();
  const idx = ads.findIndex((a) => a.id === adId);
  if (idx === -1) return null;
  ads[idx] = { ...ads[idx], ...patch, id: adId, updatedAt: new Date().toISOString() };
  await saveAll(ads);
  return ads[idx];
}

export async function deleteAd(adId: string, ownerId: string): Promise<boolean> {
  const ads = await getAllSponsoredAds();
  const next = ads.filter((a) => !(a.id === adId && a.ownerId === ownerId));
  if (next.length === ads.length) return false;
  await saveAll(next);
  return true;
}

/** An ad is servable only when approved, active, paid where required, and in window. */
export function isServable(ad: SponsoredAd, now = Date.now()): boolean {
  if (ad.status !== 'active') return false;
  if (!ad.legacy && ad.paymentStatus !== 'paid' && ad.advertiserType === 'user') return false;
  if (ad.startAt && Date.parse(ad.startAt) > now) return false;
  if (ad.endAt && Date.parse(ad.endAt) <= now) return false;
  return true;
}

export type ViewerSignals = {
  domain: string;        // headline / professional domain
  profession: string;
  skills: string[];
  location: string;
  section?: string;
};

function norm(s: unknown): string { return String(s ?? '').trim().toLowerCase(); }
function anyMatch(targets: string[] | undefined, values: string[]): boolean {
  if (!targets || targets.length === 0) return true;   // unrestricted dimension
  const set = new Set(values.map(norm).filter(Boolean));
  return targets.some((t) => set.has(norm(t)));
}

/**
 * Relevance score for a viewer. Returns null when the ad explicitly targets a
 * dimension the viewer does not match — those ads are skipped, not down-ranked.
 */
export function scoreAdForViewer(ad: SponsoredAd, v: ViewerSignals, targetingEnabled: boolean): number | null {
  if (!targetingEnabled) return 1;

  const domainVals = [v.domain, v.profession].filter(Boolean);
  if (!anyMatch(ad.targetDomain, domainVals)) return null;
  if (!anyMatch(ad.targetProfession, [v.profession])) return null;
  if (!anyMatch(ad.targetSkills, v.skills)) return null;
  if (!anyMatch(ad.targetLocation, [v.location])) return null;
  if (v.section && !anyMatch(ad.targetSection, [v.section])) return null;

  /* More specific targeting that still matches ranks higher than a blanket ad. */
  let score = 1;
  if (ad.targetDomain?.length) score += 8;
  if (ad.targetProfession?.length) score += 6;
  if (ad.targetSkills?.length) score += 4;
  if (ad.targetLocation?.length) score += 2;
  return score;
}

/** Expire anything past its window, so an expired ad can never be served. */
export async function expireDueAds(): Promise<void> {
  const ads = await getAllSponsoredAds();
  const now = Date.now();
  let changed = false;
  for (const ad of ads) {
    if (ad.status === 'active' && ad.endAt && Date.parse(ad.endAt) <= now) {
      ad.status = 'expired';
      ad.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) await saveAll(ads);
}

/* ── Analytics ─────────────────────────────────────────────────────────
   Counters live on the ad; raw events are appended with a viewer key so a
   repeated impression from the same viewer in the same window is ignored. */

type AdEvent = { adId: string; kind: 'impression' | 'click'; viewer: string; at: string };
const IMPRESSION_DEDUPE_MS = 30 * 60_000;

export async function recordAdEvent(adId: string, kind: 'impression' | 'click', viewer: string): Promise<boolean> {
  const ads = await getAllSponsoredAds();
  const idx = ads.findIndex((a) => a.id === adId);
  if (idx === -1) return false;                 // legacy banners carry no counters

  const events = await readJsonFile<AdEvent[]>(adEventsPath, []);
  const now = Date.now();

  if (kind === 'impression') {
    const dup = events.some(
      (e) => e.adId === adId && e.kind === 'impression' && e.viewer === viewer
        && now - Date.parse(e.at) < IMPRESSION_DEDUPE_MS,
    );
    if (dup) return false;
  }

  ads[idx][kind === 'impression' ? 'impressions' : 'clicks'] += 1;
  ads[idx].updatedAt = new Date().toISOString();
  await saveAll(ads);

  /* Keep the raw log bounded — it exists for dedupe, not warehousing. */
  const trimmed = [...events, { adId, kind, viewer, at: new Date().toISOString() }].slice(-5000);
  await writeJsonFile(adEventsPath, trimmed);
  return true;
}

export function ctr(ad: Pick<SponsoredAd, 'impressions' | 'clicks'>): number {
  return ad.impressions > 0 ? +((ad.clicks / ad.impressions) * 100).toFixed(2) : 0;
}

/**
 * Create the Razorpay order for a campaign.
 *
 * Same shape the other commerce flows in this codebase use (resume-connect,
 * gig-connect, template marketplace): create the order here, then record a
 * pending commerce transaction at the call site. The amount is derived from
 * the stored duration, never from the request.
 */
export async function createSponsoredAdOrder(params: {
  adId: string;
  ownerUserId: string;
  durationDays: number;
}): Promise<{ id: string; amountInPaise: number; keyId: string } | null> {
  const { keyId, keySecret } = getRazorpayConfig();
  if (!keyId || !keySecret) return null;

  const amountInPaise = calculateAdFeeInPaise(params.durationDays);
  const receipt = `ad_${params.ownerUserId.slice(0, 8)}_${Date.now().toString(36).slice(-8)}`;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        product: 'sponsored_ad',
        adId: params.adId,
        ownerUserId: params.ownerUserId,
        durationDays: String(params.durationDays),
      },
    }),
  });
  if (!response.ok) {
    console.error('[ads] razorpay order failed', response.status, await response.text().catch(() => ''));
    return null;
  }
  const order = (await response.json()) as { id?: string };
  if (!order?.id) return null;
  return { id: order.id, amountInPaise, keyId };
}
