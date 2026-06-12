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

export async function GET() {
  try {
    const banners = await readJsonFile<AdBanner[]>(adBannersPath, []);
    const active = banners
      .filter(b => b.active)
      .sort((a, b) => a.order - b.order);
    return NextResponse.json({ banners: active });
  } catch (err) {
    console.error('[public/ad-banners GET]', err);
    return NextResponse.json({ banners: [] });
  }
}
