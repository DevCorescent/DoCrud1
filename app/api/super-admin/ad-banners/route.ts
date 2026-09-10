import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { readJsonFile, writeJsonFile, adBannersPath } from '@/lib/server/storage';
import { normalizeHeroBanner, type HeroBanner } from '@/lib/hero-banner';
import { invalidateHeroBanners } from '@/lib/server/hero-banners';

export const dynamic = 'force-dynamic';

/* One definition, in lib/hero-banner.ts, shared with the public route, the
   slider and the command centre. */
type AdBanner = HeroBanner;

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
      invalidateHeroBanners();
      return NextResponse.json({ success: true, heading: data.heading });
    }

    if (action === 'upsert') {
      if (!banner) return NextResponse.json({ error: 'banner required' }, { status: 400 });
      const idx = data.banners.findIndex(b => b.id === banner.id);

      /* Normalised, never stored as it arrived: colours have to be hex, links
         have to be same-origin or https, and a motif has to be one this build
         can draw. And MERGED onto what is already there — the older Ad Banner
         panel does not know about mobile artwork, colours or motifs, and
         saving a title from it must not silently erase them. */
      const merged = normalizeHeroBanner(banner, idx >= 0 ? data.banners[idx] : undefined);
      if (!merged) return NextResponse.json({ error: 'Invalid banner' }, { status: 400 });

      if (idx >= 0) {
        data.banners[idx] = merged;
      } else {
        data.banners.push({ ...merged, order: data.banners.length });
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
    /* The homepage renders the hero from a cached server read. Without this an
       admin saves a slide and then watches an unchanged homepage for up to a
       minute, which reads as the save having failed. */
    invalidateHeroBanners();
    return NextResponse.json({ success: true, banners: data.banners });
  } catch (err) {
    console.error('[super-admin/ad-banners POST]', err);
    return NextResponse.json({ error: 'Failed to update banners' }, { status: 500 });
  }
}
