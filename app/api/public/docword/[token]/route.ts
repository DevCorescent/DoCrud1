import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import {
  joinDocWordGroupByInviteToken,
  registerDocWordSharedAccess,
  resolveDocWordSharedEntry,
  resolveDocWordGroupByInviteToken,
  resolveDocWordGroupByShareToken,
  resolveDocWordGroupAccess,
  updateDocWordDocumentByShareToken,
} from '@/lib/server/docword';
import { DocWordBlock, DocWordDocument } from '@/types/document';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const resolved = await resolveDocWordSharedEntry(params.token);
    if (!resolved) {
      return NextResponse.json({ error: 'Shared document not found.' }, { status: 404 });
    }
    let document = resolved.document;
    const password = request.nextUrl.searchParams.get('password')?.trim() || '';
    const memberId = request.nextUrl.searchParams.get('memberId')?.trim() || '';
    const memberPassword = request.nextUrl.searchParams.get('memberPassword')?.trim() || '';
    const groupToken = request.nextUrl.searchParams.get('group')?.trim() || resolved.groupShareToken || '';
    const inviteToken = request.nextUrl.searchParams.get('invite')?.trim() || resolved.inviteToken || '';
    const session = await getAuthSession();
    const isOwner = Boolean(
      session?.user &&
      ((session.user.id && document.ownerUserId === session.user.id) ||
        (session.user.email && document.ownerEmail?.toLowerCase() === session.user.email.toLowerCase()))
    );
    const groupProtected = Boolean((document.accessGroups || []).length);
    const groupAccess = resolveDocWordGroupAccess(document, {
      userId: memberId,
      password: memberPassword,
      groupToken,
      inviteToken,
    });
    const targetGroup = resolveDocWordGroupByShareToken(document, groupToken);
    const inviteGroup = resolveDocWordGroupByInviteToken(document, inviteToken);
    const publicAccess = !groupProtected && (document.shareMode !== 'private' || isOwner);
    const passwordAllowed = groupProtected
      ? isOwner || Boolean(groupAccess)
      : isOwner || !document.documentLockCode || password === document.documentLockCode || Boolean(groupAccess);
    if ((!publicAccess && !groupAccess) || !passwordAllowed) {
      return NextResponse.json({
        locked: true,
        title: document.title,
        shareMode: document.shareMode,
        hasPassword: true,
        needsGroupAccess: !publicAccess,
        acceptsGroupAccess: Boolean((document.accessGroups || []).length),
        targetGroupName: targetGroup?.name,
        inviteGroupName: inviteGroup?.name,
        invitePermission: inviteGroup?.invitePermission || 'read',
      });
    }
    if (session?.user && !isOwner && (publicAccess || groupAccess) && resolved.documentToken) {
      document = await registerDocWordSharedAccess(resolved.documentToken, {
        type: 'user',
        userId: session.user.id,
        email: session.user.email || undefined,
      });
    }
    return NextResponse.json({ document, credentialAccess: groupAccess || undefined });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load shared document.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const resolved = await resolveDocWordSharedEntry(params.token);
    if (!resolved) {
      return NextResponse.json({ error: 'Shared document not found.' }, { status: 404 });
    }
    const payload = (await request.json().catch(() => ({}))) as {
      action?: 'join-group';
      inviteToken?: string;
      userId?: string;
      name?: string;
      password?: string;
    };

    if (payload.action !== 'join-group') {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    if (!payload.inviteToken?.trim() || !payload.userId?.trim() || !payload.password?.trim()) {
      return NextResponse.json({ error: 'Invite token, user ID, and password are required.' }, { status: 400 });
    }

    const joined = await joinDocWordGroupByInviteToken(resolved.documentToken || resolved.document.shareToken || params.token, payload.inviteToken, {
      userId: payload.userId,
      name: payload.name,
      password: payload.password,
    });

    return NextResponse.json({
      success: true,
      group: joined.group,
      credentialAccess: joined.group
        ? {
            groupId: joined.group.id,
            groupName: joined.group.name,
            permission: joined.group.invitePermission === 'write' ? 'write' : 'read',
          }
        : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to join collaboration group.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const resolved = await resolveDocWordSharedEntry(params.token);
    if (!resolved) {
      return NextResponse.json({ error: 'Shared document not found.' }, { status: 404 });
    }
    const existing = resolved.document;
    const password = request.nextUrl.searchParams.get('password')?.trim() || '';
    const memberId = request.nextUrl.searchParams.get('memberId')?.trim() || '';
    const memberPassword = request.nextUrl.searchParams.get('memberPassword')?.trim() || '';
    const session = await getAuthSession();
    const isOwner = Boolean(
      session?.user &&
      ((session.user.id && existing.ownerUserId === session.user.id) ||
        (session.user.email && existing.ownerEmail?.toLowerCase() === session.user.email.toLowerCase()))
    );
    const groupProtected = Boolean((existing.accessGroups || []).length);
    const groupToken = request.nextUrl.searchParams.get('group')?.trim() || resolved.groupShareToken || '';
    const inviteToken = request.nextUrl.searchParams.get('invite')?.trim() || resolved.inviteToken || '';
    const groupAccess = resolveDocWordGroupAccess(existing, {
      userId: memberId,
      password: memberPassword,
      groupToken,
      inviteToken,
    });
    const canWrite = isOwner || (!groupProtected && existing.shareMode === 'write') || groupAccess?.permission === 'write';
    if (!canWrite) {
      return NextResponse.json({ error: 'This shared document is not editable.' }, { status: 403 });
    }
    if (!groupProtected && existing.documentLockCode && !isOwner && password !== existing.documentLockCode && !groupAccess) {
      return NextResponse.json({ error: 'Invalid document password.' }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as Partial<DocWordDocument> & {
      saveSource?: 'autosave' | 'manual' | 'ai' | 'restore';
    };

    const updates: Partial<DocWordDocument> = {
      title: payload.title,
      emoji: payload.emoji,
      folderName: payload.folderName,
      summary: payload.summary,
      documentTheme: payload.documentTheme,
      blocks: payload.blocks as DocWordBlock[] | undefined,
      html: payload.html,
      plainText: payload.plainText,
      wordCount: payload.wordCount,
      readTimeMinutes: payload.readTimeMinutes,
      lastAiAction: payload.lastAiAction,
      accessGroups: payload.accessGroups,
    };

    const document = await updateDocWordDocumentByShareToken(
      resolved.documentToken || existing.shareToken || params.token,
      updates,
      payload.saveSource || 'manual',
    );

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update shared document.' },
      { status: 500 },
    );
  }
}
