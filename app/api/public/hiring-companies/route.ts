/**
 * The companies actually hiring on Docrud right now.
 *
 * Feeds the homepage trust marquee, so that row names real employers with live
 * roles instead of a hardcoded list. Derived entirely from published hiring
 * jobs — a company appears here because it has an open posting, and disappears
 * when it does not.
 *
 * The logo is resolved through the same curated registry the job cards use
 * (lib/company-logos.ts). A company with no verified logo returns an empty
 * `logoUrl`, and the marquee renders its name as a wordmark: never a guessed
 * logo, never a broken image.
 */
import { NextResponse } from 'next/server';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { getCompanyLogo, logoKey } from '@/lib/company-logos';

export const dynamic = 'force-dynamic';

/* Public, identical for every visitor, and derived from a job list that only
   changes when someone posts. Holding it briefly means the marquee costs one
   cheap read instead of re-grouping 360 postings on every homepage load. */
let derived: { value: unknown[]; ts: number } | null = null;
const CACHE_TTL = 60_000;

/** Enough to fill a looping row several times over without an unbounded payload. */
const MAX_COMPANIES = 24;

export async function GET() {
  try {
    if (derived && Date.now() - derived.ts < CACHE_TTL) {
      return NextResponse.json({ companies: derived.value }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const jobs = await getPublishedHiringJobs().catch(() => []);

    /* Grouped on the normalized name so "MindTickle" and "Mindtickle" are one
       employer, while the display name keeps the spelling the employer used. */
    const byKey = new Map<string, { name: string; jobCount: number }>();
    for (const job of jobs as Array<{ organizationName?: string }>) {
      const name = (job?.organizationName ?? '').trim();
      if (!name) continue;
      const key = logoKey(name);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) existing.jobCount += 1;
      else byKey.set(key, { name, jobCount: 1 });
    }

    const companies = Array.from(byKey.values())
      .map((c) => {
        const logo = getCompanyLogo(c.name);
        return { name: logo?.name ?? c.name, logoUrl: logo?.src ?? '', jobCount: c.jobCount };
      })
      /* Companies with a verified logo lead the row — it is the more credible
         mark — then the busiest employers, then alphabetically for stability. */
      .sort((a, b) =>
        Number(Boolean(b.logoUrl)) - Number(Boolean(a.logoUrl))
        || b.jobCount - a.jobCount
        || a.name.localeCompare(b.name))
      .slice(0, MAX_COMPANIES);

    derived = { value: companies, ts: Date.now() };
    return NextResponse.json({ companies }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[public/hiring-companies] GET error', error);
    return NextResponse.json({ companies: [] }, { status: 200 });
  }
}
