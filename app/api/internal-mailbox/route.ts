import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { canUserAccessFeature } from '@/lib/server/saas';
import { createInternalMailThread, getVisibleInternalMailThreads, replyInternalMailThread, updateInternalMailThread } from '@/lib/server/internal-mailbox';

export const dynamic = 'force-dynamic';

function getWorkspaceOwnerId(user: { id: string; role?: string; organizationId?: string }) {
  if (user.role === 'client') return user.id;
  if (user.role === 'member' && user.organizationId) return user.organizationId;
  return user.id;
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((user) => user.email.toLowerCase() === (session.user.email || '').toLowerCase());

    if (session.user.role !== 'admin') {
      if (!storedUser) {
        return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
      }
      const allowed = await canUserAccessFeature(storedUser, 'team_workspace');
      if (!allowed) {
        return NextResponse.json({ error: 'Your current plan does not include internal collaboration.' }, { status: 403 });
      }
    }

    const threads = await getVisibleInternalMailThreads(storedUser || session.user as never);

    const workspaceOwnerId = storedUser ? getWorkspaceOwnerId(storedUser) : getWorkspaceOwnerId(session.user);
    const currentUserId = storedUser?.id || session.user.id;
    const currentUserEmail = (storedUser?.email || session.user.email || '').toLowerCase();
    const members = session.user.role === 'admin'
      ? users.filter((user) => user.role === 'member' || user.role === 'client')
      : users.filter((user) =>
          user.id === workspaceOwnerId
          || ((user.role === 'member' || user.role === 'client') && user.organizationId === workspaceOwnerId),
        )
        .filter((user) => user.id !== currentUserId && user.isActive !== false)
        .sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({
      threads,
      members: members.map(({ passwordHash, passwordSalt, ...safeUser }) => safeUser),
      currentUserId,
      currentUserEmail,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load internal mailbox.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((user) => user.email.toLowerCase() === (session.user.email || '').toLowerCase());
    if (!storedUser && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    const allowed = storedUser ? await canUserAccessFeature(storedUser, 'team_workspace') : true;
    if (!allowed && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Your current plan does not include internal collaboration.' }, { status: 403 });
    }

    const payload = await request.json() as {
      threadId?: string;
      subject?: string;
      body?: string;
      recipientIds?: string[];
    };

    if (!payload.body?.trim()) {
      return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
    }

    if (payload.threadId) {
      const thread = await replyInternalMailThread((storedUser || session.user) as never, payload.threadId, payload.body);
      return NextResponse.json(thread);
    }

    if (!payload.subject?.trim() || !Array.isArray(payload.recipientIds) || payload.recipientIds.length === 0) {
      return NextResponse.json({ error: 'Subject and at least one recipient are required.' }, { status: 400 });
    }

    const recipients = users
      .filter((user) => payload.recipientIds?.includes(user.id))
      .map((user) => ({ id: user.id, name: user.name, email: user.email }));

    const thread = await createInternalMailThread((storedUser || session.user) as never, {
      subject: payload.subject,
      body: payload.body,
      recipients,
    });
    return NextResponse.json(thread, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save mail thread.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as {
      threadId: string;
      status?: 'sent' | 'delivered' | 'read' | 'actioned';
      aiSummary?: string;
      aiActionItems?: string[];
    };

    if (!payload.threadId) {
      return NextResponse.json({ error: 'Thread ID is required.' }, { status: 400 });
    }

    const updated = await updateInternalMailThread(payload.threadId, (thread) => {
      const nextMessages = [...thread.messages];
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (lastMessage && payload.status) {
        nextMessages[nextMessages.length - 1] = {
          ...lastMessage,
          status: payload.status,
          updatedAt: new Date().toISOString(),
          readBy: payload.status === 'read' || payload.status === 'actioned'
            ? Array.from(new Set([...(lastMessage.readBy || []), (session.user.email || '').toLowerCase()].filter(Boolean)))
            : lastMessage.readBy,
        };
      }
      return {
        ...thread,
        messages: nextMessages,
        updatedAt: new Date().toISOString(),
        latestAiSummary: payload.aiSummary || thread.latestAiSummary,
        latestAiActionItems: Array.isArray(payload.aiActionItems) ? payload.aiActionItems : thread.latestAiActionItems,
      };
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update internal mail thread.' }, { status: 400 });
  }
}
