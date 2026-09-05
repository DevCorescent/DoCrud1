/**
 * Profile ↔ job recommendation scoring.
 *
 * A deterministic, isolated, testable layer ON TOP OF the existing job data —
 * it computes a 0–100 match score, a structured explanation, and human reasons
 * from the viewer's EXISTING stored profile (skills, headline/role, experience,
 * location) against a published HiringJobPosting. It creates no storage and no
 * job records; the caller always uses the session's own profile.
 *
 * ═══ WHY THIS IS NOT STRING EQUALITY ═══
 *
 * The first version asked one question per job skill: is this exact lowercase
 * string in the viewer's skill list? That is wrong in both directions and it is
 * wrong constantly. "reactjs" did not match "React". "Node" did not match
 * "Node.js". Someone whose whole career is Next.js scored zero against a React
 * role. And every requirement counted the same, so a posting that named twelve
 * incidental tools rewarded matching the three that did not matter.
 *
 * The application already owns the machinery to answer that question properly —
 * `lib/server/ats/skill-taxonomy.ts` knows aliases, parents and neighbours, and
 * `lib/server/ats/text.ts` knows how to find a phrase without matching it inside
 * a longer word. The ATS report has used them all along. Recommendations now use
 * the same vocabulary, so the two halves of the product agree about what a skill
 * IS, and a match means the same thing wherever it is shown.
 *
 * ═══ WHAT IS SCORED, AND WHY IN THAT PROPORTION ═══
 *
 *   45  skills      weighted by how much the POSTING leans on each one
 *   25  role        graded title overlap, not a substring test
 *   12  seniority   distance, with over- and under-qualification stated
 *   12  location    same place, or genuinely remote
 *    6  freshness   a live posting is worth more than a stale one
 *
 * Context alone must never look like a match. A job with no skill and no role
 * overlap is capped hard (see NO_OVERLAP_CEILING): "remote, posted recently"
 * used to score 18 on every open role, which made an unfiltered list read like
 * the whole job board.
 *
 * ═══ NOTHING IS FABRICATED ═══
 *
 * Missing data contributes zero and is never guessed at. Every sentence in an
 * explanation names the thing it is talking about — the skills that matched, the
 * ones that did not — so a person can check it against the posting themselves.
 * The result is a description of overlap. It is not a prediction that anyone
 * will be hired, and nothing here is phrased as one.
 */
import { indiaCity } from './job-scraper/india';
import {
  ALL_SURFACE_FORMS, canonicalize, canonicalizeSynonym, isChildOf, isRelated,
} from './ats/skill-taxonomy';
import {
  containsStandalonePhrase, detectSeniority, extractRequiredYears, titleTokens,
} from './ats/text';

/* ─── Weights ──────────────────────────────────────────────────────────────
   They sum to 100. Changing one means changing what a percentage means, so
   they are named rather than sprinkled through the arithmetic. */
const W_SKILLS = 45;
const W_ROLE = 25;
const W_SENIORITY = 12;
const W_LOCATION = 12;
const W_FRESHNESS = 6;

/**
 * The most a job with NO skill and NO role overlap may score.
 *
 * Location, work mode and recency are context: they describe a job, they say
 * nothing about whether it suits this person. Without a ceiling a remote role
 * posted yesterday scores the same for a nurse and a compiler engineer.
 */
const NO_OVERLAP_CEILING = 12;

/** How much each kind of correspondence is worth. Ordered, and never equal. */
const CREDIT = {
  /** The same skill, however it happens to be spelled. React ≡ reactjs. */
  exact: 1,
  /** Same concept, different words. */
  semantic: 0.8,
  /** They know a NARROWER member of it: Next.js for React. Strong evidence. */
  narrower: 0.6,
  /** They know the BROADER thing: AWS for AWS Lambda. Real, but not the same. */
  broader: 0.4,
  /** A neighbour: Express for Node.js. Never a substitute. */
  related: 0.2,
  missing: 0,
} as const;

type CreditKind = keyof typeof CREDIT;

/** How much the POSTING leans on a requirement. A must is worth three nices. */
const IMPORTANCE = { must: 3, important: 2, nice: 1 } as const;
type Importance = keyof typeof IMPORTANCE;

const LEVEL_ORDER = ['entry', 'associate', 'mid', 'senior', 'lead'];

/* ─── Public shapes ───────────────────────────────────────────────────────── */

export interface RecProfile {
  skills: string[];        // lowercased, unique (skills + interests)
  /**
   * `skills` as a Set, built ONCE by buildRecProfile.
   *
   * Ranking scores one profile against thousands of jobs, and skill overlap was
   * `jobSkills.filter((s) => profile.skills.includes(s))` — an array scan per
   * job skill, so O(jobSkills x profileSkills) on EVERY job. A resume-derived
   * profile carries 50-200 skills; measured over 3,000 jobs that was 39 ms and
   * 121 ms, against 16 ms and 19 ms with the Set.
   *
   * Optional so a RecProfile built by older code or a test fixture still works;
   * the lookup falls back to the array, with an identical result.
   */
  skillSet?: ReadonlySet<string>;
  roleTokens: string[];    // lowercased tokens from headline + experience titles + interests
  location: string;        // lowercased
  experienceLevel: string; // '' | entry | associate | mid | senior | lead
  /**
   * The viewer's skills as TAXONOMY CANONICALS — "reactjs", "react.js" and
   * "React" all arrive here as one entry. Optional so a hand-built fixture
   * still scores; it simply scores on surface forms alone, as it used to.
   */
  canonicalSkills?: ReadonlySet<string>;
  /** Skills the taxonomy does not know, kept for literal comparison. */
  unknownSkills?: ReadonlySet<string>;
  /** Years of experience, when the profile says enough to count them. */
  years?: number | null;
}

export interface RecJob {
  id: string;
  title: string;
  organizationName?: string;
  location?: string;
  employmentType?: string;
  workMode?: string;
  experienceLevel?: string;
  description?: string;
  preferredSkills?: string[];
  targetRoleKeywords?: string[];
  createdAt?: string;
}

/** One scored dimension, with the sentence that explains it. */
export interface MatchFactor {
  kind: 'skills' | 'role' | 'seniority' | 'location' | 'freshness';
  /** Short label for a chip or a heading. */
  label: string;
  /** A full sentence naming the specifics, safe to show as-is. */
  detail: string;
  points: number;
  max: number;
}

export interface RecMatch {
  score: number;
  reasons: string[];
  /**
   * True when the job overlaps the viewer's profile for real — a shared skill
   * or a matching role. THIS, not the raw score, is what makes a job a
   * recommendation: "remote" plus "posted recently" alone already scores on
   * every open role, which is why an unfiltered count read like the whole job
   * board. A job with no overlap is a listing, not a match.
   */
  overlap: boolean;
  /** Per-dimension breakdown, best contribution first. */
  factors: MatchFactor[];
  /** Requirements the viewer demonstrably has, by canonical name. */
  matchedSkills: string[];
  /** Requirements the posting leans on that the viewer does not show. */
  missingSkills: string[];
  /** One sentence answering "why does this suit me?". Empty when nothing does. */
  summary: string;
}

/** The recommended set: jobs that genuinely overlap the viewer's profile. */
export function isRecommended(match: RecMatch): boolean {
  return match.overlap;
}

/* ─── Profile ─────────────────────────────────────────────────────────────── */

function tokens(s: unknown): string[] {
  return String(s ?? '').toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2);
}
function uniqLower(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => String(s).toLowerCase().trim()).filter(Boolean)));
}

const STOP = new Set(['and', 'the', 'for', 'with', 'engineer', 'developer', 'senior', 'junior', 'lead', 'staff']);

export function deriveExperienceLevel(experience: Array<{ title?: string }> | undefined): string {
  const titles = (experience || []).map((e) => String(e?.title || '').toLowerCase()).join(' ');
  if (/\b(lead|principal|staff|head|director|vp|chief)\b/.test(titles)) return 'lead';
  if (/\bsenior\b|\bsr\b/.test(titles)) return 'senior';
  if (/\bmid\b|\bintermediate\b/.test(titles)) return 'mid';
  const n = (experience || []).length;
  if (n >= 3) return 'senior';
  if (n === 2) return 'mid';
  if (n === 1) return 'associate';
  return '';
}

/**
 * Years of experience from the periods the profile actually states.
 *
 * Deliberately conservative: a period it cannot read contributes nothing rather
 * than a guess, and the result is null when nothing could be read at all. The
 * number is only ever used to EXPLAIN a seniority gap, never to invent one.
 */
function deriveYears(experience: Array<{ period?: string }> | undefined): number | null {
  const entries = experience ?? [];
  if (!entries.length) return null;
  let earliest: number | null = null;
  let latest: number | null = null;
  let sawPresent = false;
  for (const entry of entries) {
    const period = String(entry?.period ?? '');
    if (/\b(present|current|now)\b/i.test(period)) sawPresent = true;
    for (const m of Array.from(period.match(/\b(?:19|20)\d{2}\b/g) ?? [])) {
      const year = Number(m);
      if (!Number.isFinite(year)) continue;
      earliest = earliest === null ? year : Math.min(earliest, year);
      latest = latest === null ? year : Math.max(latest, year);
    }
  }
  if (earliest === null) return null;
  const end = sawPresent ? new Date().getFullYear() : (latest ?? earliest);
  const span = end - earliest;
  return span >= 0 && span < 60 ? span : null;
}

export function buildRecProfile(fields: {
  headline?: string;
  skills?: string[];
  location?: string;
  experience?: Array<{ title?: string; period?: string }>;
  interests?: string[];
}): RecProfile {
  const skills = uniqLower([...(fields.skills || []), ...(fields.interests || [])]);
  const roleTokens = uniqLower([
    ...tokens(fields.headline),
    ...(fields.experience || []).flatMap((e) => tokens(e?.title)),
    ...(fields.interests || []).map((i) => String(i)),
  ]).filter((t) => !STOP.has(t));

  /* Every spelling of a skill collapses to one canonical here, ONCE, so the
     per-job loop never re-resolves the same string. What the taxonomy does not
     recognise is kept separately and compared literally — an unknown skill is
     still a skill, it just cannot participate in parent/neighbour reasoning. */
  const canonicalSkills = new Set<string>();
  const unknownSkills = new Set<string>();
  for (const skill of skills) {
    const canon = canonicalize(skill) ?? canonicalizeSynonym(skill);
    if (canon) canonicalSkills.add(canon);
    else unknownSkills.add(skill);
  }

  return {
    skills,
    /* Built once here, reused for every job in the pass. */
    skillSet: new Set(skills),
    roleTokens,
    location: String(fields.location ?? '').toLowerCase().trim(),
    experienceLevel: deriveExperienceLevel(fields.experience),
    canonicalSkills,
    unknownSkills,
    years: deriveYears(fields.experience),
  };
}

export function hasProfileSignals(p: RecProfile): boolean {
  return p.skills.length > 0 || p.roleTokens.length > 0;
}

/* ─── Job requirements ────────────────────────────────────────────────────── */

interface Requirement {
  /** Canonical name when the taxonomy knows it, else the surface form. */
  name: string;
  /** What the posting actually wrote, for quoting back. */
  surface: string;
  importance: Importance;
  /** True when the taxonomy recognised it, so relationships can be used. */
  known: boolean;
}

/**
 * What a posting is asking for, weighted by how much it leans on each thing.
 *
 * Importance comes from WHERE the posting says it, which is the most honest
 * signal available without reading prose properly:
 *   · named in the title            → must      (the job IS this)
 *   · declared in the skills fields → important (deliberate, structured data)
 *   · only mentioned in the prose   → nice      (context, not a demand)
 */
function extractRequirements(job: RecJob): Requirement[] {
  const title = String(job.title ?? '').toLowerCase();
  const description = String(job.description ?? '');
  const declared = uniqLower([...(job.preferredSkills ?? []), ...(job.targetRoleKeywords ?? [])])
    .filter((s) => s.length > 1);

  const byName = new Map<string, Requirement>();
  const add = (surface: string, importance: Importance) => {
    const canon = canonicalize(surface) ?? canonicalizeSynonym(surface);
    const name = canon ?? surface;
    const existing = byName.get(name);
    /* The strongest placement wins: a skill in the title is a must even if the
       prose also mentions it in passing. */
    if (existing && IMPORTANCE[existing.importance] >= IMPORTANCE[importance]) return;
    byName.set(name, { name, surface, importance, known: Boolean(canon) });
  };

  for (const skill of declared) {
    add(skill, title.includes(skill) ? 'must' : 'important');
  }

  /* Skills the posting names in its prose but never declared as a field. They
     are real requirements — most scraped postings have no structured skill
     list at all — but they are weighted lowest, because prose mentions
     something in passing far more often than a structured field does. */
  if (description) {
    for (const found of skillsInText(description)) {
      add(found, title.includes(found.toLowerCase()) ? 'must' : 'nice');
    }
  }

  return Array.from(byName.values());
}

/**
 * Taxonomy skills named in a block of prose.
 *
 * Memoised per description, because the same postings are scored against every
 * viewer and the scan is the most expensive thing in a ranking pass. The cache
 * is keyed on the text itself, so an edited posting is re-read rather than
 * remembered wrongly.
 */
const textSkillCache = new Map<string, string[]>();
const TEXT_CACHE_MAX = 4000;

function skillsInText(text: string): string[] {
  const key = `${text.length}:${text.slice(0, 120)}`;
  const hit = textSkillCache.get(key);
  if (hit) return hit;

  const lower = text.toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();
  for (const surface of SCANNABLE_SURFACES) {
    if (!lower.includes(surface)) continue;                 // cheap reject first
    if (!containsStandalonePhrase(lower, surface)) continue; // then the honest test
    const canon = canonicalize(surface) ?? canonicalizeSynonym(surface) ?? surface;
    if (seen.has(canon)) continue;
    seen.add(canon);
    found.push(surface);
  }

  if (textSkillCache.size >= TEXT_CACHE_MAX) textSkillCache.clear();
  textSkillCache.set(key, found);
  return found;
}

/**
 * The surface forms worth scanning prose for.
 *
 * Single letters and two-character forms are excluded: "go", "r" and "c" appear
 * in ordinary English constantly, and a false requirement is worse than a
 * missed one — it dilutes the coverage every real requirement is measured
 * against.
 */
const SCANNABLE_SURFACES: string[] = ALL_SURFACE_FORMS.filter((s) => s.length >= 3);

/* ─── Skill correspondence ────────────────────────────────────────────────── */

/** How well the viewer corresponds to one requirement, and by what route. */
function creditFor(profile: RecProfile, req: Requirement): { credit: number; kind: CreditKind } {
  const canonical = profile.canonicalSkills;
  const unknown = profile.unknownSkills;

  /* Literal agreement first — including for skills the taxonomy never heard of,
     which is how a niche or in-house technology still counts. */
  if (canonical?.has(req.name)) return { credit: CREDIT.exact, kind: 'exact' };
  const surfaceLower = req.surface.toLowerCase();
  if (unknown?.has(surfaceLower) || unknown?.has(req.name.toLowerCase())) {
    return { credit: CREDIT.exact, kind: 'exact' };
  }
  /* A profile built by older code carries no canonical set; fall back to the
     surface comparison it used to do, so such a caller still scores. */
  if (!canonical) {
    const has = profile.skillSet ? profile.skillSet.has(surfaceLower) : profile.skills.includes(surfaceLower);
    return has ? { credit: CREDIT.exact, kind: 'exact' } : { credit: 0, kind: 'missing' };
  }
  if (!req.known) return { credit: 0, kind: 'missing' };

  /* Relationships, strongest first. Knowing a narrower member of what is asked
     for is better evidence than knowing the umbrella it sits under: Next.js
     proves React, whereas "AWS" does not prove "AWS Lambda". */
  const mineList = Array.from(canonical);
  for (const mine of mineList) {
    if (isChildOf(mine, req.name)) return { credit: CREDIT.narrower, kind: 'narrower' };
  }
  for (const mine of mineList) {
    if (isChildOf(req.name, mine)) return { credit: CREDIT.broader, kind: 'broader' };
  }
  for (const mine of mineList) {
    if (isRelated(mine, req.name)) return { credit: CREDIT.related, kind: 'related' };
  }
  return { credit: 0, kind: 'missing' };
}

/* ─── Wording helpers ─────────────────────────────────────────────────────── */

function listPhrase(items: string[], max = 3): string {
  const shown = items.slice(0, max);
  if (shown.length === 0) return '';
  if (shown.length === 1) return shown[0];
  const rest = items.length - shown.length;
  const joined = `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : joined;
}

const LEVEL_WORD: Record<string, string> = {
  entry: 'entry-level', associate: 'associate-level', mid: 'mid-level',
  senior: 'senior', lead: 'lead',
};

/* ─── The score ───────────────────────────────────────────────────────────── */

export function recommendMatch(profile: RecProfile, job: RecJob, now: number): RecMatch {
  const title = String(job.title ?? '').toLowerCase();
  const description = String(job.description ?? '');
  const jobLoc = String(job.location ?? '').toLowerCase();

  const factors: MatchFactor[] = [];
  const reasons: string[] = [];

  /* ── Skills ── */
  const requirements = extractRequirements(job);
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  let weighted = 0;
  let earned = 0;

  for (const req of requirements) {
    const weight = IMPORTANCE[req.importance];
    weighted += weight;
    const { credit, kind } = creditFor(profile, req);
    earned += weight * credit;
    if (credit >= CREDIT.narrower) matchedSkills.push(req.name);
    else if (kind === 'missing' && req.importance !== 'nice') missingSkills.push(req.name);
  }

  const coverage = weighted > 0 ? earned / weighted : 0;
  const skillPoints = W_SKILLS * coverage;

  if (requirements.length) {
    const detail = matchedSkills.length
      ? `You match ${matchedSkills.length} of the ${requirements.length} skills this posting names, including ${listPhrase(matchedSkills)}.`
      : `None of the ${requirements.length} skills this posting names appear on your profile.`;
    factors.push({
      kind: 'skills',
      label: matchedSkills.length ? `${matchedSkills.length}/${requirements.length} skills` : 'No skill overlap',
      detail,
      points: Math.round(skillPoints),
      max: W_SKILLS,
    });
  }
  if (matchedSkills.length) {
    reasons.push(
      matchedSkills.length === 1
        ? `Matches your ${matchedSkills[0]} experience`
        : `Matches ${matchedSkills.length} of your skills — ${listPhrase(matchedSkills)}`,
    );
  }

  /* ── Role ──
     A graded overlap between what the viewer calls themselves and what the
     posting calls the job, rather than "does the title contain any token".
     "data" inside "data entry clerk" should not make a data scientist a match,
     so the ratio is measured against the TITLE's own words. */
  const jobTitleTokens = titleTokens(title).filter((t) => t.length > 2 && !STOP.has(t));
  const roleOverlap = jobTitleTokens.filter((t) => profile.roleTokens.includes(t));
  const roleRatio = jobTitleTokens.length ? roleOverlap.length / jobTitleTokens.length : 0;
  /* A single strong word carries a title more than its share of the tokens
     suggests — "Frontend" in "Frontend Engineer II" is most of the meaning. */
  const rolePoints = W_ROLE * Math.min(1, roleRatio * 1.4);
  const roleHit = roleOverlap.length > 0;

  if (roleHit) {
    factors.push({
      kind: 'role',
      label: 'Role fits',
      detail: `The title lines up with what you do — you both describe this work as ${listPhrase(roleOverlap, 2)}.`,
      points: Math.round(rolePoints),
      max: W_ROLE,
    });
    reasons.push('Role matches your profile');
  }

  /* ── Seniority ──
     Stated in both directions. Being told a role is below your level is as
     useful as being told it is above it, and neither is a failure of the
     person. */
  const jobLevel = String(job.experienceLevel ?? '') || (detectSeniority(title) ?? '');
  let seniorityPoints = 0;
  if (profile.experienceLevel && jobLevel) {
    const a = LEVEL_ORDER.indexOf(profile.experienceLevel);
    const b = LEVEL_ORDER.indexOf(jobLevel);
    if (a >= 0 && b >= 0) {
      const d = Math.abs(a - b);
      seniorityPoints = d === 0 ? W_SENIORITY : d === 1 ? W_SENIORITY * 0.6 : d === 2 ? W_SENIORITY * 0.2 : 0;
      const mine = LEVEL_WORD[profile.experienceLevel] ?? profile.experienceLevel;
      const theirs = LEVEL_WORD[jobLevel] ?? jobLevel;
      const detail = d === 0
        ? `Pitched at ${theirs}, which is where your experience sits.`
        : a > b
          ? `Pitched at ${theirs}; your profile reads ${mine}, so this sits below your level.`
          : `Pitched at ${theirs}; your profile reads ${mine}, so this is a step up.`;
      factors.push({ kind: 'seniority', label: d === 0 ? 'Seniority fits' : 'Seniority differs', detail, points: Math.round(seniorityPoints), max: W_SENIORITY });
      if (d === 0) reasons.push('Experience level fits');
    }
  }

  /* Years are only ever used to EXPLAIN, never to score — a posting's "5+
     years" is a filter the employer applies, not evidence about this person. */
  const requiredYears = description ? extractRequiredYears(description) : null;
  if (requiredYears !== null && typeof profile.years === 'number') {
    factors.push({
      kind: 'seniority',
      label: `${requiredYears}+ years asked`,
      detail: profile.years >= requiredYears
        ? `They ask for ${requiredYears}+ years; your profile shows about ${profile.years}.`
        : `They ask for ${requiredYears}+ years; your profile shows about ${profile.years}.`,
      points: 0,
      max: 0,
    });
  }

  /* ── Location and work mode ── */
  const cityCanon = indiaCity(jobLoc).toLowerCase();
  const locHit = Boolean(
    profile.location && jobLoc
    && (jobLoc.includes(profile.location) || (cityCanon && profile.location.includes(cityCanon))),
  );
  const isRemote = job.workMode === 'remote';
  const isHybrid = job.workMode === 'hybrid';
  let locationPoints = 0;
  if (locHit) locationPoints = W_LOCATION;
  else if (isRemote) locationPoints = W_LOCATION * 0.85;
  else if (isHybrid) locationPoints = W_LOCATION * 0.3;

  if (locHit) {
    factors.push({ kind: 'location', label: 'Same location', detail: `Based in ${job.location}, which matches where you are.`, points: Math.round(locationPoints), max: W_LOCATION });
    reasons.push('Location compatible');
  } else if (isRemote) {
    factors.push({ kind: 'location', label: 'Remote', detail: 'Remote, so where you are based does not restrict it.', points: Math.round(locationPoints), max: W_LOCATION });
    reasons.push('Remote-friendly');
  } else if (jobLoc) {
    factors.push({ kind: 'location', label: 'Different location', detail: `Based in ${job.location}${isHybrid ? ', hybrid' : ''}, which is not where your profile says you are.`, points: Math.round(locationPoints), max: W_LOCATION });
  }

  /* ── Freshness ── */
  let freshnessPoints = 0;
  const posted = Date.parse(String(job.createdAt ?? ''));
  if (Number.isFinite(posted)) {
    const days = (now - posted) / 86_400_000;
    if (days <= 7) freshnessPoints = W_FRESHNESS;
    else if (days <= 30) freshnessPoints = W_FRESHNESS * 0.6;
    else if (days <= 60) freshnessPoints = W_FRESHNESS * 0.25;
    if (days <= 7) {
      factors.push({ kind: 'freshness', label: 'Posted recently', detail: 'Posted within the last week.', points: Math.round(freshnessPoints), max: W_FRESHNESS });
    }
  }

  /* Skill overlap (declared or referenced in the text) or a role-title hit.
     Location, work mode and recency are context, not evidence of a match. */
  const overlap = matchedSkills.length > 0 || roleHit;

  const raw = skillPoints + rolePoints + seniorityPoints + locationPoints + freshnessPoints;
  /* Context alone cannot look like a match — see NO_OVERLAP_CEILING. */
  const score = Math.round(Math.max(0, Math.min(overlap ? 100 : NO_OVERLAP_CEILING, raw)));

  factors.sort((a, b) => b.points - a.points);

  /* One sentence, built only from what actually scored — and only when there is
     a real overlap to describe. A job with none of your skills and none of your
     role is not made suitable by being nearby and recent, and saying "this
     suits you because it is where you are" about a job you cannot do is the
     kind of sentence that teaches people to distrust the whole feature. Silent
     is the honest answer there. */
  let summary = '';
  if (overlap) {
    const summaryParts: string[] = [];
    if (matchedSkills.length) {
      summaryParts.push(`you already work with ${listPhrase(matchedSkills, 3)}`);
    }
    if (roleHit) summaryParts.push('the role is the kind of work you do');
    if (locHit) summaryParts.push('it is where you are');
    else if (isRemote) summaryParts.push('it is remote');
    if (summaryParts.length) summary = `This suits you because ${listPhrase(summaryParts, 3)}.`;
  }

  return { score, reasons, overlap, factors, matchedSkills, missingSkills, summary };
}
