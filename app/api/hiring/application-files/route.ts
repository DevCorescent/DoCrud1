/**
 * Upload a file that belongs to ONE job application — a resume submitted for
 * this role, or a document the role asked for.
 *
 * Deliberately separate from /api/profile/upload-resume: that endpoint rewrites
 * the caller's profile (headline, skills, resumeFiles history) as a side effect,
 * which is correct when someone updates their own resume and wrong when they
 * attach a different one to a single application. This route stores the file and
 * nothing else — the profile is never touched.
 *
 * Storage reuses the existing R2 layer (lib/server/r2). Credentials stay on the
 * server; the browser only ever receives the resulting URL, and that URL is only
 * ever handed back to the uploader or, once submitted, to the company that owns
 * the job (see getVisibleHiringApplicationsForUser).
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { isR2Configured, uploadToR2 } from '@/lib/server/r2';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

/** Formats a candidate is allowed to attach, mapped to the extension we store. */
const ALLOWED: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const users = await getStoredUsers();
    const storedUser = users.find((entry) => entry.email.toLowerCase() === session.user.email!.toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file received.' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Files must be 10 MB or smaller.' }, { status: 400 });
    }

    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Upload a PDF, Word document, text file or image.' }, { status: 400 });
    }
    if (!isR2Configured()) {
      // Honest failure: better than accepting a file we cannot actually keep.
      return NextResponse.json({ error: 'File storage is unavailable right now. Try again later.' }, { status: 503 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uid = storedUser.id.replace(/[^a-z0-9]/gi, '').slice(0, 12);
    const key = `applications/${uid}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const url = await uploadToR2(key, buffer, file.type, { skipCompress: true });

    return NextResponse.json({
      url,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 500 },
    );
  }
}
