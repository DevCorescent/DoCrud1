/**
 * Recommendation features, derived once per corpus version.
 *
 * ═══ THE COST THIS MOVES ═══
 *
 * Ranking scores every published posting for every viewer, and the most
 * expensive step inside it is `skillsInText(description)` — 426 us per posting
 * against 13 us for the scoring loop itself, measured over 12,659 jobs. It was
 * paid on every ranking pass, per viewer, per cache miss.
 *
 * The answer depends ONLY on the description text, so it is computed once for
 * a corpus snapshot and reused by every ranking pass over that snapshot.
 *
 * ═══ WHY STALENESS IS UNREPRESENTABLE, NOT MERELY CHECKED ═══
 *
 * The features are derived FROM the array `getPublishedHiringJobs()` returns,
 * and keyed by the version that array carries. The description that produced a
 * feature is therefore the description in the snapshot being ranked — there is
 * no path that pairs a new description with an old `_recSkills`, because the
 * two are read from the same object. A version change does not invalidate a
 * stored value; it derives from a different array.
 *
 * ═══ MEMORY ═══
 *
 * This is NOT a second corpus. It holds two derived values per posting —
 * skills are surface forms from a fixed 160-entry taxonomy, so they are shared
 * references rather than fresh strings — and no description text at all.
 * Measured: ~0.3 MB serialised, ~8.8 MB live, against 52.3 MB of descriptions.
 */
import { skillsInText } from '@/lib/server/ats/skills-in-text';
import { extractRequiredYears } from '@/lib/server/ats/text';
import { registerRecommendationCache } from '@/lib/server/recommendation-cache';

export interface RecFeatures {
  skills: readonly string[];
  years: number | null;
}

/** The one derivation. Both the live scorer and this cache call the same scan. */
export function deriveRecFeatures(description: unknown): RecFeatures {
  const text = String(description ?? '');
  if (!text) return { skills: [], years: null };
  return { skills: skillsInText(text), years: extractRequiredYears(text) };
}

interface FeatureSet {
  version: string;
  byId: Map<string, RecFeatures>;
}

let current: FeatureSet | null = null;
let building: Promise<FeatureSet> | null = null;

/* The version key already makes a stale set unreachable — a job write moves the
   corpus version, and a different version derives a different set. This is
   belt-and-braces: a write drops the held set outright, so the memory goes too
   rather than waiting for the next ranking to replace it. */
registerRecommendationCache({ clear: () => clearRecFeatures() });

/** Dropped wholesale when the job corpus changes — see recommendation-cache.ts. */
export function clearRecFeatures(): void {
  current = null;
  building = null;
}

/**
 * Postings derived between two yields to the event loop.
 *
 * Deriving the full corpus is ~8.8 s of CPU (measured: 12,659 postings). Done
 * in one synchronous loop that stalled EVERY request on the worker for the
 * duration — including the ones that only wanted a cached answer. Yielding
 * every slice lets those requests interleave; the derived set is identical,
 * because each posting's features depend on nothing but its own description.
 */
const BUILD_SLICE = 250;
const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

async function build(version: string, jobs: ReadonlyArray<Record<string, unknown>>): Promise<FeatureSet> {
  const byId = new Map<string, RecFeatures>();
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const id = String(job.id ?? '');
    if (id) byId.set(id, deriveRecFeatures(job.description));
    if ((i + 1) % BUILD_SLICE === 0) await yieldToLoop();
  }
  return { version, byId };
}

/**
 * Features for this snapshot, deriving them if this version has not been seen.
 *
 * Single-flighted: concurrent rankings on a cold cache share one derivation
 * rather than each running a 5.4 s pass. A failed derivation leaves the
 * previous set in place — callers fall back to scanning descriptions inline,
 * which is the behaviour that predates this module, never to empty features.
 */
export async function recFeaturesFor(
  version: string | null,
  jobs: ReadonlyArray<Record<string, unknown>>,
): Promise<Map<string, RecFeatures> | null> {
  /* Without a version there is nothing to key on, and reusing a set across an
     unknown corpus is the one thing this must never do. */
  if (!version) return null;
  if (current && current.version === version) return current.byId;

  if (!building) {
    building = Promise.resolve()
      .then(() => build(version, jobs))
      .then((set) => { current = set; return set; })
      .finally(() => { building = null; });
  }
  const set = await building.catch(() => null);
  return set && set.version === version ? set.byId : null;
}

/** Test seam: what is held right now. */
export function recFeaturesState(): { version: string | null; size: number } {
  return { version: current?.version ?? null, size: current?.byId.size ?? 0 };
}
