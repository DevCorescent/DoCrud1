/**
 * GET /api/ats/reports — one page of the caller's own ATS history.
 *
 * `userId` is part of the QUERY, not a filter applied afterwards, so another
 * member's reports are never selected in the first place. The `result` field is
 * projected away: a list screen shows five fields per row and does not need
 * twenty full reports.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { listAtsReports, HISTORY_PAGE_SIZE, MAX_REPORTS_PER_USER } from '@/lib/server/ats/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(request: Request) {
  try {
    const session = await getAuthSession();
    const userId = await resolveSessionUserId(session);
    if (!userId) return errorResponse(401, 'UNAUTHORIZED', 'Sign in to see your ATS history.');

    const params = new URL(request.url).searchParams;
    /* Clamped, not trusted: a caller asking for 10,000 rows gets one page. */
    const limit = Math.min(HISTORY_PAGE_SIZE, Math.max(1, Number(params.get('limit')) || HISTORY_PAGE_SIZE));
    const offset = Math.max(0, Number(params.get('offset')) || 0);

    const { items, total } = await listAtsReports(userId, { limit, offset });
    /* MAX_REPORTS_PER_USER is returned so the UI can state the retention
       policy rather than let a member discover it by finding a report gone. */
    return NextResponse.json({ items, total, limit, offset, retentionLimit: MAX_REPORTS_PER_USER });
  } catch (err) {
    console.error('[ats] history list error:', err);
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while processing your request.');
  }
}
