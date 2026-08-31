/**
 * GET /api/super-admin/mail/analytics - aggregated mail reporting.
 *
 * Returns AGGREGATES only. No recipient addresses, no message ids, no provider
 * response text: an aggregate view has no need for any of them, and the
 * projection that reads the rows does not fetch them in the first place. When
 * an admin needs an individual record they follow the link to the Outbox,
 * which already answers that question properly.
 *
 * It opens NO provider connection. Reporting on past sends is not a reason to
 * perform an SMTP handshake, and an admin looking at a failure graph should not
 * be made to wait on the server that caused it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import {
  computeMailAnalytics, type AnalyticsScope, type Granularity, type AnalyticsResult,
} from '@/lib/server/mail-analytics';
import { SUPPORTED_TIMEZONES, isSupportedTimezone } from '@/lib/email/schedule-time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ranges the UI offers, in days. */
const PRESET_DAYS: Record<string, number> = { '1': 1, '7': 7, '30': 30, '90': 90 };

/* A year. Long enough for any real question, short enough that one request
   cannot ask the database to walk the whole collection. */
const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

/* ── Cache ─────────────────────────────────────────────────────────────────
   Aggregation is the expensive part of this endpoint and the answer changes
   slowly. Thirty seconds is short enough that a send made while an admin is
   watching shows up on their next refresh, and long enough that flipping
   between tabs does not re-aggregate.

   Deliberately in-process and per-query: no global no-store, no shared cache
   that could serve one admin's filtered view to another. */
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; value: AnalyticsResult }>();

function readCache(key: string): AnalyticsResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) { cache.delete(key); return null; }
  return hit.value;
}

function writeCache(key: string, value: AnalyticsResult) {
  /* Bounded, so a range picker cannot grow this without limit. */
  if (cache.size > 64) cache.clear();
  cache.set(key, { at: Date.now(), value });
}

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const p = new URL(req.url).searchParams;

  /* ── Timezone ──
     An allow-list. An arbitrary string would reach Intl, and a zone the app
     does not support would silently bucket into a different day. */
  const timezone = p.get('timezone') || 'UTC';
  if (!isSupportedTimezone(timezone)) {
    return NextResponse.json(
      { error: 'Unsupported timezone.', supported: SUPPORTED_TIMEZONES }, { status: 400 });
  }

  const scopeParam = p.get('scope') || 'production';
  if (scopeParam !== 'production' && scopeParam !== 'test' && scopeParam !== 'all') {
    return NextResponse.json({ error: 'Unknown scope.' }, { status: 400 });
  }
  const scope = scopeParam as AnalyticsScope;

  const granularityParam = p.get('granularity') || 'day';
  if (granularityParam !== 'day' && granularityParam !== 'week') {
    return NextResponse.json({ error: 'Unknown granularity.' }, { status: 400 });
  }
  const granularity = granularityParam as Granularity;

  /* ── Range ── */
  const now = new Date();
  let from: Date;
  let to = now;

  const customFrom = p.get('from');
  const customTo = p.get('to');
  if (customFrom || customTo) {
    const f = customFrom ? new Date(customFrom) : null;
    const t = customTo ? new Date(customTo) : now;
    if (!f || Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) {
      return NextResponse.json({ error: 'Invalid custom date range.' }, { status: 400 });
    }
    if (f.getTime() >= t.getTime()) {
      return NextResponse.json(
        { error: 'The start of the range must be before its end.' }, { status: 400 });
    }
    if (t.getTime() - f.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      return NextResponse.json(
        { error: `A range may not exceed ${MAX_RANGE_DAYS} days.` }, { status: 400 });
    }
    from = f;
    to = t;
  } else {
    const days = PRESET_DAYS[p.get('range') || '30'];
    if (!days) return NextResponse.json({ error: 'Unknown range.' }, { status: 400 });
    from = new Date(now.getTime() - days * DAY_MS);
  }

  const key = JSON.stringify({
    from: from.toISOString(), to: to.toISOString(), timezone, granularity, scope,
  });

  /* An explicit Refresh bypasses the cache; nothing else does. */
  const bypass = p.get('refresh') === '1';
  if (!bypass) {
    const hit = readCache(key);
    if (hit) return NextResponse.json({ ...hit, cached: true });
  }

  try {
    const result = await computeMailAnalytics({ from, to, timezone, granularity, scope });
    writeCache(key, result);
    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    console.error('[super-admin/mail/analytics]', error);
    return NextResponse.json({ error: 'Unable to compute analytics.' }, { status: 500 });
  }
}
