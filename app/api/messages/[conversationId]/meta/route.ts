export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getChatMeta, setChatMeta } from '@/lib/server/messages';

// GET /api/messages/[conversationId]/meta
export async function GET(
  _req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const meta = await getChatMeta(params.conversationId, session.user.id);
  return NextResponse.json({ meta });
}

// PATCH /api/messages/[conversationId]/meta
export async function PATCH(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    label?: string;
    labelColor?: string;
    bgColor?: string;
    notes?: string;
    pinnedAt?: string | null;
  };

  const patch: Record<string, string | undefined> = {};
  if ('label' in body) patch.label = body.label ?? '';
  if ('labelColor' in body) patch.labelColor = body.labelColor ?? '';
  if ('bgColor' in body) patch.bgColor = body.bgColor ?? '';
  if ('notes' in body) patch.notes = body.notes ?? '';
  if ('pinnedAt' in body) patch.pinnedAt = body.pinnedAt ?? undefined;

  const meta = await setChatMeta(params.conversationId, session.user.id, patch);
  return NextResponse.json({ meta });
}
