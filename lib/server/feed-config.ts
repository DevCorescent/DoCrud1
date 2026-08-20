/**
 * Persistent feed / recommendation configuration.
 *
 * Every weight, gap and toggle the composition engine and the recommendation
 * ranker use is read from here rather than from hard-coded constants, so
 * Superadmin can change behaviour without a deploy. Missing keys fall back to
 * the defaults below, which is also what a fresh install runs on.
 */

import { readJsonFile, writeJsonFile, feedConfigPath } from '@/lib/server/storage';

export type PeopleRecoConfig = {
  enabled: boolean;
  maxCards: number;
  /** Ranking weights. */
  mutualWeight: number;
  interestWeight: number;
  skillWeight: number;
  domainWeight: number;
  locationWeight: number;
  /** Backfill the card list with low-signal candidates when ranking runs short. */
  discoveryEnabled: boolean;
};

export type JobRecoConfig = {
  enabled: boolean;
  maxCards: number;
  domainWeight: number;
  skillWeight: number;
  locationWeight: number;
  recencyWeight: number;
};

export type AdsConfig = {
  enabled: boolean;
  /** Minimum / maximum posts between two sponsored slots. */
  minGap: number;
  maxGap: number;
  maxPerFeed: number;
  /** When false, targeting is ignored and any active ad is eligible. */
  targetingEnabled: boolean;
};

export type FeedCompositionConfig = {
  /** Posts before the first module may appear. */
  minLeadPosts: number;
  /** Minimum posts between any two modules. */
  minModuleGap: number;
  maxModulesPerPage: number;
};

export type PublicationConfig = {
  /** Maximum characters allowed in a publication body. */
  maxChars: number;
};

export type FeedConfig = {
  people: PeopleRecoConfig;
  jobs: JobRecoConfig;
  ads: AdsConfig;
  composition: FeedCompositionConfig;
  publication: PublicationConfig;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_FEED_CONFIG: FeedConfig = {
  people: { enabled: true, maxCards: 12, mutualWeight: 100, interestWeight: 20, skillWeight: 12, domainWeight: 8, locationWeight: 5, discoveryEnabled: true },
  jobs:   { enabled: true, maxCards: 6, domainWeight: 10, skillWeight: 8, locationWeight: 4, recencyWeight: 1 },
  ads:    { enabled: true, minGap: 5, maxGap: 15, maxPerFeed: 2, targetingEnabled: true },
  composition: { minLeadPosts: 2, minModuleGap: 3, maxModulesPerPage: 3 },
  publication: { maxChars: 500 },
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Merge stored values over the defaults, clamping anything out of range. */
export function normalizeFeedConfig(raw: unknown): FeedConfig {
  const r = (raw ?? {}) as Partial<FeedConfig>;
  const d = DEFAULT_FEED_CONFIG;
  return {
    people: {
      enabled: bool(r.people?.enabled, d.people.enabled),
      maxCards: num(r.people?.maxCards, d.people.maxCards, 1, 30),
      mutualWeight: num(r.people?.mutualWeight, d.people.mutualWeight, 0, 1000),
      skillWeight: num(r.people?.skillWeight, d.people.skillWeight, 0, 1000),
      domainWeight: num(r.people?.domainWeight, d.people.domainWeight, 0, 1000),
      locationWeight: num(r.people?.locationWeight, d.people.locationWeight, 0, 1000),
      interestWeight: num(r.people?.interestWeight, d.people.interestWeight, 0, 1000),
      discoveryEnabled: bool(r.people?.discoveryEnabled, d.people.discoveryEnabled),
    },
    jobs: {
      enabled: bool(r.jobs?.enabled, d.jobs.enabled),
      maxCards: num(r.jobs?.maxCards, d.jobs.maxCards, 1, 20),
      domainWeight: num(r.jobs?.domainWeight, d.jobs.domainWeight, 0, 1000),
      skillWeight: num(r.jobs?.skillWeight, d.jobs.skillWeight, 0, 1000),
      locationWeight: num(r.jobs?.locationWeight, d.jobs.locationWeight, 0, 1000),
      recencyWeight: num(r.jobs?.recencyWeight, d.jobs.recencyWeight, 0, 1000),
    },
    ads: {
      enabled: bool(r.ads?.enabled, d.ads.enabled),
      minGap: num(r.ads?.minGap, d.ads.minGap, 1, 50),
      maxGap: num(r.ads?.maxGap, d.ads.maxGap, 2, 100),
      maxPerFeed: num(r.ads?.maxPerFeed, d.ads.maxPerFeed, 0, 10),
      targetingEnabled: bool(r.ads?.targetingEnabled, d.ads.targetingEnabled),
    },
    composition: {
      minLeadPosts: num(r.composition?.minLeadPosts, d.composition.minLeadPosts, 0, 20),
      minModuleGap: num(r.composition?.minModuleGap, d.composition.minModuleGap, 1, 20),
      maxModulesPerPage: num(r.composition?.maxModulesPerPage, d.composition.maxModulesPerPage, 0, 10),
    },
    publication: {
      /* Bounded so a mistyped value cannot disable the limit or make the
         composer unusable. */
      maxChars: num(r.publication?.maxChars, d.publication.maxChars, 50, 10_000),
    },
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
    updatedBy: typeof r.updatedBy === 'string' ? r.updatedBy : undefined,
  };
}

export async function getFeedConfig(): Promise<FeedConfig> {
  const raw = await readJsonFile<unknown>(feedConfigPath, {});
  return normalizeFeedConfig(raw);
}

export async function saveFeedConfig(patch: unknown, updatedBy: string): Promise<FeedConfig> {
  const current = await getFeedConfig();
  const merged = normalizeFeedConfig({
    ...current,
    ...(patch as object),
    people: { ...current.people, ...((patch as FeedConfig)?.people ?? {}) },
    publication: { ...current.publication, ...((patch as FeedConfig)?.publication ?? {}) },
    jobs: { ...current.jobs, ...((patch as FeedConfig)?.jobs ?? {}) },
    ads: { ...current.ads, ...((patch as FeedConfig)?.ads ?? {}) },
    composition: { ...current.composition, ...((patch as FeedConfig)?.composition ?? {}) },
  });
  merged.updatedAt = new Date().toISOString();
  merged.updatedBy = updatedBy;
  await writeJsonFile(feedConfigPath, merged);
  return merged;
}
