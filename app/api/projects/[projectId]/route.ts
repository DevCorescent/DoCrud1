import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { updateProject, deleteProject, type Project } from '@/lib/server/projects';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

/**
 * PUT /api/projects/[projectId] — the owner edits their own posting.
 *
 * Scoped to the actor's own store slice, so a signed-in user can never update
 * somebody else's project by guessing an id.
 */
export async function PUT(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Partial<Project>;
    const updated = await updateProject(actor.id, params.projectId, body);
    if (!updated) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    return NextResponse.json({ project: updated });
  } catch (error) {
    console.error('[projects/id] PUT error', error);
    return NextResponse.json({ error: 'Failed to update project.' }, { status: 500 });
  }
}

/** DELETE /api/projects/[projectId] — the owner removes their own posting. */
export async function DELETE(_req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ok = await deleteProject(actor.id, params.projectId);
    if (!ok) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[projects/id] DELETE error', error);
    return NextResponse.json({ error: 'Failed to delete project.' }, { status: 500 });
  }
}
