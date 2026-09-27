/**
 * Scoring a project against a member's profile.
 *
 * ═══ THERE IS NO SECOND ALGORITHM HERE ═══
 *
 * This module does not rank anything. It expresses a Project in the shape the
 * existing job scorer already takes and hands it to `recommendMatch()` — the
 * same weights, the same skill extraction, the same reason strings, the same
 * refusal to call context a match. A parallel scorer would have been a second
 * ranking to keep in step with the first, and the homepage shows both kinds on
 * one screen, so the moment the two disagreed the page would be arguing with
 * itself.
 *
 * ═══ WHAT A PROJECT CAN AND CANNOT SCORE ═══
 *
 *   skills      project.skills, the poster's own list        — the real signal
 *   role        the title, and the category as a keyword
 *   location    project.location / project.workMode
 *   freshness   project.createdAt
 *   seniority   NOTHING. A project states no experience level.
 *
 * That last line has a consequence worth being plain about: the scorer sums
 * points out of 100 and a project can never earn the 12 that seniority is
 * worth, so a perfectly matched project reads 88 where a perfectly matched job
 * reads 100. It is NOT normalised to hide that — the score is how much evidence
 * there is, and a project genuinely offers less of it. What follows from it is a
 * presentation rule rather than a maths one: projects are shown in their own
 * row, so a reader compares projects with projects and never sees a job ranked
 * above a project by a handicap the project could not have avoided.
 */
import { recommendMatch, type RecJob, type RecMatch, type RecProfile } from '@/lib/server/job-recommend';
import { PROJECT_CATEGORIES } from '@/lib/projects-ui';
import type { Project } from '@/lib/server/projects';

/** The scorer's ceiling for a project — see the note above. */
export const PROJECT_SCORE_CEILING = 88;

/**
 * A project, in the shape the job scorer reads.
 *
 * Absent fields are left absent rather than filled with a plausible default:
 * `employmentType` and `experienceLevel` have no project equivalent, and
 * inventing one would make the scorer reason about something the poster never
 * said.
 */
export function projectAsRecJob(project: Project): RecJob {
  const categoryLabel = PROJECT_CATEGORIES[project.category]?.label;
  return {
    id: project.id,
    title: project.title || '',
    location: project.location || undefined,
    workMode: project.workMode || undefined,
    description: project.description || undefined,
    /* The poster's own list, which is what makes a project scoreable at all. */
    preferredSkills: Array.isArray(project.skills) ? project.skills.filter(Boolean) : [],
    /* The category is a genuine role signal — "Web Development", "Design" —
       so it is offered as a role keyword rather than being ignored. */
    targetRoleKeywords: categoryLabel ? [categoryLabel] : undefined,
    createdAt: project.createdAt || undefined,
  };
}

/** True when a project is something a member could actually take on today. */
export function isProjectOpen(project: Project): boolean {
  return project.isActive === true && project.status === 'open';
}

export interface ScoredProject {
  project: Project;
  match: RecMatch;
}

/**
 * Score every open project against one profile, best first.
 *
 * Ties break on recency, exactly as the jobs route breaks them, so two equally
 * matched projects appear in the order they were posted.
 */
export function scoreProjects(
  profile: RecProfile,
  projects: Project[],
  now: number = Date.now(),
): ScoredProject[] {
  const out: ScoredProject[] = [];
  for (const project of projects) {
    if (!isProjectOpen(project)) continue;
    out.push({ project, match: recommendMatch(profile, projectAsRecJob(project), now) });
  }
  out.sort((a, b) => b.match.score - a.match.score
    || Date.parse(b.project.createdAt || '') - Date.parse(a.project.createdAt || ''));
  return out;
}

/**
 * The ones that genuinely overlap the profile, not everything above zero.
 *
 * The same rule the jobs route applies: "remote" and "posted this week" score
 * on every listing, so a set built from `score > 0` would be the whole board
 * wearing a match badge. `match.overlap` is the scorer's own answer to this
 * question — it is documented on `RecMatch` as the thing that makes a listing a
 * recommendation — so it is read rather than re-derived from the reason list.
 */
export function recommendedProjects(scored: ScoredProject[]): ScoredProject[] {
  return scored.filter((s) => s.match.overlap);
}
