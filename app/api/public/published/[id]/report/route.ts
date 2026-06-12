import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { reportPublishedItem } from '@/lib/server/feed-moderation';

export const dynamic = 'force-dynamic';

const VALID_REASONS = [
  'Misinformation / inaccurate content',
  'Spam or duplicate',
  'Inappropriate or offensive',
  'Copyright violation',
  'Harassment or abuse',
  'Other',
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAuthSession();

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason || '').trim();
    const detail = String(body.detail || '').trim().slice(0, 500);

    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: 'A valid report reason is required.' }, { status: 400 });
    }

    await reportPublishedItem({
      itemId: id,
      reporterUserId: session?.user?.id,
      reporterEmail: session?.user?.email || undefined,
      reason,
      detail: detail || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to submit report.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
