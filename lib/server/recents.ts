import { readJsonFile, writeJsonFile, recentsPath } from '@/lib/server/storage';

const EXPIRY_HOURS = 24;

export type RecentType = 'image' | 'video' | 'text';
export type RecentVisibility = 'public' | 'private';

export interface Recent {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  type: RecentType;
  mediaUrl?: string | null;
  caption?: string | null;
  bgColor?: string;
  bgGradient?: string;
  textColor?: string;
  fontStyle?: string;
  fontSize?: number;
  ctaLabel?: string;
  ctaUrl?: string;
  expiryHours?: number;
  category: string;
  visibility: RecentVisibility;
  viewCount: number;
  viewedBy: string[];
  likedBy: string[];
  createdAt: string;
  expiresAt: string;
}

async function read(): Promise<Recent[]> {
  const all = await readJsonFile<Recent[]>(recentsPath, []);
  const now = Date.now();
  return all
    .filter((r) => new Date(r.expiresAt).getTime() > now)
    .map((r) => ({ ...r, viewedBy: r.viewedBy ?? [], likedBy: r.likedBy ?? [] }));
}

async function save(items: Recent[]): Promise<void> {
  const now = Date.now();
  await writeJsonFile(recentsPath, items.filter((r) => new Date(r.expiresAt).getTime() > now));
}

export async function getRecents(options?: { visibility?: RecentVisibility; userId?: string }): Promise<Recent[]> {
  const all = await read();
  if (!options) return all;
  return all.filter((r) => {
    if (options.visibility && r.visibility !== options.visibility) return false;
    if (options.userId && r.userId !== options.userId) return false;
    return true;
  });
}

export async function getRecentById(id: string): Promise<Recent | null> {
  const all = await read();
  return all.find((r) => r.id === id) ?? null;
}

export async function createRecent(data: {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  type: RecentType;
  mediaUrl?: string | null;
  caption?: string | null;
  bgColor?: string;
  bgGradient?: string;
  textColor?: string;
  fontStyle?: string;
  fontSize?: number;
  ctaLabel?: string;
  ctaUrl?: string;
  expiryHours?: number;
  category: string;
  visibility: RecentVisibility;
}): Promise<Recent> {
  const all = await read();
  const now = new Date();
  const hours = Math.min(Math.max(data.expiryHours ?? EXPIRY_HOURS, 1), 48);
  const expires = new Date(now.getTime() + hours * 3600 * 1000);
  const recent: Recent = {
    id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...data,
    viewCount: 0,
    viewedBy: [],
    likedBy: [],
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  await save([...all, recent]);
  return recent;
}

export async function recordView(id: string, viewerId: string): Promise<Recent | null> {
  const all = await read();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const r = all[idx];
  if (!r.viewedBy.includes(viewerId)) {
    r.viewedBy.push(viewerId);
    r.viewCount = r.viewedBy.length;
    await save(all);
  }
  return r;
}

export async function toggleLike(id: string, userId: string): Promise<Recent | null> {
  const all = await read();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const r = all[idx];
  if (r.likedBy.includes(userId)) {
    r.likedBy = r.likedBy.filter((u) => u !== userId);
  } else {
    r.likedBy.push(userId);
  }
  await save(all);
  return r;
}

export async function deleteRecent(id: string, requestingUserId: string): Promise<boolean> {
  const all = await read();
  const item = all.find((r) => r.id === id);
  if (!item) return false;
  if (item.userId !== requestingUserId) return false;
  await save(all.filter((r) => r.id !== id));
  return true;
}
