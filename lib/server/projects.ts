/**
 * Projects — the opportunity where someone posts work they need done.
 *
 * Deliberately the same shape as lib/server/services.ts: one JSON store keyed
 * by owner id, the same id prefix convention, the same create/update/delete
 * surface. Services is the reference implementation; nothing here changes it.
 *
 * The store is written only by the owner through /api/projects. Discovery and
 * detail are read-only.
 */

import { readJsonFile, writeJsonFile, projectsPath } from '@/lib/server/storage';

/* The same domain vocabulary Services uses, so one taxonomy serves the whole
   opportunity network rather than two lists drifting apart. */
export type ProjectCategory =
  | 'design' | 'development' | 'writing' | 'marketing' | 'consulting'
  | 'photography' | 'video' | 'music' | 'business' | 'legal' | 'finance'
  | 'coaching' | 'education' | 'health' | 'architecture' | 'engineering'
  | 'technology' | 'ai' | 'data' | 'hr' | 'events' | 'personal' | 'other';

/** How the poster wants to pay. Mirrors Services' PricingModel intent. */
export type BudgetType = 'fixed' | 'hourly' | 'negotiable';
/** Where the work happens. Same vocabulary as ServiceWorkMode. */
export type ProjectWorkMode = 'remote' | 'onsite' | 'hybrid';
/** The shape of the engagement. */
export type ProjectType = 'one_time' | 'ongoing' | 'contract' | 'collaboration';
/** Whether the poster is still taking interest. */
export type ProjectStatus = 'open' | 'in_progress' | 'closed';

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: ProjectCategory;
  /** Skills the poster is looking for. Empty when they named none. */
  skills: string[];
  budgetType: BudgetType;
  /** 0 when the budget is negotiable — there is no number to show. */
  budgetMin: number;
  /** Upper bound of a range. Absent when the poster gave a single figure. */
  budgetMax?: number;
  currency: string;
  /** Free text. Absent when the poster left it blank. */
  location?: string;
  workMode?: ProjectWorkMode;
  projectType: ProjectType;
  /** ISO date (YYYY-MM-DD). Absent when the poster set no deadline. */
  deadline?: string;
  status: ProjectStatus;
  /** Unpublished projects are invisible everywhere public. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type ProjectsStore = Record<string, Project[]>;

export async function getAllProjects(): Promise<ProjectsStore> {
  return readJsonFile<ProjectsStore>(projectsPath, {});
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const store = await getAllProjects();
  return (store[userId] ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getPublicUserProjects(userId: string): Promise<Project[]> {
  return (await getUserProjects(userId)).filter((p) => p.isActive);
}

export async function createProject(
  userId: string,
  data: Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<Project> {
  const store = await getAllProjects();
  const project: Project = {
    ...data,
    id: `prj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store[userId] = [...(store[userId] ?? []), project];
  await writeJsonFile(projectsPath, store);
  return project;
}

export async function updateProject(
  userId: string,
  projectId: string,
  data: Partial<Project>,
): Promise<Project | null> {
  const store = await getAllProjects();
  const list = store[userId] ?? [];
  const idx = list.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...data, userId, id: projectId, updatedAt: new Date().toISOString() };
  store[userId] = list;
  await writeJsonFile(projectsPath, store);
  return list[idx];
}

export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  const store = await getAllProjects();
  const list = store[userId] ?? [];
  const filtered = list.filter((p) => p.id !== projectId);
  if (filtered.length === list.length) return false;
  store[userId] = filtered;
  await writeJsonFile(projectsPath, store);
  return true;
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const store = await getAllProjects();
  for (const list of Object.values(store)) {
    const found = list.find((p) => p.id === projectId);
    if (found) return found;
  }
  return null;
}
