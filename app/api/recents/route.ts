import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getRecents, createRecent } from '@/lib/server/recents';
import { getProfileAvatars } from '@/lib/server/user-profiles';

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

  /* Resolve each story's avatar from ITS OWN owner's profile.
     `userAvatar` on the stored record is a snapshot taken at creation time from
     the OAuth session image (see POST below), so it is null for anyone who did
     not sign in with a provider that supplies a picture, and it never reflects
     a profile photo uploaded to Docrud afterwards. Resolving on read keyed by
     `r.userId` makes every story show its own owner's current photo.

     One bulk query for all owners — getProfileAvatars() exists precisely to
     avoid the per-author N+1 this would otherwise be. The stored snapshot is
     kept as a fallback so stories from users with no Docrud avatar but a
     provider picture do not regress. */
  const ownerIds = Array.from(new Set(visible.map((r) => r.userId).filter(Boolean)));
  let avatars = new Map<string, string | null>();
  try {
    avatars = await getProfileAvatars(ownerIds);
  } catch {
    // Enrichment is best-effort: fall back to the stored value rather than
    // failing the whole feed.
  }

  const recents = visible.map((r) => ({
    ...r,
    userAvatar: avatars.get(r.userId) || r.userAvatar || null,
  }));

  return NextResponse.json({ recents });
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
