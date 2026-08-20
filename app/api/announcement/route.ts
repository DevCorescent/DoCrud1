import { NextResponse } from 'next/server';
import { getNavAnnouncementSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/announcement — read-only view of the top-nav announcement.
 *
 * Public by design (the bar renders for every signed-in user), so only the
 * three display fields are returned. `updatedAt`/`updatedBy` stay behind the
 * Super Admin endpoint — normal users have no business seeing who configured it.
 * Writes live in /api/super-admin/settings and are guarded there.
 */
export async function GET() {
  try {
    const a = await getNavAnnouncementSettings();
    return NextResponse.json(
      { enabled: a.enabled, text: a.text, href: a.href },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[announcement GET]', err);
    // A settings read failure must never break the navigation — fail closed.
    return NextResponse.json({ enabled: false, text: '', href: '' }, { status: 200 });
  }
}
