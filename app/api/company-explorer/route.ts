/**
 * The Company Explorer strip.
 *
 * LIGHTWEIGHT BY DESIGN. This is on the homepage's critical path, so it returns
 * company identity, logo and job COUNT only. It runs no ATS, scores no jobs and
 * never reads the job corpus — `getHiringCompanies()` is a cached, ~3 KB
 * database projection of employer names, not the 2.7 MB job document.
 *
 * Matching happens when a visitor picks a company, in the per-company route.
 *
 * Public and identical for every visitor: no session is read, so the response
 * carries nothing user-specific and can be cached by anyone.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getHomepageConfig } from '@/lib/server/homepage-config';
import { getHiringCompanies } from '@/lib/server/hiring-companies';
import { buildCompanyExplorerTiles } from '@/lib/company-explorer';
import { TTL, cached } from '@/lib/server/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    /* Whether to SHOW the Manage control — never whether the caller may use it.
       The admin route re-checks the session on every write, so a forged `true`
       here buys nothing but a button that returns 401.

       Computed OUTSIDE the cached block on purpose: the company list is public
       and identical for everyone, so it stays shareable, while this one boolean
       varies per viewer and must never enter the cache key or the payload. */
    const canManage = await getSuperAdminSessionFromRequest(req)
      .then((s) => s.valid)
      .catch(() => false);

    const payload = await cached(
      { ns: 'jobs:public', kind: 'company-explorer', params: {}, ttlSeconds: TTL.publicList },
      async () => {
        /* Independent reads: the config and the employer list have nothing to
           do with each other. */
        const [config, live] = await Promise.all([
          getHomepageConfig(),
          getHiringCompanies().catch(() => []),
        ]);
        return { companies: buildCompanyExplorerTiles(config.companyExplorer, live) };
      },
    );
    return NextResponse.json({ ...payload, canManage });
  } catch {
    /* An empty strip is a survivable homepage; an exception is not. */
    return NextResponse.json({ companies: [], canManage: false });
  }
}
