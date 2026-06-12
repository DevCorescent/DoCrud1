import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendParserHistory, deleteParserHistoryEntry, getParserHistory, updateParserHistoryEntry } from '@/lib/server/parser-history';
import { ParserHistoryEntry } from '@/types/document';

export const dynamic = 'force-dynamic';

function canAccess(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return Boolean(session?.user);
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!canAccess(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entries = await getParserHistory();
    const visible = session?.user?.role === 'admin'
      ? entries
      : entries.filter((entry) => (
          entry.createdBy === session?.user?.email
          || (session?.user?.role === 'client' && entry.organizationId === session.user.id)
        ));
    return NextResponse.json(visible);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load parser history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!canAccess(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as Partial<ParserHistoryEntry>;
    if (!payload.title?.trim() || !payload.content?.trim() || !payload.insights) {
      return NextResponse.json({ error: 'Title, content, and parsed insights are required.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const entry: ParserHistoryEntry = {
      id: payload.id || `parser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: payload.title.trim(),
      sourceLabel: payload.sourceLabel?.trim() || '',
      sourceType: payload.sourceType || 'paste',
      extractionMethod: payload.extractionMethod || 'manual',
      content: payload.content,
      extractedCharacterCount: payload.content.length,
      insights: payload.insights,
      createdAt: payload.createdAt || now,
      updatedAt: now,
      createdBy: session?.user?.email || 'unknown',
      organizationId: session?.user?.role === 'client' ? session.user.id : payload.organizationId,
    };

    await appendParserHistory(entry);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save parser history' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!canAccess(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const payload = await request.json() as Partial<ParserHistoryEntry> & { id?: string };
    if (!payload.id) {
      return NextResponse.json({ error: 'History id is required.' }, { status: 400 });
    }

    const allEntries = await getParserHistory();
    const existing = allEntries.find((entry) => entry.id === payload.id);
    if (!existing) {
      return NextResponse.json({ error: 'Parser history entry not found.' }, { status: 404 });
    }
    const allowed = session?.user?.role === 'admin'
      || existing.createdBy === session?.user?.email
      || (session?.user?.role === 'client' && existing.organizationId === session.user.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await updateParserHistoryEntry(payload.id, (entry) => ({
      ...entry,
      title: payload.title?.trim() || entry.title,
      sourceLabel: typeof payload.sourceLabel === 'string' ? payload.sourceLabel.trim() : entry.sourceLabel,
      sourceType: payload.sourceType || entry.sourceType,
      extractionMethod: payload.extractionMethod || entry.extractionMethod,
      content: payload.content ?? entry.content,
      extractedCharacterCount: (payload.content ?? entry.content).length,
      insights: payload.insights || entry.insights,
      updatedAt: new Date().toISOString(),
    }));

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update parser history' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!canAccess(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'History id is required.' }, { status: 400 });
    }
    const allEntries = await getParserHistory();
    const existing = allEntries.find((entry) => entry.id === id);
    if (!existing) {
      return NextResponse.json({ error: 'Parser history entry not found.' }, { status: 404 });
    }
    const allowed = session?.user?.role === 'admin'
      || existing.createdBy === session?.user?.email
      || (session?.user?.role === 'client' && existing.organizationId === session.user.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await deleteParserHistoryEntry(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete parser history' }, { status: 500 });
  }
}
