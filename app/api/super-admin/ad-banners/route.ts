import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { readJsonFile, writeJsonFile, adBannersPath } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

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

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

// Backward-compatible reader: old format was AdBanner[], new format is AdBannersData
async function readData(): Promise<AdBannersData> {
  const raw = await readJsonFile<AdBanner[] | AdBannersData>(adBannersPath, []);
  if (Array.isArray(raw)) return { banners: raw };
  return raw;
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await readData();
    return NextResponse.json({ banners: data.banners, heading: data.heading ?? '' });
  } catch (err) {
    console.error('[super-admin/ad-banners GET]', err);
    return NextResponse.json({ error: 'Failed to load banners' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json() as {
      action: 'upsert' | 'delete' | 'reorder' | 'set-heading';
      banner?: AdBanner;
      id?: string;
      order?: string[];
      heading?: string;
    };
    const { action, banner, id, order, heading } = body;

    const data = await readData();

    if (action === 'set-heading') {
      data.heading = (heading ?? '').trim();
      await writeJsonFile(adBannersPath, data);
      return NextResponse.json({ success: true, heading: data.heading });
    }

    if (action === 'upsert') {
      if (!banner) return NextResponse.json({ error: 'banner required' }, { status: 400 });
      const idx = data.banners.findIndex(b => b.id === banner.id);
      if (idx >= 0) {
        data.banners[idx] = banner;
      } else {
        data.banners.push({ ...banner, order: data.banners.length });
      }
    } else if (action === 'delete') {
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      data.banners = data.banners.filter(b => b.id !== id);
      data.banners = data.banners.map((b, i) => ({ ...b, order: i }));
    } else if (action === 'reorder') {
      if (!order) return NextResponse.json({ error: 'order required' }, { status: 400 });
      const map = new Map(data.banners.map(b => [b.id, b]));
      data.banners = order.map((oid, i) => {
        const b = map.get(oid);
        if (!b) throw new Error(`Unknown banner id: ${oid}`);
        return { ...b, order: i };
      });
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    await writeJsonFile(adBannersPath, data);
    return NextResponse.json({ success: true, banners: data.banners });
  } catch (err) {
    console.error('[super-admin/ad-banners POST]', err);
    return NextResponse.json({ error: 'Failed to update banners' }, { status: 500 });
  }
}
