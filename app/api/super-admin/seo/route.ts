/**
 * GET/PUT /api/super-admin/seo — the SEO Manager's settings.
 *
 * Guarded exactly like the other 47 admin routes: `getSuperAdminSessionFromRequest`
 * decides from the server-side session, never from anything in the request body.
 * There is no userId/role/adminId field here to trust.
 *
 * Validation is server-side (lib/server/seo-settings.ts). A client that skips
 * the form's own limits still cannot store a value the public site would then
 * emit into a <meta> tag — which is the whole risk of an editable-metadata
 * feature.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getPublicAppBaseUrl } from '@/lib/url';
import {
  getSeoSettings, saveSeoSettings, validateSeoSettings, resolveSeo,
  DEFAULT_SEO_SETTINGS, TITLE_MAX, DESCRIPTION_MAX,
} from '@/lib/server/seo-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  return session.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;
  try {
    const settings = await getSeoSettings();
    return NextResponse.json({
      settings,
      defaults: DEFAULT_SEO_SETTINGS,
      /* Read-only in the UI: the canonical host is deployment configuration.
         Every sitemap URL, every canonical tag and robots.txt derive from it,
         so it is not something a form should be able to repoint. */
      canonicalBaseUrl: getPublicAppBaseUrl(),
      resolved: resolveSeo(settings),
      limits: { titleMax: TITLE_MAX, descriptionMax: DESCRIPTION_MAX },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load SEO settings.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;
  try {
    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }

    const current = await getSeoSettings();
    const { settings, errors } = validateSeoSettings(body, current);
    if (errors.length) {
      /* Rejected outright rather than saved-with-corrections: an admin who
         typed a bad image URL should be told, not silently overruled. */
      return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });
    }

    await saveSeoSettings(settings);
    return NextResponse.json({ settings, resolved: resolveSeo(settings), saved: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save SEO settings.' }, { status: 500 });
  }
}
