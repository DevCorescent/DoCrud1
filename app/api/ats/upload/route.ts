/**
 * POST /api/ats/upload — parse a resume for evaluation. Stores nothing.
 *
 * DELIBERATELY NOT /api/profile/upload-resume. That endpoint rewrites the
 * caller's headline, bio, location, website, skills, experience, education,
 * achievements, social links AND resume history as a side effect of an upload
 * (see app/api/profile/upload-resume/route.ts). Correct when a member is
 * updating their profile; wrong when they are checking a resume against one job
 * posting. This route reads the file, extracts its text, returns the parsed
 * shape, and writes nothing anywhere — no profile fields, no resume history, no
 * object storage. The result lives in the browser for the length of the session
 * and is posted back to /api/ats/evaluate as `parsedResume`.
 *
 * Text extraction REUSES lib/server/document-parser.ts. No second parser.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { extractDocumentText } from '@/lib/server/document-parser';
import { parseResumeText } from '@/lib/server/ats/resume-text';
import { MAX_RESUME_CHARS } from '@/lib/server/ats/api';
import { MIN_EXTRACTED_CHARS, validateResumeUpload } from '@/lib/server/ats/upload';
import { rateLimit, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { atsLog, AtsTimeoutError, logUserRef, safeFileName, withParseTimeout } from '@/lib/server/ats/safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
      return errorResponse(401, 'UNAUTHORIZED', 'Sign in to upload a resume.');
    }

    /* Parsing a PDF is the expensive part of this route, so it is limited the
       same way evaluation is — per account, using the project's existing
       Mongo-backed limiter. */
    const limit = await rateLimit(`ats:upload:${userId}`, RATE_POLICIES.atsUploadAccount);
    if (!limit.allowed) {
      atsLog('ATS_RATE_LIMITED', { route: 'upload', user: logUserRef(userId) });
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many resume uploads. Please try again later.' } },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return errorResponse(400, 'INVALID_INPUT', 'Send the resume as multipart/form-data.');
    }

    const form = await request.formData();
    const file = form.get('resume');
    const rejection = validateResumeUpload(
      file instanceof File ? { name: file.name, size: file.size, type: file.type } : null,
    );
    if (rejection) {
      atsLog('ATS_UPLOAD_FAILED', { user: logUserRef(userId), reason: rejection.code, bytes: file instanceof File ? file.size : 0 });
      return errorResponse(rejection.code === 'FILE_TOO_LARGE' ? 413 : 400, rejection.code, rejection.message);
    }

    const upload = file as File;
    /* The name is only ever used for its extension, for the history label and
       for logging — never to build a path — but it is a stranger's string, so
       it is normalized once here rather than trusted at three call sites. */
    const fileName = safeFileName(upload.name);
    const startedAt = Date.now();
    let text: string;
    try {
      const bytes = Buffer.from(await upload.arrayBuffer());
      text = (await withParseTimeout(
        extractDocumentText(fileName, upload.type || 'application/octet-stream', bytes),
      )).trim();
    } catch (err) {
      const timedOut = err instanceof AtsTimeoutError;
      atsLog('ATS_UPLOAD_FAILED', {
        user: logUserRef(userId), reason: timedOut ? 'PARSE_TIMEOUT' : 'PARSE_ERROR',
        bytes: upload.size, ms: Date.now() - startedAt,
      });
      /* The parser's own message can name temp paths and binaries, so it is
         never forwarded. A timeout and a malformed file get the same advice,
         because the remedy is the same. */
      return errorResponse(422, 'UNPROCESSABLE',
        "We couldn't read that file. If it is a scanned image or password-protected, try a DOCX or paste the text instead.");
    }

    if (text.length < MIN_EXTRACTED_CHARS) {
      atsLog('ATS_UPLOAD_FAILED', { user: logUserRef(userId), reason: 'INSUFFICIENT_TEXT', chars: text.length, ms: Date.now() - startedAt });
      return errorResponse(422, 'UNPROCESSABLE',
        "We couldn't extract enough usable resume information. If it is a scanned image, try a DOCX or paste the text instead.");
    }

    const clipped = text.slice(0, MAX_RESUME_CHARS);
    atsLog('ATS_UPLOAD_COMPLETED', {
      user: logUserRef(userId), bytes: upload.size, chars: clipped.length, ms: Date.now() - startedAt,
    });
    return NextResponse.json({
      fileName,
      characterCount: clipped.length,
      truncated: clipped.length < text.length,
      /* Returned to the caller, not stored. The browser posts it straight back
         to /api/ats/evaluate, so the file is parsed exactly once. */
      parsedResume: parseResumeText(clipped),
      resumeText: clipped,
    });
  } catch (err) {
    /* Logged in full server-side, reported generically to the caller. */
    console.error('[ats] upload route error:', err);
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while processing your request.');
  }
}
