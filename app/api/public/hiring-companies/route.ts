import { NextResponse } from 'next/server';
import { getHiringCompanies } from '@/lib/server/hiring-companies';

export const dynamic = 'force-dynamic';

/** Thin wrapper — the derivation and its cache live in lib so the homepage
    server component can seed the marquee from the same warm result. */
export async function GET() {
  try {
    return NextResponse.json(
      { companies: await getHiringCompanies() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[public/hiring-companies] GET error', error);
    return NextResponse.json({ companies: [] }, { status: 200 });
  }
}
