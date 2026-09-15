/**
 * The verified board inventory, as the server sees it.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * The Super Admin console counted "Approved sources" from the ENVIRONMENT —
 * `GREENHOUSE_BOARDS`, `LEVER_COMPANIES` and friends — which is the set of
 * boards the scraper will actually fetch. That number is correct, and it is
 * currently 2.
 *
 * Separately, `data/job-sources/verified-boards.txt` holds 87 boards that were
 * each confirmed against their live endpoint. Nothing at runtime read that
 * file, so the console could not distinguish
 *
 *   "we know about 87 boards and 2 are switched on"
 *
 * from
 *
 *   "2 boards exist".
 *
 * Those are very different statements, and the second one is what the screen
 * appeared to say. This module supplies the missing half.
 *
 * ═══ VERIFIED IS NOT ENABLED ═══
 *
 * Reading this file changes NOTHING about what gets scraped. A board listed
 * here and absent from the environment is verified-but-disabled: known to work,
 * deliberately not running. Enabling one remains an explicit configuration act.
 */
import { readFileSync } from 'fs';
import path from 'path';

export interface VerifiedBoard {
  /** Registry sourceId, e.g. "greenhouse:stripe". */
  sourceId: string;
  provider: string;
  slug: string;
  label: string;
  country?: string;
}

const INVENTORY_PATH = path.join(process.cwd(), 'data', 'job-sources', 'verified-boards.txt');

/* Parsed once per process. The file is a deployment artifact that cannot change
   under a running server, and re-reading it on every admin poll would be a
   filesystem hit for a value that never moves. */
let cache: VerifiedBoard[] | null | undefined;

function parse(text: string): VerifiedBoard[] {
  const out: VerifiedBoard[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [provider, slug, label, country] = line.split(/\s{2,}|\t/).map((x) => x.trim());
    if (!provider || !slug) continue;
    out.push({
      sourceId: `${provider}:${slug}`,
      provider,
      slug,
      label: label || slug,
      ...(country ? { country } : {}),
    });
  }
  return out;
}

/**
 * The verified boards, or `null` when the inventory cannot be read.
 *
 * `null` is a deliberate third state, not an empty list. The file is a
 * repository artifact and a deployment that omits it is a real possibility;
 * reporting "0 verified boards" in that case would be a claim the server cannot
 * support, and the console would show a confident zero built on a missing file.
 * `null` lets the caller say nothing instead of saying something false — the
 * same distinction Phase 0 established between "none" and "could not read".
 */
export function getVerifiedInventory(): VerifiedBoard[] | null {
  if (cache !== undefined) return cache;
  try {
    cache = parse(readFileSync(INVENTORY_PATH, 'utf8'));
  } catch {
    cache = null;
  }
  return cache;
}

/** Test seam. Clears the per-process parse so a fixture can be re-read. */
export function resetVerifiedInventoryCache(): void {
  cache = undefined;
}

export interface InventorySummary {
  /** Boards confirmed against a live endpoint. `null` when unreadable. */
  verified: number | null;
  /** Verified boards NOT present in the current environment. */
  verifiedNotEnabled: number | null;
}

/**
 * Compare the inventory against what is actually switched on.
 *
 * `enabledSourceIds` comes from the environment-driven registry — the real
 * answer to "what will this run fetch" — so the two counts can never drift
 * from the thing each describes.
 */
export function summariseInventory(
  enabledSourceIds: readonly string[],
): InventorySummary {
  const inventory = getVerifiedInventory();
  if (!inventory) return { verified: null, verifiedNotEnabled: null };
  const enabled = new Set(enabledSourceIds);
  return {
    verified: inventory.length,
    verifiedNotEnabled: inventory.filter((b) => !enabled.has(b.sourceId)).length,
  };
}

/** Whether one configured source also appears in the verified inventory. */
export function isVerifiedBoard(sourceId: string): boolean {
  const inventory = getVerifiedInventory();
  if (!inventory) return false;
  return inventory.some((b) => b.sourceId === sourceId);
}
