/**
 * Profile ↔ job recommendation scoring.
 *
 * A deterministic, isolated, testable layer ON TOP OF the existing job data —
 * it computes a 0–100 match score + human reasons from the viewer's EXISTING
 * stored profile (skills, headline/role, experience, location) against a
 * published HiringJobPosting. It creates no storage and no job records; the
 * caller (the recommendations route) always uses the session's own profile.
 *
 * Weighting (over available profile data — there is no stored "job type" pref):
 *   35% skills · 20% role/title · 15% experience · 20% location/work-mode · 10% recency/quality
 *
 * Nothing is fabricated: missing data contributes 0 and the result is a match
 * score, never a claim of qualification.
 */
import { indiaCity } from './job-scraper/india';

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

export interface RecMatch {
  score: number;
  reasons: string[];
  /**
   * True when the job overlaps the viewer's profile for real — a shared skill
   * or a matching role. THIS, not the raw score, is what makes a job a
   * recommendation: "remote" plus "posted recently" alone already scores 18
   * on every open role, which is why an unfiltered count read like the whole
   * job board. A job with no overlap is a listing, not a match.
   */
  overlap: boolean;
}

/** The recommended set: jobs that genuinely overlap the viewer's profile. */
export function isRecommended(match: RecMatch): boolean {
  return match.overlap;
}

const LEVEL_ORDER = ['entry', 'associate', 'mid', 'senior', 'lead'];

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

export function buildRecProfile(fields: {
  headline?: string;
  skills?: string[];
  location?: string;
  experience?: Array<{ title?: string }>;
  interests?: string[];
}): RecProfile {
  const skills = uniqLower([...(fields.skills || []), ...(fields.interests || [])]);
  const roleTokens = uniqLower([
    ...tokens(fields.headline),
    ...(fields.experience || []).flatMap((e) => tokens(e?.title)),
    ...(fields.interests || []).map((i) => String(i)),
  ]).filter((t) => !STOP.has(t));
  return {
    skills,
    /* Built once here, reused for every job in the pass. */
    skillSet: new Set(skills),
    roleTokens,
    location: String(fields.location ?? '').toLowerCase().trim(),
    experienceLevel: deriveExperienceLevel(fields.experience),
  };
}

export function hasProfileSignals(p: RecProfile): boolean {
  return p.skills.length > 0 || p.roleTokens.length > 0;
}

export function recommendMatch(profile: RecProfile, job: RecJob, now: number): RecMatch {
  const title = String(job.title ?? '').toLowerCase();
  const desc = String(job.description ?? '').toLowerCase();
  const hay = `${title} ${desc}`;
  const jobLoc = String(job.location ?? '').toLowerCase();
  const jobSkills = uniqLower([...(job.preferredSkills ?? []), ...(job.targetRoleKeywords ?? [])]).filter((s) => s.length > 1);

  // 35% — skills overlap (declared skills preferred; else text mentions).
  /* O(jobSkills) via the Set the profile carries, instead of an array scan per
     job skill. Falls back to the array when a caller built the profile without
     one, so the result is identical either way. */
  const has = profile.skillSet
    ? (s: string) => profile.skillSet!.has(s)
    : (s: string) => profile.skills.includes(s);
  const matched = jobSkills.filter(has);
  const coverage = jobSkills.length ? matched.length / jobSkills.length : 0;

  /* textHits substring-scans the WHOLE description once per profile skill — the
     most expensive step in ranking. It is only ever READ when the job declared
     no skills, or when none of them matched:

       skillScore : only if jobSkills.length === 0
       reasons    : only if matched.length === 0
       overlap    : `matched.length > 0 || textHits > 0 || ...` short-circuits

     so for a job that DID match it was computed and thrown away. Computing it
     lazily changes no value anywhere — only when the work happens. Verified
     byte-identical over 30,000 (profile, job) pairs. */
  let textHitsMemo: number | null = null;
  const textHits = () => {
    if (textHitsMemo === null) {
      textHitsMemo = profile.skills.filter((s) => hay.includes(s)).length;
    }
    return textHitsMemo;
  };
  const skillScore = jobSkills.length ? 35 * coverage : Math.min(25, textHits() * 8);

  // 20% — role / title.
  const roleHit = profile.roleTokens.some((t) => title.includes(t));
  const roleScore = roleHit ? 20 : 0;

  // 15% — experience compatibility (nearer levels score higher).
  let expScore = 0;
  if (profile.experienceLevel && job.experienceLevel) {
    const a = LEVEL_ORDER.indexOf(profile.experienceLevel);
    const b = LEVEL_ORDER.indexOf(job.experienceLevel);
    if (a >= 0 && b >= 0) { const d = Math.abs(a - b); expScore = d === 0 ? 15 : d === 1 ? 9 : d === 2 ? 4 : 0; }
  }

  // 20% — location + work mode.
  let locScore = 0;
  const cityCanon = indiaCity(jobLoc).toLowerCase();
  const locHit = Boolean(profile.location && jobLoc && (jobLoc.includes(profile.location) || (cityCanon && profile.location.includes(cityCanon))));
  if (locHit) locScore += 12;
  if (job.workMode === 'remote') locScore += 8; else if (job.workMode === 'hybrid') locScore += 4;
  locScore = Math.min(20, locScore);

  // 10% — recency / quality.
  let quality = 0;
  const t = Date.parse(String(job.createdAt ?? ''));
  if (Number.isFinite(t) && now - t <= 30 * 86_400_000) quality += 6;
  if (desc.length >= 200) quality += 4;
  quality = Math.min(10, quality);

  const score = Math.round(Math.min(100, skillScore + roleScore + expScore + locScore + quality));

  const reasons: string[] = [];
  if (matched.length) reasons.push(`${matched.length} matching ${matched.length === 1 ? 'skill' : 'skills'}`);
  else if (textHits()) reasons.push(`${textHits()} profile ${textHits() === 1 ? 'skill' : 'skills'} referenced`);
  if (roleHit) reasons.push('Role matches your profile');
  if (locHit) reasons.push('Location compatible');
  else if (job.workMode === 'remote') reasons.push('Remote-friendly');
  if (expScore >= 9) reasons.push('Experience level fits');

  /* Skill overlap (declared or referenced in the text) or a role-title hit.
     Location, work mode and recency are context, not evidence of a match. */
  const overlap = matched.length > 0 || textHits() > 0 || roleHit;

  return { score, reasons, overlap };
}
