/**
 * Cross-poster project discovery.
 *
 * Read-only, and shaped exactly like /api/services/discover: one projects
 * read, one cached users read, and one batched avatar lookup for the visible
 * page slice only. Nothing is resolved per project or per poster.
 *
 * Poster identity comes from the stored record's `userId`. The client cannot
 * pass a userId to influence what comes back.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, type Project } from '@/lib/server/projects';
import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

/** The same visibility rule the rest of the public surface applies. */
function isVisiblePoster(u: StoredUser | undefined): u is StoredUser {
  if (!u) return false;
  if (u.isActive === false) return false;
  if (u.deactivatedAt) return false;
  if (u.pendingDeletion) return false;
  if (u.inviteStatus === 'disabled') return false;
  return true;
}

/** Comparable budget, or null when there is nothing to compare. */
function budgetOf(p: Project): number | null {
  if (p.budgetType === 'negotiable') return null;
  return typeof p.budgetMin === 'number' ? p.budgetMin : null;
}

function deadlineTime(p: Project): number | null {
  if (!p.deadline) return null;
  const t = Date.parse(`${p.deadline}T00:00:00`);
  return Number.isNaN(t) ? null : t;
}

/** Weighted match score. Title matches outrank description mentions. */
function relevance(p: Project, posterName: string, terms: string[]): number {
  if (!terms.length) return 0;
  const fields: Array<[string, number]> = [
    [p.title ?? '', 10],
    [p.category ?? '', 5],
    [(p.skills ?? []).join(' '), 4],
    [posterName, 3],
    [p.location ?? '', 3],
    [p.description ?? '', 1],
  ];
  let score = 0;
  for (const term of terms) {
    for (const [text, weight] of fields) {
      if (text.toLowerCase().includes(term)) score += weight;
    }
  }
  return score;
}

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get('q') || '').trim().toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean).slice(0, 8) : [];
    const categories = (sp.get('categories') || '').split(',').map((c) => c.trim()).filter(Boolean);
    const budgetTypes = (sp.get('budgetType') || '').split(',').map((c) => c.trim()).filter(Boolean);
    const projectTypes = (sp.get('projectType') || '').split(',').map((c) => c.trim()).filter(Boolean);
    const workModes = (sp.get('workMode') || '').split(',').map((v) => v.trim()).filter(Boolean);
    const statuses = (sp.get('status') || '').split(',').map((v) => v.trim()).filter(Boolean);
    const skills = (sp.get('skills') || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
    const locationQ = (sp.get('location') || '').trim().toLowerCase();
    const minBudget = sp.get('minBudget') !== null ? Number(sp.get('minBudget')) : null;
    const maxBudget = sp.get('maxBudget') !== null ? Number(sp.get('maxBudget')) : null;
    const sort = sp.get('sort') || 'recommended';
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '24', 10), 1), 48);
    const page = Math.max(parseInt(sp.get('page') || '1', 10), 1);

    const [store, users] = await Promise.all([getAllProjects(), getStoredUsers()]);
    const userById = new Map(users.map((u) => [u.id, u]));

    /* Flatten to visible (project, poster) pairs once. */
    const rows: Array<{ project: Project; poster: StoredUser }> = [];
    for (const [userId, list] of Object.entries(store)) {
      const poster = userById.get(userId);
      if (!isVisiblePoster(poster)) continue;
      for (const project of list ?? []) {
        if (!project?.isActive) continue;
        rows.push({ project, poster });
      }
    }

    const posterName = (p: StoredUser) => p.name?.trim() || 'Docrud member';

    /* Everything except the category filter, so category facet counts are not
       collapsed by the category selection itself. */
    const matchesNonCategory = ({ project: p, poster }: { project: Project; poster: StoredUser }) => {
      if (terms.length && relevance(p, posterName(poster), terms) === 0) return false;
      if (budgetTypes.length && !budgetTypes.includes(p.budgetType)) return false;
      if (projectTypes.length && !projectTypes.includes(p.projectType)) return false;
      /* A project that never stated a work mode is unknown, not a match. */
      if (workModes.length && !workModes.includes(p.workMode ?? '')) return false;
      if (statuses.length && !statuses.includes(p.status ?? 'open')) return false;
      if (skills.length) {
        const own = (p.skills ?? []).map((v) => v.toLowerCase());
        if (!skills.some((v) => own.includes(v))) return false;
      }
      if (locationQ && !(p.location ?? '').toLowerCase().includes(locationQ)) return false;
      if (minBudget !== null || maxBudget !== null) {
        const b = budgetOf(p);
        if (b === null) return false; // negotiable has no number — excluded from a range
        if (minBudget !== null && b < minBudget) return false;
        if (maxBudget !== null && b > maxBudget) return false;
      }
      return true;
    };

    const base = rows.filter(matchesNonCategory);
    const filtered = base.filter((r) => !categories.length || categories.includes(r.project.category));

    const categoryFacets: Record<string, number> = {};
    for (const r of base) categoryFacets[r.project.category] = (categoryFacets[r.project.category] ?? 0) + 1;
    const budgetTypeFacets: Record<string, number> = {};
    const projectTypeFacets: Record<string, number> = {};
    const workModeFacets: Record<string, number> = {};
    const statusFacets: Record<string, number> = {};
    const skillFacets: Record<string, number> = {};
    for (const r of base) {
      budgetTypeFacets[r.project.budgetType] = (budgetTypeFacets[r.project.budgetType] ?? 0) + 1;
      projectTypeFacets[r.project.projectType] = (projectTypeFacets[r.project.projectType] ?? 0) + 1;
      if (r.project.workMode) workModeFacets[r.project.workMode] = (workModeFacets[r.project.workMode] ?? 0) + 1;
      const st = r.project.status ?? 'open';
      statusFacets[st] = (statusFacets[st] ?? 0) + 1;
      for (const v of r.project.skills ?? []) skillFacets[v] = (skillFacets[v] ?? 0) + 1;
    }

    const rel = (r: { project: Project; poster: StoredUser }) =>
      relevance(r.project, posterName(r.poster), terms);

    const comparators: Record<string, (a: typeof filtered[number], b: typeof filtered[number]) => number> = {
      /* Open work first, then the most recently posted. */
      recommended: (a, b) =>
        Number(b.project.status === 'open') - Number(a.project.status === 'open')
        || Date.parse(b.project.createdAt || '') - Date.parse(a.project.createdAt || ''),
      relevance: (a, b) => rel(b) - rel(a),
      newest: (a, b) => Date.parse(b.project.createdAt || '') - Date.parse(a.project.createdAt || ''),
      // Negotiable listings sort last in BOTH directions — they have no figure.
      budget_desc: (a, b) => (budgetOf(b.project) ?? -Infinity) - (budgetOf(a.project) ?? -Infinity),
      budget_asc: (a, b) => (budgetOf(a.project) ?? Infinity) - (budgetOf(b.project) ?? Infinity),
      // A project with no deadline is not "soonest" — it sorts last.
      deadline: (a, b) => (deadlineTime(a.project) ?? Infinity) - (deadlineTime(b.project) ?? Infinity),
    };

    const sorted = [...filtered].sort(comparators[sort] ?? comparators.recommended);
    const total = sorted.length;
    const slice = sorted.slice((page - 1) * limit, page * limit);

    /* One batched avatar lookup, for the visible page only. */
    const avatars = await getProfileAvatars(slice.map((r) => r.poster.id));

    return NextResponse.json(
      {
        projects: slice.map(({ project: p, poster }) => ({
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
          /* Public identity only — no email, role or profile internals. */
          poster: {
            id: poster.id,
            name: posterName(poster),
            avatarUrl: avatars.get(poster.id) ?? null,
          },
        })),
        total,
        hasMore: page * limit < total,
        page,
        facets: {
          categories: categoryFacets,
          budgetType: budgetTypeFacets,
          projectType: projectTypeFacets,
          workMode: workModeFacets,
          status: statusFacets,
          skills: skillFacets,
        },
        /* Total visible projects, so the page can tell "nothing posted yet"
           apart from "nothing matches your filters". */
        libraryTotal: rows.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[projects/discover] GET error', error);
    return NextResponse.json({ error: 'Failed to load projects.' }, { status: 500 });
  }
}
