import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import {
  createDocWordShareToken,
  deleteDocWordDocument,
  getDocWordDocumentForActor,
  updateDocWordDocument,
} from '@/lib/server/docword';
import { DocWordBlock, DocWordDocument } from '@/types/document';

export const dynamic = 'force-dynamic';

async function resolveActor(request: NextRequest) {
  const session = await getAuthSession();
  if (session?.user) {
    return {
      type: 'user' as const,
      userId: session.user.id,
      email: session.user.email || undefined,
    };
  }

  const guestId = request.headers.get('x-docword-guest')?.trim();
  if (!guestId) return null;
  return { type: 'guest' as const, guestId };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      return NextResponse.json({ error: 'Guest session is required.' }, { status: 400 });
    }

    const document = await getDocWordDocumentForActor(params.id, actor);
    if (!document) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load document.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      return NextResponse.json({ error: 'Guest session is required.' }, { status: 400 });
    }

    const payload = await request.json().catch(() => ({})) as Partial<DocWordDocument> & {
      saveSource?: 'autosave' | 'manual' | 'ai' | 'restore';
      shareMode?: 'private' | 'read' | 'write';
    };

    const updates: Partial<DocWordDocument> = {
      title: payload.title,
      emoji: payload.emoji,
      isFavorite: payload.isFavorite,
      favoriteSourceFolder: payload.favoriteSourceFolder,
      folderName: payload.folderName,
      folderLockCode: payload.folderLockCode,
      documentLockCode: payload.documentLockCode,
      templateId: payload.templateId,
      summary: payload.summary,
      documentTheme: payload.documentTheme,
      headerHtml: payload.headerHtml,
      footerHtml: payload.footerHtml,
      watermarkText: payload.watermarkText,
      requireSignature: payload.requireSignature,
      signatures: payload.signatures,
      trackChangesEnabled: payload.trackChangesEnabled,
      trackedChanges: payload.trackedChanges,
      selectionComments: payload.selectionComments,
      blocks: payload.blocks as DocWordBlock[] | undefined,
      html: payload.html,
      plainText: payload.plainText,
      wordCount: payload.wordCount,
      readTimeMinutes: payload.readTimeMinutes,
      lastAiAction: payload.lastAiAction,
      shareToken: payload.shareToken,
      accessGroups: payload.accessGroups,
    };

    if (payload.shareMode) {
      updates.shareMode = payload.shareMode;
      const hasGroupAccess = Array.isArray(payload.accessGroups) && payload.accessGroups.length > 0;
      updates.shareToken =
        payload.shareMode === 'private' && !hasGroupAccess
          ? undefined
          : payload.shareToken || createDocWordShareToken();
    }

    const document = await updateDocWordDocument(params.id, actor, updates, payload.saveSource || 'manual');
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update document.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      return NextResponse.json({ error: 'Guest session is required.' }, { status: 400 });
    }

    await deleteDocWordDocument(params.id, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete document.' }, { status: 500 });
  }
}
