/**
 * Company Explorer — the pure rules.
 *
 * No React, no fetch, no database. Everything the feature decides — which
 * companies appear, in what order, and how a job count is phrased — is decided
 * here so it can be tested directly and cannot drift between the homepage, the
 * Manage panel and the admin API.
 *
 * ═══ IDENTITY ═══
 *
 * A company is identified by `logoKey(name)` — the SAME normalization the logo
 * registry and the hiring-companies grouping already use. That is deliberate:
 * the scraper reports the same employer as "MindTickle", "Mindtickle" and
 * "MINDTICKLE" depending on the board, and keying on the display name would
 * create three companies with a third of the jobs each. It also means this
 * feature introduces NO new company model — it addresses the employers that
 * already exist in the job corpus.
 */
import { getCompanyLogo, logoKey } from '@/lib/company-logos';

/* ── Config ───────────────────────────────────────────────────────────────*/

/**
 * One configured company. Stored by Super Admin.
 *
 * `id` is the logoKey, never the display name — a company renamed at the source
 * keeps its position and its visibility.
 */
export interface CompanyExplorerEntry {
  id: string;
  /** The name as configured. Display prefers the live one; this is a fallback. */
  name: string;
  /** Lower sorts first. Gaps are fine — order is normalized on read. */
  order: number;
  visible: boolean;
  /**
   * The company's own website, supplied by an operator.
   *
   * OPTIONAL, and never derived. No ATS provider reports a company domain, and
   * `name + ".com"` is a guess — a guess that resolves renders another
   * company's brand mark, which is worse than no logo. When this is set the
   * resolver may look for a favicon at that origin; when it is not, the company
   * shows initials.
   */
  websiteUrl?: string;
}

export interface CompanyExplorerConfig {
  /** Curated entries. An empty list with `autoFromJobs` is a valid setup. */
  items: CompanyExplorerEntry[];
  /**
   * Fill the remainder from employers who actually have live jobs, busiest
   * first. Curated entries always LEAD; this only decides whether the tail is
   * populated automatically.
   */
  autoFromJobs: boolean;
  /** Ceiling on how many tiles the strip shows. */
  maxItems: number;
}

export const DEFAULT_COMPANY_EXPLORER: CompanyExplorerConfig = {
  items: [],
  /* Empty + auto is the useful default: a fresh install shows the employers
     actually hiring rather than an empty strip waiting to be curated. */
  autoFromJobs: true,
  maxItems: 24,
};

/** A live employer, as `getHiringCompanies()` returns them. */
export interface LiveCompany {
  name: string;
  logoUrl: string;
  jobCount: number;
}

/** What the homepage renders. */
export interface CompanyExplorerTile {
  id: string;
  name: string;
  /** '' when we have no verified logo — the card renders initials instead. */
  logoUrl: string;
  /** The REAL count. Never rounded in the data; only the label is. */
  jobCount: number;
  /** True when Super Admin pinned this company rather than it arriving from jobs. */
  pinned: boolean;
}

/* ── Job count display ────────────────────────────────────────────────────*/

/**
 * The count to DISPLAY, rounded DOWN to the nearest five.
 *
 * Down, never up or nearest: a badge must never promise more roles than exist.
 * 27 shows as 25, 43 as 40, 19 as 15. The stored count is untouched — this is
 * a presentation rule and nothing persists its output.
 */
export function getCompanyJobDisplayCount(actualCount: unknown): number {
  const n = Math.floor(Number(actualCount));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / 5) * 5;
}

/**
 * The badge text.
 *
 * Below five the rounded value is 0, and "0+ jobs" on a company that is
 * actively hiring reads as a bug rather than a rounding rule — so under five
 * the exact number is shown, which is both shorter and true. At five and above
 * the "N+" form takes over.
 */
export function formatCompanyJobCount(actualCount: unknown): string {
  const n = Math.floor(Number(actualCount));
  if (!Number.isFinite(n) || n <= 0) return 'No open jobs';
  const rounded = getCompanyJobDisplayCount(n);
  if (rounded === 0) return n === 1 ? '1 job' : `${n} jobs`;
  return `${rounded}+ jobs`;
}

/* ── Config normalization ─────────────────────────────────────────────────*/

/**
 * Coerce stored JSON into a valid config.
 *
 * Anything unrecognised is dropped rather than trusted: this value comes back
 * from storage written by an older build or an admin request, and a malformed
 * entry must not be able to break the homepage. Duplicate ids collapse to the
 * FIRST occurrence, so a double-add cannot produce two tiles for one employer.
 */
export function normalizeCompanyExplorerConfig(raw: unknown): CompanyExplorerConfig {
  const src = (raw ?? {}) as Partial<CompanyExplorerConfig>;
  const seen = new Set<string>();
  const items: CompanyExplorerEntry[] = [];

  for (const entry of Array.isArray(src.items) ? src.items : []) {
    const e = (entry ?? {}) as Partial<CompanyExplorerEntry>;
    /* The id is re-derived from the name when absent or malformed, so an entry
       written by hand still resolves to the same company as the scraper's. */
    const id = logoKey(String(e.id ?? '') || String(e.name ?? ''));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const website = String(e.websiteUrl ?? '').trim();
    items.push({
      id,
      name: String(e.name ?? '').trim() || id,
      /* Stored only when it is a usable absolute http(s) URL. A half-typed
         value is dropped rather than persisted for the resolver to reject
         later. */
      ...(/^https?:\/\/[^\s]+$/i.test(website) ? { websiteUrl: website } : {}),
      order: Number.isFinite(Number(e.order)) ? Number(e.order) : items.length,
      /* Absent means visible: a config written before this field existed should
         show its companies, not silently hide them all. */
      visible: e.visible !== false,
    });
  }

  items.sort((a, b) => a.order - b.order);
  /* Re-numbered densely, so a saved order never contains gaps or collisions. */
  items.forEach((item, i) => { item.order = i; });

  const max = Math.floor(Number(src.maxItems));
  return {
    items,
    autoFromJobs: src.autoFromJobs !== false,
    maxItems: Number.isFinite(max) && max > 0 ? Math.min(60, max) : DEFAULT_COMPANY_EXPLORER.maxItems,
  };
}

/* ── Ordering ─────────────────────────────────────────────────────────────*/

/**
 * Move a company to a new position and re-number everything densely.
 *
 * Returns a NEW list; the input is not mutated. An unknown id or an
 * out-of-range index returns the list unchanged rather than throwing — a stale
 * drag from a client that has since been reconfigured must not 500.
 */
export function reorderCompanyExplorerCompanies(
  items: readonly CompanyExplorerEntry[],
  id: string,
  toIndex: number,
): CompanyExplorerEntry[] {
  const list = [...items].sort((a, b) => a.order - b.order);
  const from = list.findIndex((c) => c.id === id);
  if (from < 0) return list.map((c, i) => ({ ...c, order: i }));

  const target = Math.max(0, Math.min(list.length - 1, Math.floor(toIndex)));
  const [moved] = list.splice(from, 1);
  list.splice(target, 0, moved);
  return list.map((c, i) => ({ ...c, order: i }));
}

/** Apply an explicit id sequence. Ids not present are ignored; missing ones keep their relative order after. */
export function applyCompanyExplorerOrder(
  items: readonly CompanyExplorerEntry[],
  orderedIds: readonly string[],
): CompanyExplorerEntry[] {
  const byId = new Map(items.map((c) => [c.id, c]));
  const out: CompanyExplorerEntry[] = [];
  const used = new Set<string>();
  for (const id of orderedIds) {
    const found = byId.get(id);
    if (found && !used.has(id)) { used.add(id); out.push(found); }
  }
  /* Anything the client did not mention keeps its previous relative order and
     lands after — a partial order must never silently delete entries. */
  for (const c of [...items].sort((a, b) => a.order - b.order)) {
    if (!used.has(c.id)) out.push(c);
  }
  return out.map((c, i) => ({ ...c, order: i }));
}

/* ── Composition ──────────────────────────────────────────────────────────*/

/**
 * The tiles the homepage shows.
 *
 * Curated-and-visible entries lead, in the admin's order. When `autoFromJobs`
 * is on, the remainder is filled with the busiest live employers that are not
 * already present. Hidden entries are excluded from BOTH — hiding a company
 * must not let it reappear through the automatic tail.
 *
 * A curated company with no live jobs still appears, with a count of 0: an
 * admin pinned it deliberately, and silently dropping it would look like the
 * setting failed to save.
 */
export function buildCompanyExplorerTiles(
  config: CompanyExplorerConfig,
  live: readonly LiveCompany[],
): CompanyExplorerTile[] {
  const liveById = new Map<string, LiveCompany>();
  for (const c of live) {
    const id = logoKey(c.name);
    if (!id) continue;
    const existing = liveById.get(id);
    /* Two spellings of one employer merge, counts added — the same rule
       getHiringCompanies uses, applied again in case a caller passes raw rows. */
    if (existing) existing.jobCount += c.jobCount;
    else liveById.set(id, { ...c });
  }

  const hidden = new Set(config.items.filter((i) => !i.visible).map((i) => i.id));
  const tiles: CompanyExplorerTile[] = [];
  const placed = new Set<string>();

  for (const entry of [...config.items].sort((a, b) => a.order - b.order)) {
    if (!entry.visible || placed.has(entry.id)) continue;
    const match = liveById.get(entry.id);
    const logo = getCompanyLogo(match?.name ?? entry.name);
    placed.add(entry.id);
    tiles.push({
      id: entry.id,
      name: logo?.name ?? match?.name ?? entry.name,
      logoUrl: match?.logoUrl || logo?.src || '',
      jobCount: match?.jobCount ?? 0,
      pinned: true,
    });
  }

  if (config.autoFromJobs) {
    /* Does this company have a mark to show? Computed exactly the way the tile
       below resolves `logoUrl`, so the ordering can never disagree with what
       actually renders. */
    const hasLogo = (c: LiveCompany) => Boolean(c.logoUrl || getCompanyLogo(c.name)?.src);

    const rest = Array.from(liveById.entries())
      .filter(([id]) => !placed.has(id) && !hidden.has(id))
      /* Companies WITH a logo lead: a row of marks reads as a row of employers,
         while a run of monograms reads as a loading state. Then busiest, then
         name — a stable order, never insertion order.

         This orders only the AUTOMATIC tail. Anything a super admin pinned was
         already placed above by its own `order`, so admin intent still wins and
         is never re-sorted by this rule. */
      .sort((a, b) =>
        Number(hasLogo(b[1])) - Number(hasLogo(a[1]))
        || b[1].jobCount - a[1].jobCount
        || a[1].name.localeCompare(b[1].name));
    for (const [id, c] of rest) {
      if (tiles.length >= config.maxItems) break;
      const logo = getCompanyLogo(c.name);
      tiles.push({
        id,
        name: logo?.name ?? c.name,
        logoUrl: c.logoUrl || logo?.src || '',
        jobCount: c.jobCount,
        pinned: false,
      });
    }
  }

  return tiles.slice(0, config.maxItems);
}

/** Every company available to configure — live employers plus anything pinned. */
export function availableCompanies(
  config: CompanyExplorerConfig,
  live: readonly LiveCompany[],
): CompanyExplorerTile[] {
  const all = buildCompanyExplorerTiles(
    { ...config, items: config.items.map((i) => ({ ...i, visible: true })), autoFromJobs: true, maxItems: 500 },
    live,
  );
  return all;
}

/** Whether this company is already configured. Prevents a duplicate add. */
export function isCompanyConfigured(config: CompanyExplorerConfig, name: string): boolean {
  const id = logoKey(name);
  return Boolean(id) && config.items.some((i) => i.id === id);
}

/** The route for one company's jobs. */
export function companyJobsHref(id: string): string {
  return `/jobs/company/${encodeURIComponent(id)}`;
}
