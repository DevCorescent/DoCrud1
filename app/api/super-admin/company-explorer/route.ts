/**
 * Company Explorer configuration — Super Admin only.
 *
 * AUTHORIZATION IS DECIDED HERE, ON THE SERVER, on every request. Nothing is
 * trusted from the client: there is no admin flag in the body, and the browser
 * never sends anything that grants itself access. A caller without a valid
 * super-admin session is refused before any config is read or written.
 *
 * The write is an ALLOW-LIST: only `items` is taken from the body, and each
 * entry is reduced to id / name / order / visible. A spread-then-delete would
 * quietly persist whatever field a future client happened to send.
 */
import { NextRequest, NextResponse } from 'next/server';
import { appendSuperAdminAudit, getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getHomepageConfig, saveHomepageConfig } from '@/lib/server/homepage-config';
import { getHiringCompanies } from '@/lib/server/hiring-companies';
import {
  availableCompanies, normalizeCompanyExplorerConfig, type CompanyExplorerEntry,
} from '@/lib/company-explorer';
import { logoKey } from '@/lib/company-logos';
import { invalidateNamespaces } from '@/lib/server/cache';
import { invalidateCompanyLogo } from '@/lib/server/company-logo-resolver';

export const dynamic = 'force-dynamic';

/** The configured list plus every company that could be added. */
export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [config, live] = await Promise.all([
    getHomepageConfig(),
    getHiringCompanies().catch(() => []),
  ]);
  return NextResponse.json({
    items: config.companyExplorer.items,
    available: availableCompanies(config.companyExplorer, live),
  });
}

/**
 * Replace the configured list — order, visibility and membership in one write.
 *
 * The whole list is sent rather than a diff because reordering IS the common
 * operation, and a positional diff would be ambiguous the moment two admins
 * edit at once. Last write wins, which is the right semantic for a curated
 * display list.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: unknown };
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Expected an items array.' }, { status: 400 });
  }

  /* ALLOW-LIST. Four fields, nothing else, whatever the body contained. */
  /* Read first: provenance must only move when a VALUE actually changes.
     Stamping on every save would mean reordering the strip re-dated every
     company's metadata as though a human had just reviewed it — provenance
     that records the wrong event is worse than none. */
  const existing = await getHomepageConfig();
  const priorMeta = new Map(existing.companyExplorer.items.map((i) => [
    i.id,
    { industry: i.industry ?? '', headquarters: i.headquarters ?? '',
      at: i.metadataUpdatedAt, by: i.metadataUpdatedBy },
  ]));

  const items: CompanyExplorerEntry[] = [];
  body.items.forEach((raw, index) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    const id = logoKey(String(e.id ?? '') || String(e.name ?? ''));
    if (!id) return;
    const website = String(e.websiteUrl ?? '').trim();
    /* Operator-typed metadata. Named explicitly, like every other field here:
       the allow-list is what stops a client adding properties nobody vetted,
       so a new field has to be added on purpose rather than arriving by
       spread. Length caps match the normalizer's. */
    const industry = String(e.industry ?? '').trim().slice(0, 80);
    const headquarters = String(e.headquarters ?? '').trim().slice(0, 120);

    items.push({
      id,
      name: String(e.name ?? '').trim() || id,
      /* Still an ALLOW-LIST: only an absolute http(s) URL is accepted, and it
         is stored as given. A domain is never derived from the company name. */
      ...(/^https?:\/\/[^\s]+$/i.test(website) ? { websiteUrl: website } : {}),
      /* Position comes from the ARRAY, not from a client-supplied number — a
         body with duplicate or missing orders still produces a clean sequence. */
      order: index,
      visible: e.visible !== false,
      /* Blank clears the field rather than storing an empty string, so an
         operator can remove a value they no longer stand behind. */
      ...(industry ? { industry } : {}),
      ...(headquarters ? { headquarters } : {}),
      /* Provenance is SERVER-SET. A client-supplied timestamp or author would
         let the caller claim a human verified something they did not — the
         session is the only trustworthy source for both.

         Re-stamped ONLY when a value actually changed; otherwise the previous
         stamp is carried forward untouched, so an unrelated save (a reorder, a
         visibility toggle) leaves the edit history honest. */
      ...(() => {
        const before = priorMeta.get(id);
        const changed = (before?.industry ?? '') !== industry
          || (before?.headquarters ?? '') !== headquarters;
        if (changed) {
          return industry || headquarters
            ? {
                metadataUpdatedAt: new Date().toISOString(),
                metadataUpdatedBy: session.email || 'super-admin',
              }
            /* Cleared back to nothing: the stamp goes with the values it
               described, rather than claiming an edit to an empty field. */
            : {};
        }
        return {
          ...(before?.at ? { metadataUpdatedAt: before.at } : {}),
          ...(before?.by ? { metadataUpdatedBy: before.by } : {}),
        };
      })(),
    });
  });

  const current = existing;
  /* Normalized again on the way in: duplicates collapse, order is re-numbered. */
  const companyExplorer = normalizeCompanyExplorerConfig({
    ...current.companyExplorer,
    items,
  });
  /* A changed website invalidates ONLY that company's cached resolution — its
     previous answer came from different inputs. Every other company's stays. */
  const before = new Map(current.companyExplorer.items.map((i) => [i.id, i.websiteUrl ?? '']));
  for (const item of companyExplorer.items) {
    if ((item.websiteUrl ?? '') !== (before.get(item.id) ?? '')) {
      invalidateCompanyLogo(item.name || item.id);
    }
  }

  const saved = await saveHomepageConfig({ companyExplorer });

  /* The strip is cached publicly; a config change must be visible at once. */
  await invalidateNamespaces(['jobs:public']).catch(() => {});

  await appendSuperAdminAudit({
    action: 'homepage.companyExplorer',
    targetType: 'homepage_config',
    details: {
      actor: session.email || 'super-admin',
      companies: saved.companyExplorer.items.length,
      visible: saved.companyExplorer.items.filter((i) => i.visible).length,
    },
  }).catch(() => {});

  return NextResponse.json({ items: saved.companyExplorer.items });
}
