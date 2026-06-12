import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/drive/public-download?id=<fileId>
 *
 * DocRud Drive stores files in the user's browser (IndexedDB), so files are
 * not accessible server-side. This endpoint gracefully redirects the visitor
 * to the Drive with the ?drive-open param, which triggers the client-side
 * download flow once the Drive component loads and finds the file in its
 * local storage.
 *
 * If the recipient is a different person from the sender (the common email
 * sharing case) and the file is not in their drive, the Drive will show the
 * "Add to Drive" import confirmation instead.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Missing file id parameter' },
      { status: 400 },
    );
  }

  // Redirect to the main app with drive-open param so the Drive auto-opens
  // and triggers the client-side download for that file.
  const redirectUrl = new URL(origin);
  redirectUrl.searchParams.set('drive-open', id);

  return NextResponse.redirect(redirectUrl.toString(), {
    status: 302,
    headers: {
      // Prevent caching so the redirect always re-evaluates the file state
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
