/**
 * Company logo upload — Super Admin only.
 *
 * ═══ AUTHORIZATION IS DECIDED HERE ═══
 *
 * On the server, on every request, from the session cookie — via the same
 * `getSuperAdminSessionFromRequest` the rest of the Super Admin API uses.
 * NOTHING is trusted from the body: there is no userId, no role and no admin
 * flag in the payload, and sending one changes nothing. The acting admin's
 * identity for the audit record comes from `session.email`.
 *
 * ═══ ORDER OF OPERATIONS, AND WHY ═══
 *
 *   validate → detect real format → sanitise SVG → upload NEW object
 *            → persist metadata → invalidate caches → delete OLD object
 *
 * The previous logo is deleted LAST, and only once the new one is stored and
 * the write has succeeded. Any earlier and a failed save would leave the
 * company with a record pointing at an object that no longer exists — a broken
 * image on every page that shows that company. If the metadata write fails
 * after the upload, the new object is removed on a best-effort basis and the
 * old logo is left exactly as it was.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  appendSuperAdminAudit, getSuperAdminSessionFromRequest,
} from '@/lib/server/super-admin-auth';
import { getHomepageConfig, saveHomepageConfig } from '@/lib/server/homepage-config';
import { getHiringCompanies } from '@/lib/server/hiring-companies';
import { logoKey } from '@/lib/company-logos';
import {
  companyLogoStoragePath, validateCompanyLogoUpload, type CompanyLogoOverride,
} from '@/lib/company-logo-uploads';
import { prepareCompanyLogo } from '@/lib/server/company-logo-upload';
import { deleteFromR2, isR2Configured, uploadToR2 } from '@/lib/server/r2';
import { invalidateCompanyLogo } from '@/lib/server/company-logo-resolver';
import { invalidateNamespaces } from '@/lib/server/cache';

export const dynamic = 'force-dynamic';

/**
 * Whether this company exists in DoCrud.
 *
 * A logo may only be attached to a company the platform already knows about,
 * so an upload can never bring a new company into being as a side effect. The
 * configured Company Explorer entries and the live hiring companies are both
 * accepted — between them they are every company the product displays.
 */
async function findCompany(id: string): Promise<{ id: string; name: string } | null> {
  if (!id) return null;
  const [config, live] = await Promise.all([
    getHomepageConfig(),
    getHiringCompanies().catch(() => [] as Array<{ name: string }>),
  ]);
  const configured = config.companyExplorer.items.find((i) => logoKey(i.id) === id || logoKey(i.name) === id);
  if (configured) return { id, name: configured.name };
  const hiring = live.find((c) => logoKey(c.name) === id);
  if (hiring) return { id, name: hiring.name };
  /* Already has an uploaded mark: replacing it must keep working even if the
     company has since dropped out of the live hiring list. */
  const existing = config.companyLogos?.[id];
  if (existing) return { id, name: existing.name };
  return null;
}

/** Everything a client may know about a stored logo. Never a storage secret. */
function publicView(entry: CompanyLogoOverride) {
  return {
    id: entry.id, name: entry.name, url: entry.url,
    format: entry.format, updatedAt: entry.updatedAt, updatedBy: entry.updatedBy,
    source: 'super_admin_upload' as const,
  };
}

/** The uploaded marks, for the Super Admin list. */
export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getHomepageConfig();
  return NextResponse.json({
    logos: Object.values(config.companyLogos ?? {}).map(publicView),
    storageReady: isR2Configured(),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid || !session.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'That upload could not be read.' }, { status: 400 });

  /* The company is identified by id, never by the file's name. */
  const id = logoKey(String(form.get('companyId') ?? ''));
  const company = await findCompany(id);
  if (!company) {
    return NextResponse.json({ error: 'That company was not found.' }, { status: 404 });
  }

  const files = form.getAll('logo').filter((f): f is File => f instanceof File);
  if (files.length > 1) {
    return NextResponse.json({ error: 'Upload one logo file, not several.' }, { status: 400 });
  }
  const file = files[0] ?? null;

  const rejection = validateCompanyLogoUpload(
    file ? { name: file.name, size: file.size, type: file.type } : null,
    files.length || 1,
  );
  if (rejection) return NextResponse.json({ error: rejection.message }, { status: 400 });

  if (!isR2Configured()) {
    /* Said plainly rather than pretending to succeed. */
    return NextResponse.json(
      { error: 'Object storage is not configured, so the logo cannot be stored.' },
      { status: 503 },
    );
  }

  const buf = Buffer.from(await (file as File).arrayBuffer());
  const prepared = await prepareCompanyLogo(buf);
  if (!prepared.ok) return NextResponse.json({ error: prepared.message }, { status: 400 });

  const config = await getHomepageConfig();
  const previous = config.companyLogos?.[id] ?? null;

  /* A new revision every time, so the URL changes when the logo changes and a
     cached copy of the old one can never be served in its place. */
  const revision = Date.now();
  const storagePath = companyLogoStoragePath(id, prepared.format, revision);

  let url: string;
  try {
    /* skipCompress: an SVG is text and must not be run through the raster
       compressor, and a logo is already small enough that re-encoding it would
       only cost fidelity on flat colour and sharp edges. */
    url = await uploadToR2(storagePath, prepared.body, prepared.contentType, { skipCompress: true });
  } catch (err) {
    console.error('[company-logo] storage upload failed', err);
    return NextResponse.json({ error: 'The logo could not be stored. Nothing was changed.' }, { status: 502 });
  }

  const entry: CompanyLogoOverride = {
    id, name: company.name, url, format: prepared.format,
    storagePath, updatedAt: new Date().toISOString(), updatedBy: session.email,
  };

  try {
    await saveHomepageConfig({ companyLogos: { ...(config.companyLogos ?? {}), [id]: entry } });
  } catch (err) {
    console.error('[company-logo] metadata save failed, rolling back upload', err);
    /* The new object is orphaned — remove it. The PREVIOUS logo is untouched,
       so the company still displays exactly what it did before. */
    await deleteFromR2(storagePath).catch((cleanupErr) => {
      console.error('[company-logo] ORPHANED OBJECT, needs manual cleanup:', storagePath, cleanupErr);
    });
    return NextResponse.json({ error: 'The logo could not be saved. Nothing was changed.' }, { status: 500 });
  }

  /* Only now is the old object safe to remove, and a failure here is logged
     rather than reported as an error: the new logo IS live. */
  invalidateCompanyLogo(company.name);
  invalidateCompanyLogo(id);
  await invalidateNamespaces(['jobs:public']).catch(() => {});

  if (previous?.storagePath && previous.storagePath !== storagePath) {
    await deleteFromR2(previous.storagePath).catch((err) => {
      console.error('[company-logo] old object left behind:', previous.storagePath, err);
    });
  }

  await appendSuperAdminAudit({
    action: previous ? 'company.logo.replace' : 'company.logo.upload',
    targetType: 'company_logo',
    targetId: id,
    /* Identifiers, formats and paths only — never the image bytes, and never
       a storage credential. */
    details: {
      actor: session.email || 'super-admin',
      company: company.name,
      format: prepared.format,
      storagePath,
      ...(previous ? { replacedFormat: previous.format, replacedPath: previous.storagePath } : {}),
    },
  }).catch(() => {});

  return NextResponse.json({ logo: publicView(entry) });
}

/**
 * Remove an uploaded mark.
 *
 * The company is untouched. With the override gone, the resolver falls back
 * through its remaining steps — verified registry, source, configured website
 * — and finally to initials, so the company never shows a broken image.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid || !session.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { companyId?: unknown };
  const id = logoKey(String(body.companyId ?? ''));
  if (!id) return NextResponse.json({ error: 'A company id is required.' }, { status: 400 });

  const config = await getHomepageConfig();
  const existing = config.companyLogos?.[id];
  if (!existing) return NextResponse.json({ error: 'That company has no uploaded logo.' }, { status: 404 });

  /* The record is cleared FIRST: once it is gone the company renders its
     fallback, and an object that outlives its record is harmless. The reverse
     order would leave a record pointing at a deleted file. */
  const next = { ...(config.companyLogos ?? {}) };
  delete next[id];
  await saveHomepageConfig({ companyLogos: next });

  invalidateCompanyLogo(existing.name);
  invalidateCompanyLogo(id);
  await invalidateNamespaces(['jobs:public']).catch(() => {});

  if (existing.storagePath) {
    await deleteFromR2(existing.storagePath).catch((err) => {
      console.error('[company-logo] object left behind after removal:', existing.storagePath, err);
    });
  }

  await appendSuperAdminAudit({
    action: 'company.logo.remove',
    targetType: 'company_logo',
    targetId: id,
    details: {
      actor: session.email || 'super-admin',
      company: existing.name,
      removedFormat: existing.format,
      removedPath: existing.storagePath,
    },
  }).catch(() => {});

  return NextResponse.json({ removed: id });
}
