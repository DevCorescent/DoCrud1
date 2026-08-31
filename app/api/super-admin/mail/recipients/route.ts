/**
 * Recipient search and audience preview.
 *
 * The invariant this endpoint exists to protect: THE BROWSER CHOOSES AN
 * AUDIENCE DEFINITION, THE SERVER DECIDES WHO IS IN IT. The client sends a
 * segment — "active candidates registered in the last 30 days" — and never a
 * recipient list or a count. A count that arrived from a browser would be
 * unverifiable, and a list would let a crafted request mail anyone.
 *
 * GET  ?q=&page=   paginated user search for the picker
 * POST { segment } resolve the segment: counts, plus optional per-user rows
 *
 * Both are Super Admin only, and both return display fields only — never a
 * whole user record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import {
  searchRecipientUsers, resolveRecipients, previewRecipientRows, describeSegment,
  type MailSegment, type RecipientOutcome,
} from '@/lib/server/mail-recipients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  return session.valid ? session : null;
}

/**
 * Build a segment from an untrusted payload.
 *
 * Every field is taken by name and coerced; an unrecognised mode becomes an
 * error rather than something permissive. Nothing here can widen an audience
 * beyond what the modes allow.
 */
function readSegment(value: unknown): MailSegment | null {
  const body = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const mode = String(body.mode ?? '');
  const modes = ['all', 'individuals', 'businesses', 'filtered', 'selected', 'manual'];
  if (!modes.includes(mode)) return null;

  const filters = (typeof body.filters === 'object' && body.filters !== null
    ? body.filters : {}) as Record<string, unknown>;

  return {
    mode: mode as MailSegment['mode'],
    userIds: Array.isArray(body.userIds) ? body.userIds.map(String).slice(0, 5000) : undefined,
    emails: Array.isArray(body.emails) ? body.emails.map(String).slice(0, 5000) : undefined,
    filters: mode === 'filtered' ? {
      accountType: filters.accountType === 'business' || filters.accountType === 'individual'
        ? filters.accountType : undefined,
      status: filters.status === 'active' || filters.status === 'inactive'
        ? filters.status : undefined,
      role: typeof filters.role === 'string' && filters.role ? filters.role.slice(0, 60) : undefined,
      createdWithinDays: Number.isFinite(Number(filters.createdWithinDays))
        && Number(filters.createdWithinDays) > 0
        ? Math.min(3650, Math.floor(Number(filters.createdWithinDays))) : undefined,
      hasLoggedIn: filters.hasLoggedIn === 'yes' || filters.hasLoggedIn === 'no'
        ? filters.hasLoggedIn : undefined,
      search: typeof filters.search === 'string' && filters.search
        ? filters.search.slice(0, 120) : undefined,
    } : undefined,
  };
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const search = (params.get('q') ?? '').slice(0, 120);
  const page = Math.max(1, Number(params.get('page')) || 1);

  try {
    /* Search is a `filtered` segment, so the picker and the send path use one
       matching implementation. */
    const result = await searchRecipientUsers({
      segment: { mode: 'filtered', filters: search ? { search } : {} },
      page,
      pageSize: 25,
    });
    return NextResponse.json({
      users: result.users.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        accountType: u.accountType, organizationName: u.organizationName,
        isActive: u.isActive,
      })),
      total: result.total, page: result.page, totalPages: result.totalPages,
    });
  } catch (error) {
    console.error('[mail/recipients GET]', error);
    return NextResponse.json({ error: 'Unable to search users.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const segment = readSegment(body.segment);
  if (!segment) {
    return NextResponse.json({ error: 'A valid audience type is required.' }, { status: 400 });
  }

  try {
    const resolution = await resolveRecipients(segment);

    /* Rows are opt-in: the counts are what the confirmation screen needs, and
       the table is only fetched when the admin asks to see it. */
    const wantRows = body.includeRows === true;
    const rows = wantRows
      ? await previewRecipientRows(segment, {
          page: Number(body.page) || 1,
          pageSize: 25,
          outcome: ['included', 'excluded', 'invalid'].includes(String(body.outcome))
            ? String(body.outcome) as RecipientOutcome : undefined,
        })
      : null;

    return NextResponse.json({
      description: describeSegment(segment),
      selected: resolution.selected,
      excluded: resolution.excluded,
      invalid: resolution.invalid,
      final: resolution.final,
      invalidSamples: resolution.invalidSamples,
      /* The addresses themselves are deliberately NOT returned. */
      rows: rows?.rows ?? null,
      rowsTotal: rows?.total ?? null,
      rowsPage: rows?.page ?? null,
      rowsTotalPages: rows?.totalPages ?? null,
    });
  } catch (error) {
    /* "Could not resolve" is not "zero recipients" — reporting 0 here would
       invite an admin to conclude the audience is empty. */
    console.error('[mail/recipients POST]', error);
    return NextResponse.json({ error: 'Unable to resolve recipients.' }, { status: 500 });
  }
}
