import { NextResponse } from 'next/server';
import { getAllProfiles } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

const TOTAL_SPOTS = 5000;

export async function GET() {
  try {
    const profiles = await getAllProfiles();
    const claimed = Object.values(profiles).filter(p => p.docrudGo === true).length;
    return NextResponse.json({
      claimed,
      total: TOTAL_SPOTS,
      remaining: Math.max(0, TOTAL_SPOTS - claimed),
      pct: Math.min(100, Math.round((claimed / TOTAL_SPOTS) * 100 * 10) / 10),
    });
  } catch {
    return NextResponse.json({ claimed: 0, total: TOTAL_SPOTS, remaining: TOTAL_SPOTS, pct: 0 });
  }
}
