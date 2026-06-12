import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createDocWordBlock, createDocWordDocument, listDocWordDocumentsForActor } from '@/lib/server/docword';

export const dynamic = 'force-dynamic';

function resolveGuestId(request: NextRequest) {
  return request.headers.get('x-docword-guest')?.trim() || '';
}

async function resolveActor(request: NextRequest) {
  const session = await getAuthSession();
  if (session?.user) {
    return {
      type: 'user' as const,
      userId: session.user.id,
      email: session.user.email || undefined,
    };
  }

  const guestId = resolveGuestId(request);
  if (!guestId) return null;
  return { type: 'guest' as const, guestId };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      return NextResponse.json({ documents: [] });
    }
    const documents = await listDocWordDocumentsForActor(actor);
    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load documents.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      return NextResponse.json({ error: 'Guest session is required.' }, { status: 400 });
    }

    const payload = await request.json().catch(() => ({})) as {
      title?: string;
      folderName?: string;
      emoji?: string;
    };

    const document = await createDocWordDocument(actor, {
      title: payload.title?.trim() || 'Untitled document',
      folderName: payload.folderName?.trim() || 'General',
      emoji: payload.emoji?.trim() || '✍️',
      blocks: [createDocWordBlock('paragraph', '<p></p>')],
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create document.' }, { status: 500 });
  }
}

