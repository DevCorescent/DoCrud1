import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getFeedModerationStats, moderatePublishedItem, ModerationAction } from '@/lib/server/feed-moderation';

export const dynamic = 'force-dynamic';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

function origin(req: NextRequest) {
  const h = req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${h}`;
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await getFeedModerationStats();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[super-admin/feeds GET]', err);
    return NextResponse.json({ error: 'Failed to load feeds' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sess = await guard(req);
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const itemId = String(body.itemId || '').trim();
    const action = String(body.action || '').trim() as ModerationAction;
    const note   = body.note ? String(body.note).trim().slice(0, 500) : undefined;

    const validActions: ModerationAction[] = ['suspend', 'remove', 'restore', 'under_review', 'dismiss_reports'];
    if (!itemId || !validActions.includes(action)) {
      return NextResponse.json({ error: 'itemId and a valid action are required.' }, { status: 400 });
    }

    const updated = await moderatePublishedItem({
      itemId,
      action,
      note,
      actorEmail: sess.email,
      origin: origin(req),
    });

    return NextResponse.json({ ok: true, moderationStatus: updated.moderationStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Action failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
