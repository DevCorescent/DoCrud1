import { NextResponse } from 'next/server';
import { getGigCategories, getGigInterests, getPublicGigListings } from '@/lib/server/gigs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [gigs, categories, interests] = await Promise.all([
      getPublicGigListings(),
      getGigCategories(),
      getGigInterests(),
    ]);

    return NextResponse.json({
      gigs,
      categories,
      interests,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to load gigs.' }, { status: 500 });
  }
}
