/**
 * What to ask next, and why.
 *
 * ═══ THE RULE ═══
 *
 * A question is only worth asking if the answer would change the results. A
 * chatbot that asks "what's your budget?" and then ignores it is worse than one
 * that says nothing: it costs the person a turn and teaches them the questions
 * are decoration. So every question here is generated from a gap in what the
 * search engine actually UNDERSTOOD, and every answer is fed back into the
 * query or the type filter — nothing is collected and dropped.
 *
 * ═══ THE OPTIONS COME FROM THE RESULTS ═══
 *
 * Where a question offers choices, they are read out of the results already on
 * screen: the cities those people are actually in, the skills those profiles
 * actually list. That is not decoration either — it means every option leads
 * somewhere. A hardcoded list of cities would happily offer "Chennai" to
 * somebody whose search has no Chennai in it, and answering would empty the
 * screen.
 *
 * ═══ WHEN TO SAY NOTHING ═══
 *
 * When the query already states role, location and seniority, there is nothing
 * useful left to ask and `nextQuestion` returns null. Silence is a valid turn.
 */

export type FacetId = 'intent' | 'location' | 'experience' | 'skill';

export interface Understanding {
  intent?: string;
  roles?: string[];
  skills?: string[];
  locations?: string[];
  locationConstraint?: boolean;
  experience?: string | null;
  entityTypes?: string[];
}

export interface ResultFacts {
  /** Locations present in the current results, most common first. */
  locations: string[];
  /** Skills present in the current results, most common first. */
  skills: string[];
  counts: { person: number; job: number; post: number };
}

export interface Option {
  /** What the person sees. */
  label: string;
  /** Appended to the query, or '' when the answer only changes the filter. */
  append: string;
  /** Narrows which kinds of result are searched. */
  types?: Array<'person' | 'job' | 'post'>;
}

export interface Question {
  id: FacetId;
  /** Written to be read aloud — this is a conversation, not a form label. */
  prompt: string;
  options: Option[];
  /** Shown under the options: answering is always optional. */
  skipLabel: string;
}

/** Most common first, deduped case-insensitively, capped. */
export function rank(values: string[], cap = 4): string[] {
  const counts = new Map<string, { display: string; n: number }>();
  for (const raw of values) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    const hit = counts.get(key);
    if (hit) hit.n += 1;
    else counts.set(key, { display: v, n: 1 });
  }
  return Array.from(counts.values()).sort((a, b) => b.n - a.n).map((c) => c.display).slice(0, cap);
}

/** Title case for a value that came out of stored data in any casing. */
function pretty(value: string): string {
  return value.length <= 3 ? value.toUpperCase()
    : value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The next question, or null when there is nothing worth asking.
 *
 * `answered` holds the facets already resolved — either because the person
 * answered them or because the query stated them in the first place.
 */
export function nextQuestion(
  u: Understanding,
  facts: ResultFacts,
  answered: ReadonlySet<FacetId>,
): Question | null {
  const has = (f: FacetId) => answered.has(f);

  /* 1. What are they here to do?
     Asked first because it is the only answer that changes WHICH KINDS of
     thing are searched; the rest only narrow within them. Skipped when the
     phrasing already said so — "hiring a designer" or "jobs in Pune" both
     resolve this without asking. */
  const intentKnown = u.intent === 'find_provider' || u.intent === 'find_work';
  if (!has('intent') && !intentKnown && facts.counts.person > 0 && facts.counts.job > 0) {
    return {
      id: 'intent',
      prompt: 'Quick one — are you looking to hire someone, or looking for work yourself?',
      options: [
        { label: 'Hiring someone', append: '', types: ['person'] },
        { label: 'Looking for work', append: '', types: ['job'] },
        { label: 'Just reading up', append: '', types: ['post'] },
      ],
      skipLabel: 'Show me everything',
    };
  }

  /* 2. Where?
     Only when the query did not say, and only offering places the current
     results are actually in. With one location in the data there is nothing to
     choose between, so nothing is asked. */
  if (!has('location') && (u.locations ?? []).length === 0 && facts.locations.length >= 2) {
    return {
      id: 'location',
      prompt: 'Anywhere in particular?',
      options: [
        ...facts.locations.slice(0, 4).map((l) => ({ label: pretty(l), append: `in ${l}` })),
        { label: 'Remote', append: 'remote' },
      ],
      skipLabel: 'Anywhere is fine',
    };
  }

  /* 3. How senior?
     Only for people and jobs — seniority is meaningless for a post — and only
     when the query did not already state it. */
  const aboutPeopleOrJobs = facts.counts.person > 0 || facts.counts.job > 0;
  if (!has('experience') && !u.experience && aboutPeopleOrJobs) {
    return {
      id: 'experience',
      prompt: 'How much experience are you after?',
      options: [
        { label: 'Junior', append: 'junior entry level' },
        { label: 'Mid-level', append: 'mid level' },
        { label: 'Senior', append: 'senior' },
        { label: 'Lead or above', append: 'lead principal' },
      ],
      skipLabel: 'Any level',
    };
  }

  /* 4. Anything specific?
     Last, and only when the results themselves suggest a real choice — three
     or more distinct skills across them. Fewer than that and the "choice" is
     between things everyone in the list already has. */
  const offer = facts.skills.filter((s) => !(u.skills ?? []).includes(s.toLowerCase()));
  if (!has('skill') && offer.length >= 3) {
    return {
      id: 'skill',
      prompt: 'Any of these matter for what you need?',
      options: offer.slice(0, 5).map((s) => ({ label: pretty(s), append: s })),
      skipLabel: 'Not fussy',
    };
  }

  return null;
}

/**
 * The query to run next.
 *
 * Answers are APPENDED rather than replacing what was said, because the
 * original sentence is still the requirement — a follow-up narrows it, it does
 * not restate it. Duplicates are dropped so answering twice cannot stack the
 * same word and skew the scoring.
 */
export function refineQuery(base: string, appends: string[]): string {
  const seen = new Set(base.toLowerCase().split(/\s+/).filter(Boolean));
  const extra: string[] = [];
  for (const a of appends) {
    const words = a.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || words.every((w) => seen.has(w))) continue;
    words.forEach((w) => seen.add(w));
    extra.push(a.trim());
  }
  return extra.length ? `${base.trim()} ${extra.join(' ')}`.trim() : base.trim();
}

/** A friendly, factual line about what came back. Never overstates. */
export function summarise(counts: ResultFacts['counts'], total: number): string {
  if (total === 0) return "I could not find anything for that yet.";
  const parts: string[] = [];
  if (counts.person) parts.push(`${counts.person} ${counts.person === 1 ? 'person' : 'people'}`);
  if (counts.job) parts.push(`${counts.job} ${counts.job === 1 ? 'job' : 'jobs'}`);
  if (counts.post) parts.push(`${counts.post} ${counts.post === 1 ? 'post' : 'posts'}`);
  const list = parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    : parts[0] ?? `${total} matches`;
  return `Here's what I found — ${list}.`;
}


/* ─────────────────────────────────────────────────────────────────────────
   Narrowing

   Appending an answer to the query improves RANKING but does not constrain the
   set: more terms match more documents, so answering "TypeScript" could return
   MORE results than before — measured, 3 back up to 8. A conversation that
   says "let me narrow this down" and then widens is broken, however good the
   ranking underneath is.

   So the answers are also applied here, as an explicit filter over what came
   back. The query still carries them, because the engine ranks better for
   knowing them; this only guarantees the set never grows.
   ───────────────────────────────────────────────────────────────────────── */

export interface Narrowable {
  type: string;
  location?: string | null;
  meta?: { skills?: string[] } | null;
}

/** Facets that can be checked against a result. Others only affect ranking. */
export interface Answers {
  location?: string;
  skill?: string;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * A facet only applies where it means something.
 *
 * A post has no location and lists no skills, so filtering posts by either
 * would silently delete every post — which is not narrowing, it is losing an
 * entire kind of answer.
 */
function applies(facet: keyof Answers, type: string): boolean {
  if (type === 'post') return false;
  if (facet === 'skill') return type === 'person' || type === 'job';
  return true;
}

export function narrow<T extends Narrowable>(results: T[], answers: Answers): T[] {
  let out = results;

  for (const facet of ['location', 'skill'] as const) {
    const wanted = norm(answers[facet]);
    if (!wanted || wanted === 'remote') continue;

    const kept = out.filter((r) => {
      if (!applies(facet, r.type)) return true;
      if (facet === 'location') return norm(r.location).includes(wanted);
      return (r.meta?.skills ?? []).some((s) => norm(s) === wanted);
    });

    /* If a facet would empty the screen, it is not applied. The person asked
       to narrow, not to be told there is nothing — and the ranking still
       reflects their answer, so the best matches are still on top. */
    if (kept.some((r) => r.type !== 'post')) out = kept;
  }
  return out;
}
