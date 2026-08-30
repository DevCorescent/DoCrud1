/**
 * GET/DELETE /api/ats/reports/[id] — one saved evaluation.
 *
 * Both lookups are scoped by `userId`, so a report belonging to another member
 * resolves to null and returns 404 — the same response as an id that does not
 * exist. That is deliberate: a distinct 403 would confirm the id is real and
 * turn the endpoint into an existence oracle.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { deleteAtsReport, getAtsReport } from '@/lib/server/ats/reports';
import { isValidReportId } from '@/lib/server/ats/safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    const userId = await resolveSessionUserId(session);
    if (!userId) return errorResponse(401, 'UNAUTHORIZED', 'Sign in to see this report.');

    const { id } = await context.params;
    /* An id that is not a UUID did not come from this system, so it is rejected
       before it reaches the database. Same 404 as a real-but-foreign id: a
       distinct response would confirm which ids exist. */
    if (!isValidReportId(id)) return errorResponse(404, 'NOT_FOUND', 'That report was not found on your account.');
    const report = await getAtsReport(userId, id);
    if (!report) return errorResponse(404, 'NOT_FOUND', 'That report was not found on your account.');
    return NextResponse.json(report);
  } catch (err) {
    console.error('[ats] report read error:', err);
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while processing your request.');
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    const userId = await resolveSessionUserId(session);
    if (!userId) return errorResponse(401, 'UNAUTHORIZED', 'Sign in to delete this report.');

    const { id } = await context.params;
    if (!isValidReportId(id)) return errorResponse(404, 'NOT_FOUND', 'That report was not found on your account.');
    const deleted = await deleteAtsReport(userId, id);
    if (!deleted) return errorResponse(404, 'NOT_FOUND', 'That report was not found on your account.');
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[ats] report delete error:', err);
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while processing your request.');
  }
}
