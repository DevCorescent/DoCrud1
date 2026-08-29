/**
 * Builds the signal set job recommendations rank against — profile first,
 * uploaded resume second.
 *
 * WHY THIS EXISTS
 * ---------------
 * `buildRecProfile` reads headline, skills, location, experience and interests
 * from the stored profile. A member who uploaded a CV but never filled those
 * fields in therefore matched on almost nothing: measured on live data, an
 * account with three parsed resumes scored 18% on 217 of 362 jobs, because 18
 * is exactly what a job scores with ZERO profile overlap (remote 8 + recent 6 +
 * long description 4). The same person's other account, with a headline and a
 * location filled in, scored 45/33/29.
 *
 * Every resume upload is already parsed into `resumeFiles[].parsedData`
 * (headline, location, skills, experience, education) by the existing ATS
 * pipeline. Nothing re-parses anything here and no AI is called — this only
 * reads what that pipeline already stored.
 *
 * THE RULES
 * ---------
 *  · Skills are UNIONED. A resume routinely lists more than someone bothers to
 *    type; both sets are real statements about the same person.
 *  · Headline, location and experience are FALLBACKS only. What a member typed
 *    into their profile is a deliberate, current statement; a CV can be years
 *    old. The resume fills a gap, it never overrides an answer.
 *  · The most recently uploaded resume wins where several disagree.
 *
 * The SCORER IS UNTOUCHED. `lib/server/job-recommend.ts` still decides
 * matchScore and matchReasons exactly as before; this only changes what it is
 * told about the viewer. Scores move because the viewer is better described,
 * not because the maths changed.
 */

export interface ResumeParsedData {
  headline?: string | null;
  location?: string | null;
  skills?: string[];
  experience?: Array<{ title?: string; company?: string; period?: string; desc?: string }>;
  education?: Array<{ degree?: string; school?: string; year?: string }>;
}

export interface ResumeFileLike {
  uploadedAt?: string;
  parsedData?: ResumeParsedData;
}

/** Only the fields the recommender reads. */
export interface RecommendSignals {
  headline?: string;
  skills?: string[];
  location?: string;
  experience?: Array<{ title?: string; company?: string; period?: string; desc?: string }>;
  interests?: string[];
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

/** Case-insensitive union that keeps the first spelling seen. */
function unionSkills(primary: string[], extra: string[]): string[] {
  const seen = new Set(primary.map((s) => s.toLowerCase()));
  const out = [...primary];
  for (const skill of extra) {
    const key = skill.toLowerCase();
    if (key && !seen.has(key)) { seen.add(key); out.push(skill); }
  }
  return out;
}

/**
 * Merges parsed resume data into the profile's own signals.
 *
 * Pure and side-effect free: it neither reads storage nor mutates its input,
 * so it is safe to call on a cached profile object.
 */
export function mergeResumeSignals(
  profile: RecommendSignals | null | undefined,
  resumeFiles: ResumeFileLike[] | null | undefined,
): RecommendSignals {
  const base: RecommendSignals = {
    headline: text(profile?.headline) || undefined,
    skills: list(profile?.skills),
    location: text(profile?.location) || undefined,
    experience: Array.isArray(profile?.experience) ? profile!.experience : [],
    interests: list(profile?.interests),
  };

  const parsed = (resumeFiles ?? [])
    .filter((f): f is ResumeFileLike & { parsedData: ResumeParsedData } => Boolean(f?.parsedData))
    /* Newest first, so the freshest CV wins any disagreement. Entries with no
       timestamp sort last rather than jumping the queue. */
    .sort((a, b) => text(b.uploadedAt).localeCompare(text(a.uploadedAt)));

  if (parsed.length === 0) return base;

  const merged: RecommendSignals = { ...base };

  for (const file of parsed) {
    const data = file.parsedData;

    // Union — a resume usually lists more skills than a profile does.
    merged.skills = unionSkills(merged.skills ?? [], list(data.skills));

    // Fallbacks — only ever fill a gap the member left empty.
    if (!merged.headline) merged.headline = text(data.headline) || undefined;
    if (!merged.location) merged.location = text(data.location) || undefined;
    if (!merged.experience?.length && Array.isArray(data.experience) && data.experience.length) {
      merged.experience = data.experience;
    }
  }

  return merged;
}

/**
 * Which signals the viewer is still missing, for telling them why their matches
 * look weak. Read-only and derived — nothing is stored.
 *
 * `location` and `headline` matter most: between them they carry 32 of the 100
 * available points (role 20, location 12), and neither is recoverable from a
 * resume whose parse did not capture them.
 */
export function missingRecommendSignals(signals: RecommendSignals): Array<'headline' | 'skills' | 'location' | 'experience'> {
  const missing: Array<'headline' | 'skills' | 'location' | 'experience'> = [];
  if (!text(signals.headline)) missing.push('headline');
  if (!(signals.skills ?? []).length) missing.push('skills');
  if (!text(signals.location)) missing.push('location');
  if (!(signals.experience ?? []).length) missing.push('experience');
  return missing;
}
