import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getInfinityCounts, bulkActivateInfinityForNonPremium, normalizeInfinityPeriod } from '@/lib/server/infinity';

export const dynamic = 'force-dynamic';

/**
 * Bulk Infinity Premium activation for Super Admins.
 *
 * SECURITY MODEL — why this is safe:
 *  - Every request passes the SAME super-admin guard the single-user grant uses;
 *    an unauthenticated or non-super-admin request gets 401 before anything runs.
 *  - The client sends NO user list and NO premium status. The server alone reads
 *    storage, decides who is eligible (no active Infinity), and mutates. A caller
 *    cannot target arbitrary users or fake anyone's current status.
 *  - The only client-influenced input is `period`, and it is passed through
 *    normalizeInfinityPeriod() (whitelist → 'monthly' | '3m' | '6m' | 'annual',
 *    default 'monthly'); anything else is discarded server-side.
 *  - Activation reuses the existing activateInfinity() path, so expiry/renewal
 *    semantics are identical to a manual grant; already-active users are skipped,
 *    making repeat calls a no-op.
 *  - The action is written to the existing super-admin audit log.
 *  - Errors return generic messages — no stack traces, DB errors, or secrets.
 */
async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** GET — current active-Infinity coverage (premium / non-premium / total). */
export async function GET(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;
  try {
    const counts = await getInfinityCounts();
    return NextResponse.json(counts);
  } catch {
    return NextResponse.json({ error: 'Failed to load Infinity counts.' }, { status: 500 });
  }
}

/** POST — activate Infinity for every user without active Infinity. */
export async function POST(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;
  try {
    const body = (await req.json().catch(() => ({}))) as { period?: unknown };
    // Server-side validation: only a whitelisted period is honoured.
    const period = normalizeInfinityPeriod(body.period);

    const result = await bulkActivateInfinityForNonPremium({ period });

    await appendSuperAdminAudit({
      action: 'bulk_activate_premium',
      targetType: 'user',
      targetId: 'ALL_NON_PREMIUM',
      details: { period, ...result, source: 'infinity_tab_bulk' },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    return NextResponse.json({ success: true, period, ...result });
  } catch {
    return NextResponse.json({ error: 'Bulk activation failed.' }, { status: 500 });
  }
}
