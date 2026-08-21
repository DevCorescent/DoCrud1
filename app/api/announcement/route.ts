import { NextResponse } from 'next/server';
import { getNavAnnouncementSettings, isNavAnnouncementLive } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/announcement — read-only view of the top-nav announcement.
 *
 * Public by design (the bar renders for every signed-in user), so only the
 * display fields are returned. `updatedAt`/`updatedBy` stay behind the
 * Super Admin endpoint — normal users have no business seeing who configured it.
 * Writes live in /api/super-admin/settings and are guarded there.
 */
export async function GET() {
  try {
    const a = await getNavAnnouncementSettings();
    /* The schedule window is resolved here, on the server, so a client can
       never show a bar outside the dates the Super Admin configured. */
    const live = isNavAnnouncementLive(a);
    return NextResponse.json(
      {
        enabled: live,
        text: a.text,
        href: a.href,
        subtitle: a.subtitle,
        ctaLabel: a.ctaLabel,
        ctaHref: a.ctaHref,
        showProfileProgress: a.showProfileProgress,
        showSpotsLeft: a.showSpotsLeft,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[announcement GET]', err);
    // A settings read failure must never break the navigation — fail closed.
    return NextResponse.json(
      {
        enabled: false,
        text: '',
        href: '',
        subtitle: '',
        ctaLabel: '',
        ctaHref: '',
        showProfileProgress: true,
        showSpotsLeft: true,
      },
      { status: 200 },
    );
  }
}
