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
import { revalidateTag, revalidatePath } from 'next/cache';
import {
  getSeoSettings, validateSeoSettings, resolveSeo,
  getSeoDraftState, saveSeoDraft, publishSeoDraft, discardSeoDraft,
  DEFAULT_SEO_SETTINGS, TITLE_MAX, DESCRIPTION_MAX,
} from '@/lib/server/seo-settings';
import { SEO_CACHE_TAG, SEO_REVALIDATE_PATHS } from '@/lib/server/seo-cache';
import { appendSuperAdminAudit } from '@/lib/server/super-admin-auth';

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
    const state = await getSeoDraftState();
    /* The editor works on the DRAFT; `published` is what the public site is
       serving right now, so the UI can show the difference honestly. */
    const settings = state.draft;
    return NextResponse.json({
      settings,
      published: state.published,
      publishedResolved: resolveSeo(state.published),
      hasUnpublishedChanges: state.hasUnpublishedChanges,
      draftUpdatedAt: state.draftUpdatedAt,
      publishedAt: state.publishedAt,
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

    /* Saving stages a draft. It does NOT change what the public site serves —
       publishing is a separate, deliberate action. */
    const state = await saveSeoDraft(settings);
    return NextResponse.json({
      settings: state.draft,
      resolved: resolveSeo(state.draft),
      saved: true,
      published: false,
      hasUnpublishedChanges: state.hasUnpublishedChanges,
      draftUpdatedAt: state.draftUpdatedAt,
      publishedAt: state.publishedAt,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to save SEO settings.' }, { status: 500 });
  }
}


/**
 * POST — publish the draft to production, or discard it.
 *
 * Ordering matters and is deliberate: persist first, confirm the write, and
 * only then invalidate. If the database write fails the cache is left alone,
 * so production keeps serving the last known-good metadata rather than being
 * invalidated toward a value that was never stored.
 *
 * Revalidation success is reported separately from save success. A save that
 * persisted but failed to invalidate is NOT "live", and saying otherwise is
 * the exact lie this endpoint exists to avoid.
 */
export async function POST(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;

  let action = 'publish';
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.action === 'string') action = body.action;
  } catch { /* default action */ }

  try {
    if (action === 'discard') {
      const state = await discardSeoDraft();
      return NextResponse.json({
        ok: true, discarded: true,
        settings: state.draft, hasUnpublishedChanges: state.hasUnpublishedChanges,
      });
    }

    if (action !== 'publish') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const before = await getSeoSettings();
    const state = await getSeoDraftState();

    /* 1. Persist. */
    let publishedAt: string;
    try {
      publishedAt = await publishSeoDraft(state.draft);
    } catch {
      return NextResponse.json(
        { ok: false, saved: false, error: 'Could not save. Production SEO is unchanged.' },
        { status: 500 },
      );
    }

    /* 2. Invalidate, across instances. Reported separately from the save. */
    let revalidated = true;
    let revalidationError = '';
    try {
      revalidateTag(SEO_CACHE_TAG);
      for (const p of SEO_REVALIDATE_PATHS) revalidatePath(p, 'page');
    } catch (err) {
      revalidated = false;
      revalidationError = err instanceof Error ? err.message : 'Cache refresh failed.';
    }

    /* Which fields actually changed — useful in the audit trail, and small. */
    const changed = Object.keys(DEFAULT_SEO_SETTINGS).filter((k) => {
      const a = (before as unknown as Record<string, unknown>)[k];
      const b = (state.draft as unknown as Record<string, unknown>)[k];
      return JSON.stringify(a) !== JSON.stringify(b);
    });

    await appendSuperAdminAudit({
      action: 'seo.settings.published',
      targetType: 'seo',
      details: { changedFields: changed, revalidated, publishedAt },
      ip: req.headers.get('x-forwarded-for') || undefined,
    }).catch(() => { /* the audit trail must never fail a publish */ });

    return NextResponse.json({
      ok: true,
      saved: true,
      published: true,
      revalidated,
      revalidationError: revalidated ? undefined : revalidationError,
      publishedAt,
      changedFields: changed,
      settings: state.draft,
      resolved: resolveSeo(state.draft),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to publish SEO settings.' }, { status: 500 });
  }
}
