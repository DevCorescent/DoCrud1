/**
 * Feed composition — recommendation and promotional modules are first-class
 * feed items, not fixed homepage sections.
 *
 * Positions are DETERMINISTIC, never Math.random() during render:
 *
 *   slot = f(sessionSeed, moduleKind)
 *
 * The seed is drawn once per browser session, so a module lands in a different
 * place for different users/sessions but never moves while the current feed is
 * open — no jumping, no duplication, and nothing to mismatch on hydration
 * (the homepage renders client-side only).
 *
 * Positions are expressed as an ABSOLUTE post index, so loading another page
 * of posts never shifts an already-rendered module: earlier slots keep the
 * index they were given, and later pages simply expose slots further down.
 */

export type FeedModuleKind = 'people-recommendation' | 'sponsored-ad' | 'job-recommendation';

export type FeedItem<Post> =
  | { type: 'post'; key: string; data: Post }
  | { type: 'people-recommendation'; key: string }
  /* One suggested person, as a card of its own among the posts. */
  | { type: 'person'; key: string; personIndex: number }
  /* One open role, likewise. */
  | { type: 'job'; key: string; jobIndex: number }
  | { type: 'sponsored-ad'; key: string; adIndex: number }
  | { type: 'job-recommendation'; key: string };

/** Stable per browser session. Falls back to a fixed value when storage is unavailable. */
export function getSessionSeed(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const KEY = 'hp_feed_seed';
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) {
      const n = Number(existing);
      if (Number.isFinite(n)) return n;
    }
    const seed = Math.floor(Math.random() * 1_000_000) + 1;
    window.sessionStorage.setItem(KEY, String(seed));
    return seed;
  } catch {
    return 1;
  }
}

/** Small deterministic hash so one seed yields a different slot per module kind. */
function hash(seed: number, salt: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = (Math.imul(h ^ salt.charCodeAt(i), 0x01000193)) >>> 0;
  }
  return h;
}

/** Pick a value in [min, max] deterministically. */
function pick(seed: number, salt: string, min: number, max: number): number {
  if (max <= min) return min;
  return min + (hash(seed, salt) % (max - min + 1));
}

export type ModuleAvailability = {
  people: boolean;
  ads: number;            // how many sponsored items are eligible
  jobs: boolean;
};

export type CompositionOptions = {
  seed: number;
  /** First slot only opens after this many posts, so the feed leads with content. */
  minLeadPosts?: number;
  /** Minimum posts between two modules. */
  minGap?: number;
  /** Hard cap on modules placed in one feed page. */
  maxModules?: number;
};

/**
 * Plan which absolute post index each module follows.
 *
 * Every kind gets at most one placement in the first window; ads may recur
 * further down the feed, spaced by `adEvery`. Exposure control lives here: the
 * people module is planned exactly once per session.
 */
export function planModuleSlots(
  availability: ModuleAvailability,
  opts: CompositionOptions,
): Map<number, { kind: FeedModuleKind; adIndex: number }> {
  const { seed } = opts;
  const lead = opts.minLeadPosts ?? 2;
  const gap = opts.minGap ?? 3;

  const maxModules = opts.maxModules ?? 3;
  const slots = new Map<number, { kind: FeedModuleKind; adIndex: number }>();
  const taken: number[] = [];

  const free = (at: number) => !slots.has(at) && !taken.some((t) => Math.abs(t - at) < gap);

  const claim = (kind: FeedModuleKind, salt: string, min: number, max: number, adIndex = 0) => {
    if (slots.size >= maxModules) return;
    const start = pick(seed, salt, min, max);
    let at = start;
    /* Search outward from the chosen slot rather than only forward, so a
       module is never pushed far past its window when a neighbouring slot is
       already taken. Deterministic and bounded. */
    let found = free(at);
    for (let d = 1; !found && d <= 24; d++) {
      if (free(start + d)) { at = start + d; found = true; break; }
      if (start - d >= min && free(start - d)) { at = start - d; found = true; break; }
    }
    if (!found) return;   // no room in this window; skip rather than pile up
    slots.set(at, { kind, adIndex });
    taken.push(at);
  };

  /* People first — the highest-value module gets the earliest window. */
  if (availability.people) claim('people-recommendation', 'people', lead, lead + 3);
  if (availability.jobs) claim('job-recommendation', 'jobs', lead + 5, lead + 9);

  /* Ads recur, but never adjacent and never more than one per window. */
  for (let i = 0; i < availability.ads; i++) {
    const min = lead + 3 + i * 8;
    claim('sponsored-ad', `ad-${i}`, min, min + 4, i);
  }

  return slots;
}

/**
 * Interleave posts with the planned modules.
 *
 * `posts` is the already-paginated, already-ordered list the feed renders.
 * Post order is never touched — modules are only inserted between them.
 */
/** Posts between one suggested person and the next, once they start. */
const PERSON_STRIDE = 3;

/** …and between one job and the next. Wider: a job asks more of a reader. */
const JOB_STRIDE = 5;

export function composeFeed<Post>(
  posts: Post[],
  keyOf: (p: Post) => string,
  slots: Map<number, { kind: FeedModuleKind; adIndex: number }>,
  /**
   * How many suggested people to scatter through the feed as their own cards.
   *
   * 0 keeps the old behaviour — one `people-recommendation` entry, which the
   * caller renders as the horizontal strip. Above 0, that single entry is
   * replaced by this many `person` entries, one every PERSON_STRIDE posts from
   * where the module would have gone: the people end up among the posts rather
   * than in a block of their own, which is only worth doing where the feed is
   * a grid wide enough to mix them into.
   */
  peopleCount = 0,
  /**
   * How many open roles to scatter through the feed as their own cards.
   *
   * Same contract as `peopleCount`: 0 keeps the single `job-recommendation`
   * entry the caller renders as a carousel, above 0 replaces it with this many
   * `job` entries spread through the posts.
   */
  jobCount = 0,
): Array<FeedItem<Post>> {
  const out: Array<FeedItem<Post>> = [];
  let peopleLeft = 0;
  let nextPerson = 0;
  let sincePerson = 0;
  let jobsLeft = 0;
  let nextJob = 0;
  let sinceJob = 0;

  posts.forEach((post, i) => {
    out.push({ type: 'post', key: keyOf(post), data: post });

    const slot = slots.get(i);
    if (slot) {
      if (slot.kind === 'people-recommendation') {
        if (peopleCount > 0) {
          /* Start the run here; the first card goes in below. */
          peopleLeft = peopleCount;
          sincePerson = PERSON_STRIDE;
        } else {
          out.push({ type: 'people-recommendation', key: `pymk-${i}` });
        }
      } else if (slot.kind === 'job-recommendation') {
        if (jobCount > 0) {
          jobsLeft = jobCount;
          sinceJob = JOB_STRIDE;
        } else {
          out.push({ type: 'job-recommendation', key: `jobs-${i}` });
        }
      } else {
        out.push({ type: 'sponsored-ad', key: `ad-${i}`, adIndex: slot.adIndex });
      }
    }

    if (peopleLeft > 0) {
      sincePerson += 1;
      if (sincePerson >= PERSON_STRIDE) {
        out.push({ type: 'person', key: `person-${nextPerson}`, personIndex: nextPerson });
        nextPerson += 1;
        peopleLeft -= 1;
        sincePerson = 0;
      }
    }

    if (jobsLeft > 0) {
      sinceJob += 1;
      if (sinceJob >= JOB_STRIDE) {
        out.push({ type: 'job', key: `job-${nextJob}`, jobIndex: nextJob });
        nextJob += 1;
        jobsLeft -= 1;
        sinceJob = 0;
      }
    }
  });
  return out;
}
