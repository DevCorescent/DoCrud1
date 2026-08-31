/**
 * GET/POST /api/super-admin/seo/sitemap — sitemap health.
 *
 * GET returns configuration plus the recent validation history and runs
 * NOTHING, so opening the SEO Manager stays as fast as it was. POST is the
 * "Validate sitemap" button: it performs the actual fetch-and-check.
 *
 * The split matters. Validating on GET would mean every admin page load fetched
 * the sitemap, and the panel polls nothing — validation happens only when a
 * person asks for it.
 *
 * History reuses the existing Super Admin audit log rather than introducing a
 * second logging system, so a validation also shows up in the Audit tab
 * alongside every other admin action.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getSuperAdminSessionFromRequest,
  appendSuperAdminAudit,
  getSuperAdminAuditLog,
} from '@/lib/server/super-admin-auth';
import { getPublicAppBaseUrl } from '@/lib/url';
import { getSeoSettings } from '@/lib/server/seo-settings';
import { validateSitemap, resolveSelfOrigin } from '@/lib/server/sitemap-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AUDIT_ACTION = 'seo.sitemap.validated';
const HISTORY_LIMIT = 10;

async function guard(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  return session.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

interface HistoryEntry {
  time: string;
  status: string;
  urls: number | null;
  issues: number | null;
}

async function readHistory(): Promise<HistoryEntry[]> {
  try {
    /* The audit log is shared, so read a wide window and filter rather than
       assuming sitemap events sit at the top. */
    const log = await getSuperAdminAuditLog(500);
    return log
      .filter((e) => e.action === AUDIT_ACTION)
      .slice(0, HISTORY_LIMIT)
      .map((e) => {
        const d = (e.details ?? {}) as Record<string, unknown>;
        return {
          time: e.timestamp,
          status: typeof d.status === 'string' ? d.status : 'unknown',
          urls: typeof d.totalUrls === 'number' ? d.totalUrls : null,
          issues: typeof d.issueCount === 'number' ? d.issueCount : null,
        };
      });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;
  try {
    const canonicalHost = getPublicAppBaseUrl();
    const settings = await getSeoSettings().catch(() => null);
    return NextResponse.json({
      /* Configuration only — no validation is performed here. */
      canonicalHost,
      sitemapUrl: `${canonicalHost}/sitemap.xml`,
      robotsUrl: `${canonicalHost}/robots.txt`,
      indexingEnabled: settings ? !settings.noindex : true,
      googleVerificationConfigured: Boolean(settings?.googleSiteVerification?.trim()),
      history: await readHistory(),
      report: null,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load sitemap status.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;
  try {
    /* The target is chosen by the server and allow-listed. No URL is read from
       the request, so there is nothing here to point at an internal host. */
    const origin = resolveSelfOrigin(req);
    const report = await validateSitemap({ origin });

    await appendSuperAdminAudit({
      action: AUDIT_ACTION,
      targetType: 'sitemap',
      targetId: report.sitemapUrl,
      details: {
        status: report.status,
        totalUrls: report.totalUrls,
        issueCount: report.issues.length,
        responseMs: report.responseMs,
      },
    }).catch(() => { /* history is a convenience; never fail the validation for it */ });

    return NextResponse.json({ report, history: await readHistory() });
  } catch (error) {
    console.error('[super-admin/seo/sitemap] validation failed', error);
    return NextResponse.json({ error: 'Sitemap validation failed.' }, { status: 500 });
  }
}
