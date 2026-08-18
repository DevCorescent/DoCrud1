import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getContactVisibility, saveContactVisibility } from '@/lib/server/service-safety';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

/**
 * §25 — the provider decides which contact details become visible once a
 * request is accepted. Always scoped to the session user: there is no way to
 * read or change anybody else's preference through this route.
 */
export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const settings = await getContactVisibility(actor.id);
    return NextResponse.json({ settings, accountEmail: actor.email });
  } catch (error) {
    console.error('[services/safety/contact-visibility] GET error', error);
    return NextResponse.json({ error: 'Failed to load contact settings.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as
      | { shareEmail?: unknown; sharePhone?: unknown; phone?: unknown }
      | null;
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

    const phone = typeof body.phone === 'string' ? body.phone.replace(/[^\d+\-\s()]/g, '').trim() : undefined;
    if (phone && phone.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }

    const settings = await saveContactVisibility(actor.id, {
      ...(typeof body.shareEmail === 'boolean' ? { shareEmail: body.shareEmail } : {}),
      ...(typeof body.sharePhone === 'boolean' ? { sharePhone: body.sharePhone } : {}),
      ...(phone !== undefined ? { phone } : {}),
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('[services/safety/contact-visibility] PUT error', error);
    return NextResponse.json({ error: 'Failed to save contact settings.' }, { status: 500 });
  }
}
