export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileData } from '@/lib/server/user-profiles';
import { hasInfinity } from '@/lib/server/infinity';
import { isStorageUrl } from '@/lib/server/r2';
import { recordResumeDownload } from '@/lib/server/profile-activity';
import { addSocialEvent } from '@/lib/server/social-events';

const MIME_BY_EXT: Record<string, string> = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt:  'text/plain',
};

function mimeForFile(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * GET /api/profile/resume/[userId]
 *
 * Streams the profile owner's latest uploaded resume. The stored file URL is never
 * handed to the client — the bytes are proxied here so the entitlement check is
 * always enforced server-side (same pattern as /api/public/file-transfers/[id]/download).
 *
 * Access: the profile owner, or any signed-in user with an active Docrud Infinity plan.
 */
export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Upgrade to infinity plan.' }, { status: 401 });
    }

    const viewerId = await resolveSessionUserId(session);
    if (!viewerId) {
      return NextResponse.json({ error: 'Upgrade to infinity plan.' }, { status: 401 });
    }

    const isOwner = viewerId === params.userId;

    // Entitlement — server-side, never trusts the client
    if (!isOwner && !(await hasInfinity(viewerId))) {
      return NextResponse.json({ error: 'Upgrade to infinity plan.' }, { status: 403 });
    }

    const profile = await getProfileData(params.userId);
    const entry = (profile.resumeFiles ?? []).find((f) => !!f?.url);
    if (!entry?.url) {
      return NextResponse.json({ error: 'Resume not available.' }, { status: 404 });
    }

    const fileName = (entry.fileName || 'resume').replace(/[^\w.\-]+/g, '_');

    // Authorization has already passed at this point, so this download counts.
    // Fire-and-forget: the bytes must not wait on analytics. The record is
    // idempotent per downloader/owner/day, so browser retries cannot inflate it.
    if (!isOwner) {
      void recordResumeDownload({
        resumeOwnerId: params.userId,
        downloaderUserId: viewerId,
        resumeId: entry.id,
      }).catch(() => { /* non-critical */ });

      // Neutral title on purpose: the notification bell is not entitlement-aware,
      // so naming the downloader here would leak identity to an owner without the
      // Infinity entitlement. Identity is served by /api/profile/activity, which
      // gates on the owner's plan.
      void addSocialEvent({
        type: 'document_viewed',
        actorId: viewerId,
        actorName: 'Someone',
        targetUserId: params.userId,
        resourceTitle: 'your resume',
        href: '/u/' + params.userId,
      }).catch(() => { /* non-critical */ });
    }

    // Stored in R2 — proxy the bytes so the storage URL stays server-side
    if (isStorageUrl(entry.url)) {
      const upstream = await fetch(entry.url);
      if (!upstream.ok) {
        return NextResponse.json({ error: 'Resume not available.' }, { status: 502 });
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeForFile(entry.fileName) || upstream.headers.get('content-type') || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // Local dev storage (public/uploads/resumes/...) — read from disk
    if (entry.url.startsWith('/uploads/')) {
      try {
        const filePath = path.join(process.cwd(), 'public', entry.url.replace(/^\/+/, ''));
        const buffer = await fs.readFile(filePath);
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': mimeForFile(entry.fileName),
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Cache-Control': 'private, no-store',
          },
        });
      } catch {
        return NextResponse.json({ error: 'Resume not available.' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Resume not available.' }, { status: 404 });
  } catch (error) {
    console.error('[profile/resume] GET error', error);
    return NextResponse.json({ error: 'Resume not available.' }, { status: 500 });
  }
}
