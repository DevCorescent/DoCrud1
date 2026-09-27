/**
 * Projects matched to the viewer's profile.
 *
 * The projects sibling of /api/recommendations/jobs, and deliberately built to
 * the same three guarantees:
 *
 *   · THE PROFILE IS ALWAYS THE SESSION'S. It comes from
 *     `resolveSessionUserId`, never from the request, so a client cannot ask
 *     for somebody else's matches.
 *   · NOTHING IS INVENTED. Only projects that are active and open are scored,
 *     and a project with no overlap is left out rather than shown with a badge.
 *   · NO PROFILE MEANS NO MATCHES. A signed-out visitor, or a member whose
 *     profile has nothing to score, gets `{ projects: [], total: 0 }` — not a
 *     list of recent projects relabelled as matches.
 *
 * The scoring is `lib/server/project-recommend.ts`, which is a mapping onto the
 * existing job scorer rather than a second ranking. See the note there.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { buildRecProfile, hasProfileSignals } from '@/lib/server/job-recommend';
import { mergeResumeSignals } from '@/lib/server/recommend-profile';
import { getAllProjects, type Project } from '@/lib/server/projects';
import { recommendedProjects, scoreProjects } from '@/lib/server/project-recommend';

export const dynamic = 'force-dynamic';

/** What a card needs, and nothing else — no poster internals, no budget. */
interface ProjectCard {
  id: string;
  title: string;
  category: string;
  skills: string[];
  location?: string;
  workMode?: string;
  projectType: string;
  createdAt: string;
  matchScore: number;
  matchReasons: string[];
}

/** How many the homepage row can use. The full set's size is returned as `total`. */
const MAX_CARDS = 6;

export async function GET() {
  try {
    /* Resolved from the session exactly as the jobs route resolves it — the id
       comes from the cookie, never from the request. */
    const session = await getAuthSession().catch(() => null);
    const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
    /* Signed out: there is no profile, so there are no matches. Returned as an
       empty set rather than an error — the homepage renders its own invitation
       for this case and a 401 would only make it log a failure first. */
    if (!meId) {
      return NextResponse.json({ projects: [], total: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }

    /* The same field list the jobs route asks for, so the two endpoints score
       against the same view of the member rather than two subsets of it. */
    const fields = await getProfileFields(meId, [
      'headline', 'bio', 'skills', 'location', 'experience', 'interests',
      'resumeFiles', 'matchPreferences',
    ]).catch(() => null);
    /* The same profile the jobs route scores with, built the same way — the
       stated profile plus whatever the member's own resumes add to it. */
    const signals = mergeResumeSignals(
      fields as Parameters<typeof mergeResumeSignals>[0],
      (fields as { resumeFiles?: Parameters<typeof mergeResumeSignals>[1] })?.resumeFiles,
    );
    const profile = buildRecProfile({
      ...(signals as Parameters<typeof buildRecProfile>[0]),
      preferences: (fields as { matchPreferences?: Record<string, never> } | null)?.matchPreferences,
    });

    /* Nothing to score against means nothing can honestly be called a match. */
    if (!hasProfileSignals(profile)) {
      return NextResponse.json({ projects: [], total: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const store = await getAllProjects();
    const all: Project[] = Object.values(store).flat();
    /* A member's own projects are not opportunities for them. */
    const theirs = all.filter((p) => p.userId !== meId);

    const scored = scoreProjects(profile, theirs);
    const matched = recommendedProjects(scored);

    const projects: ProjectCard[] = matched.slice(0, MAX_CARDS).map(({ project, match }) => ({
      id: project.id,
      title: project.title,
      category: project.category,
      skills: Array.isArray(project.skills) ? project.skills.slice(0, 6) : [],
      location: project.location || undefined,
      workMode: project.workMode || undefined,
      projectType: project.projectType,
      createdAt: project.createdAt,
      matchScore: match.score,
      matchReasons: match.reasons,
    }));

    /* `total` is the real size of the matched set, before the row trims it, so
       a "see all" count can never promise fewer than the row already shows. */
    return NextResponse.json(
      { projects, total: matched.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    /* A failing projects store must not take the homepage down with it. */
    return NextResponse.json(
      { projects: [], total: 0, error: 'Project matches are temporarily unavailable.' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
