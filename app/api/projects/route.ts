import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getUserProjects, createProject, type Project } from '@/lib/server/projects';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

/** GET /api/projects — the signed-in user's own projects, active or not. */
export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const projects = await getUserProjects(actor.id);
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('[projects] GET error', error);
    return NextResponse.json({ error: 'Failed to load projects.' }, { status: 500 });
  }
}

const CATEGORIES = new Set([
  'design','development','writing','marketing','consulting','photography','video','music',
  'business','legal','finance','coaching','education','health','architecture','engineering',
  'technology','ai','data','hr','events','personal','other',
]);
const BUDGET_TYPES = new Set(['fixed', 'hourly', 'negotiable']);
const PROJECT_TYPES = new Set(['one_time', 'ongoing', 'contract', 'collaboration']);
const WORK_MODES = new Set(['remote', 'onsite', 'hybrid']);

/** POST /api/projects — publish a project. The owner is the session user. */
export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Partial<Project>;

    if (!body.title?.trim()) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (!body.description?.trim()) return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
    if (!body.category || !CATEGORIES.has(body.category)) {
      return NextResponse.json({ error: 'A valid category is required.' }, { status: 400 });
    }

    const budgetType = BUDGET_TYPES.has(body.budgetType ?? '') ? body.budgetType! : 'negotiable';
    /* A negotiable budget carries no figure, so no number is stored for it. */
    const budgetMin = budgetType === 'negotiable' ? 0 : Math.max(0, Number(body.budgetMin) || 0);
    const rawMax = Number(body.budgetMax);
    const budgetMax =
      budgetType !== 'negotiable' && Number.isFinite(rawMax) && rawMax > budgetMin ? rawMax : undefined;

    const project = await createProject(actor.id, {
      title: body.title.trim(),
      description: body.description.trim(),
      category: body.category,
      skills: Array.isArray(body.skills)
        ? body.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 20)
        : [],
      budgetType,
      budgetMin,
      budgetMax,
      currency: body.currency?.trim() || 'INR',
      location: body.location?.trim() || undefined,
      workMode: WORK_MODES.has(body.workMode ?? '') ? body.workMode : undefined,
      projectType: PROJECT_TYPES.has(body.projectType ?? '') ? body.projectType! : 'one_time',
      /* Stored only when it parses as a real date. */
      deadline: body.deadline && !Number.isNaN(Date.parse(`${body.deadline}T00:00:00`))
        ? body.deadline
        : undefined,
      status: 'open',
      isActive: body.isActive ?? true,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('[projects] POST error', error);
    return NextResponse.json({ error: 'Failed to create project.' }, { status: 500 });
  }
}
