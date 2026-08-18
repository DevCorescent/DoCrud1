/**
 * One project, plus everything its page renders.
 *
 * A single request, like /api/services/detail: the project, its poster's
 * public identity, and the poster's other open projects come back together so
 * the detail page never issues a follow-up call per field.
 *
 * Read-only. Visibility matches the rest of the public surface: the project
 * must be active and the poster's account must be live.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getProjectById, getPublicUserProjects } from '@/lib/server/projects';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileFields } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

/** Only the profile fields this page shows — never the whole document. */
const POSTER_FIELDS = ['avatarUrl', 'headline', 'location'] as const;

export async function GET(req: NextRequest) {
  try {
    const projectId = (new URL(req.url).searchParams.get('projectId') || '').trim();
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const project = await getProjectById(projectId);
    // An unpublished project is indistinguishable from a missing one.
    if (!project || !project.isActive) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const poster = await getStoredUserById(project.userId).catch(() => null);
    const hidden =
      !poster ||
      poster.isActive === false ||
      Boolean(poster.deactivatedAt) ||
      Boolean(poster.pendingDeletion) ||
      poster.inviteStatus === 'disabled';
    if (!poster || hidden) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const [profile, posterProjects] = await Promise.all([
      getProfileFields(poster.id, POSTER_FIELDS).catch(() => null),
      getPublicUserProjects(poster.id).catch(() => [] as Awaited<ReturnType<typeof getPublicUserProjects>>),
    ]);

    const others = posterProjects.filter((p) => p.id !== project.id);

    return NextResponse.json(
      {
        project: {
          id: project.id,
          title: project.title,
          description: project.description,
          category: project.category,
          skills: project.skills ?? [],
          budgetType: project.budgetType,
          budgetMin: project.budgetMin,
          budgetMax: project.budgetMax ?? null,
          currency: project.currency,
          location: project.location || null,
          workMode: project.workMode || null,
          projectType: project.projectType,
          deadline: project.deadline || null,
          status: project.status ?? 'open',
          createdAt: project.createdAt,
        },
        poster: {
          id: poster.id,
          name: poster.name?.trim() || 'Docrud member',
          type: poster.accountType ?? 'individual',
          avatarUrl: (profile?.avatarUrl as string | undefined) ?? null,
          headline: (profile?.headline as string | undefined) ?? null,
          location: (profile?.location as string | undefined) ?? null,
          projectCount: posterProjects.length,
        },
        others: others.slice(0, 6).map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          category: p.category,
          skills: p.skills ?? [],
          budgetType: p.budgetType,
          budgetMin: p.budgetMin,
          budgetMax: p.budgetMax ?? null,
          currency: p.currency,
          location: p.location || null,
          workMode: p.workMode || null,
          projectType: p.projectType,
          deadline: p.deadline || null,
          status: p.status ?? 'open',
          createdAt: p.createdAt,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[projects/detail] GET error', error);
    return NextResponse.json({ error: 'Failed to load project.' }, { status: 500 });
  }
}
