import { NextResponse } from 'next/server';
import { getPublicDocrudiansData } from '@/lib/server/docrudians';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getPublicDocrudiansData();
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load Docrudians.' }, { status: 500 });
  }
}
