export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readJsonFile, adBannersPath } from '@/lib/server/storage';

type AdBanner = {
  id: string;
  imageUrl: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  active: boolean;
  order: number;
  createdAt: string;
};

type AdBannersData = {
  heading?: string;
  banners: AdBanner[];
};

/**
 * Banners change rarely but this route is on the homepage's critical path and
 * every call was a fresh remote read (measured ~3.1 s). Cache the computed
 * result in-process, same pattern as /api/public/published.
 */
let _cache: { payload: { banners: AdBanner[]; heading: string }; ts: number } | null = null;
const CACHE_TTL = 60_000;

export async function GET() {
  try {
    if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
      return NextResponse.json(_cache.payload);
    }
    const raw = await readJsonFile<AdBanner[] | AdBannersData>(adBannersPath, []);
    const data: AdBannersData = Array.isArray(raw) ? { banners: raw } : raw;
    const active = data.banners
      .filter(b => b.active)
      .sort((a, b) => a.order - b.order);
    const payload = { banners: active, heading: data.heading ?? '' };
    _cache = { payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[public/ad-banners GET]', err);
    return NextResponse.json({ banners: [], heading: '' });
  }
}
