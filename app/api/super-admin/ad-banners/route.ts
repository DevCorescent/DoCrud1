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

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const banners = await readJsonFile<AdBanner[]>(adBannersPath, []);
    return NextResponse.json({ banners });
  } catch (err) {
    console.error('[super-admin/ad-banners GET]', err);
    return NextResponse.json({ error: 'Failed to load banners' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json() as {
      action: 'upsert' | 'delete' | 'reorder';
      banner?: AdBanner;
      id?: string;
      order?: string[];
    };
    const { action, banner, id, order } = body;

    let banners = await readJsonFile<AdBanner[]>(adBannersPath, []);

    if (action === 'upsert') {
      if (!banner) return NextResponse.json({ error: 'banner required' }, { status: 400 });
      const idx = banners.findIndex(b => b.id === banner.id);
      if (idx >= 0) {
        banners[idx] = banner;
      } else {
        banners.push({ ...banner, order: banners.length });
      }
    } else if (action === 'delete') {
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      banners = banners.filter(b => b.id !== id);
      // re-index order
      banners = banners.map((b, i) => ({ ...b, order: i }));
    } else if (action === 'reorder') {
      if (!order) return NextResponse.json({ error: 'order required' }, { status: 400 });
      const map = new Map(banners.map(b => [b.id, b]));
      banners = order.map((oid, i) => {
        const b = map.get(oid);
        if (!b) throw new Error(`Unknown banner id: ${oid}`);
        return { ...b, order: i };
      });
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    await writeJsonFile(adBannersPath, banners);
    return NextResponse.json({ success: true, banners });
  } catch (err) {
    console.error('[super-admin/ad-banners POST]', err);
    return NextResponse.json({ error: 'Failed to update banners' }, { status: 500 });
  }
}
