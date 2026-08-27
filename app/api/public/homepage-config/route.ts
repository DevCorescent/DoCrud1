export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { DEFAULT_CONFIG, getHomepageConfig } from '@/lib/server/homepage-config';

/**
 * The public homepage configuration.
 *
 * The type, defaults and merge used to be duplicated here and in the Super
 * Admin route; both now read one definition from lib/server/homepage-config,
 * which also owns the short cache — so this endpoint is a thin pass-through
 * and cannot drift from what the admin panel writes.
 */
export async function GET() {
  try {
    return NextResponse.json({ config: await getHomepageConfig() });
  } catch (err) {
    console.error('[public/homepage-config GET]', err);
    return NextResponse.json({ config: DEFAULT_CONFIG });
  }
}
