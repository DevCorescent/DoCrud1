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
  const items: CompanyExplorerEntry[] = [];
  body.items.forEach((raw, index) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    const id = logoKey(String(e.id ?? '') || String(e.name ?? ''));
    if (!id) return;
    const website = String(e.websiteUrl ?? '').trim();
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
    });
  });

  const current = await getHomepageConfig();
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
