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

export async function GET() {
  try {
    const raw = await readJsonFile<AdBanner[] | AdBannersData>(adBannersPath, []);
    const data: AdBannersData = Array.isArray(raw) ? { banners: raw } : raw;
    const active = data.banners
      .filter(b => b.active)
      .sort((a, b) => a.order - b.order);
    return NextResponse.json({ banners: active, heading: data.heading ?? '' });
  } catch (err) {
    console.error('[public/ad-banners GET]', err);
    return NextResponse.json({ banners: [], heading: '' });
  }
}
