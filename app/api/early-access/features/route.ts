import { NextResponse } from 'next/server';
import { getEarlyAccessFeatures } from '@/lib/server/early-access';

export async function GET() {
  try {
    const features = await getEarlyAccessFeatures();
    return NextResponse.json({ features });
  } catch (err) {
    console.error('[early-access/features GET]', err);
    return NextResponse.json({ error: 'Failed to load features' }, { status: 500 });
  }
}
