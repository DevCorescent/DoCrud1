import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getRecents, createRecent } from '@/lib/server/recents';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuthSession();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const all = await getRecents();
  const visible = all.filter((r) => {
    if (r.visibility === 'public') return true;
    if (userId && r.userId === userId) return true;
    return false;
  });

  visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ recents: visible });
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    type?: string;
    mediaUrl?: string;
    caption?: string;
    bgColor?: string;
    bgGradient?: string;
    textColor?: string;
    fontStyle?: string;
    fontSize?: number;
    ctaLabel?: string;
    ctaUrl?: string;
    expiryHours?: number;
    category?: string;
    visibility?: string;
  };

  const type = (body.type === 'image' || body.type === 'video' || body.type === 'text') ? body.type : 'text';
  const visibility = body.visibility === 'private' ? 'private' : 'public';

  const recent = await createRecent({
    userId,
    userName: session?.user?.name ?? 'Unknown',
    userAvatar: session?.user?.image ?? null,
    type,
    mediaUrl: body.mediaUrl ?? null,
    caption: body.caption ?? null,
    bgColor: body.bgColor,
    bgGradient: body.bgGradient,
    textColor: body.textColor,
    fontStyle: body.fontStyle,
    fontSize: typeof body.fontSize === 'number' ? body.fontSize : undefined,
    ctaLabel: body.ctaLabel,
    ctaUrl: body.ctaUrl,
    expiryHours: typeof body.expiryHours === 'number' ? body.expiryHours : undefined,
    category: body.category ?? 'General',
    visibility,
  });

  return NextResponse.json({ recent }, { status: 201 });
}
