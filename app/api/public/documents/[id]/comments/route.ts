import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createAccessEvent, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { CollaborationComment } from '@/types/document';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await request.json() as {
      type?: CollaborationComment['type'];
      message?: string;
      authorName?: string;
      password?: string;
    };

    if (!payload.message?.trim() || !payload.authorName?.trim()) {
      return NextResponse.json({ error: 'Author name and message are required' }, { status: 400 });
    }

    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (entry.shareRequiresPassword !== false && entry.sharePassword !== payload.password?.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Valid document password is required' }, { status: 403 });
    }
    if (entry.recipientAccess === 'view') {
      return NextResponse.json({ error: 'This shared document is view-only' }, { status: 403 });
    }

    const comment: CollaborationComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: payload.type === 'review' ? 'review' : 'comment',
      message: payload.message.trim(),
      authorName: payload.authorName.trim(),
      createdAt: new Date().toISOString(),
      createdIp: getRequestIp(request),
    };

    const updated = await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      collaborationComments: [comment, ...(current.collaborationComments || [])],
      accessEvents: [
        createAccessEvent({
          eventType: comment.type,
          createdAt: new Date().toISOString(),
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
          actorName: comment.authorName,
        }),
        ...(current.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [
        ...(current.automationNotes || []),
        `${comment.type === 'review' ? 'Review' : 'Comment'} added by ${comment.authorName}`,
      ],
    }));

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save comment' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as {
      commentId?: string;
      replyMessage?: string;
    };

    if (!payload.commentId || !payload.replyMessage?.trim()) {
      return NextResponse.json({ error: 'Comment ID and reply are required' }, { status: 400 });
    }

    const entry = await getHistoryEntryById(params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const updated = await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      collaborationComments: (current.collaborationComments || []).map((comment) =>
        comment.id === payload.commentId
          ? {
              ...comment,
              replyMessage: payload.replyMessage?.trim(),
              repliedAt: new Date().toISOString(),
              repliedBy: session.user.email || session.user.name || 'Admin',
            }
          : comment
      ),
      automationNotes: [
        ...(current.automationNotes || []),
        `Feedback reply added by ${session.user.email || session.user.name || 'Admin'}`,
      ],
    }));

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 });
  }
}
