import { readJsonFile, writeJsonFile, upraisedPath } from '@/lib/server/storage';

type UpraisedData = Record<string, string[]>; // targetUserId → [upraiserId, …]

async function getData(): Promise<UpraisedData> {
  return readJsonFile<UpraisedData>(upraisedPath, {});
}

export async function getUpraisedCount(userId: string): Promise<number> {
  const data = await getData();
  return (data[userId] ?? []).length;
}

export async function getUpraiseCounts(userIds: string[]): Promise<Record<string, number>> {
  const data = await getData();
  const result: Record<string, number> = {};
  for (const id of userIds) result[id] = (data[id] ?? []).length;
  return result;
}

export async function hasUserUpraised(targetUserId: string, upraiserUserId: string): Promise<boolean> {
  const data = await getData();
  return (data[targetUserId] ?? []).includes(upraiserUserId);
}

export async function getMyUpraisedIds(upraiserUserId: string): Promise<string[]> {
  const data = await getData();
  return Object.keys(data).filter((tid) => (data[tid] ?? []).includes(upraiserUserId));
}

export async function toggleUpraise(
  targetUserId: string,
  upraiserUserId: string,
): Promise<{ count: number; hasUpraised: boolean }> {
  const data = await getData();
  const current = data[targetUserId] ?? [];
  const had = current.includes(upraiserUserId);
  data[targetUserId] = had
    ? current.filter((id) => id !== upraiserUserId)
    : [...current, upraiserUserId];
  await writeJsonFile(upraisedPath, data);
  return { count: data[targetUserId].length, hasUpraised: !had };
}
