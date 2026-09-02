/**
 * Serve one application's resume.
 *
 * The highest-risk endpoint in Phase 9. Access is decided by
 * lib/server/job-api/resume-access.ts and re-derived from the STORED
 * application every request, so an id that leaked or was guessed proves
 * nothing about who may read the file.
 *
 * NO STORAGE CREDENTIAL EVER REACHES THE BROWSER. The stored object URL is
 * fetched server-side and streamed back; the caller receives bytes, never a
 * path, a bucket name or a signed key.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getHiringApplications, viewerOrganizationIds } from '@/lib/server/hiring';
import { canAccessResume, resumeContentType, resumeDisposition } from '@/lib/server/job-api/resume-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { applicationId: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  /* Independent stores, fetched together. canAccessResume still decides on the
     same records, and no résumé bytes are touched until it says yes. */
  const [users, applications] = await Promise.all([
    getStoredUsers(), getHiringApplications(),
  ]);
  const actor = users.find((u) => u.email.toLowerCase() === session.user.email!.toLowerCase());
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const application = applications.find((a) => a.id === params.applicationId) ?? null;

  const verdict = canAccessResume({
    viewerUserId: actor.id,
    viewerOrganizationIds: await viewerOrganizationIds(actor),
    isAdmin: actor.role === 'admin',
    application,
  });

  if (!verdict.allowed) {
    /* FORBIDDEN and NOT_FOUND both answer 404, so probing ids cannot map out
       which applications exist. */
    const status = verdict.reason === 'UNAUTHENTICATED' ? 401
      : verdict.reason === 'NO_RESUME' ? 404 : 404;
    return NextResponse.json({ error: 'Resume not available.' }, { status });
  }

  const file = verdict.file!;
  /* Inline is a REQUEST, not a guarantee — resumeDisposition grants it only
     for PDFs and forces a download for every other type. */
  const disposition = resumeDisposition(file.fileName, request.nextUrl.searchParams.get('inline') === '1');

  /* No stored file, but parsed text exists — serve the text rather than
     pretending there is a PDF. */
  if (!file.url && file.hasText) {
    return new NextResponse(application!.resumeText, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${file.fileName.replace(/\.[^.]+$/, '')}.txt"`,
        'cache-control': 'private, no-store',
      },
    });
  }

  try {
    const upstream = await fetch(file.url!, { cache: 'no-store' });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Resume not available.' }, { status: 404 });
    }
    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': resumeContentType(file.fileName),
        /* The filename is already sanitised by safeResumeFileName, so it can
           neither inject a header nor smuggle a path. */
        'content-disposition': `${disposition}; filename="${file.fileName}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        /* Even a PDF shown inline is rendered with no script, no forms and no
           same-origin privileges. */
        'content-security-policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return NextResponse.json({ error: 'Resume not available.' }, { status: 502 });
  }
}
