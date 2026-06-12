import { SecureFileTransfer } from '@/types/document';
import { getFileTransfers } from '@/lib/server/file-transfers';

export interface FileDirectorySearchEntry {
  kind?: 'file' | 'locker';
  id: string;
  shareId: string;
  title: string;
  fileName: string;
  notes?: string;
  mimeType: string;
  sizeInBytes: number;
  category?: string;
  tags: string[];
  visibility: 'public' | 'private';
  authMode: SecureFileTransfer['authMode'];
  linkHref: string;
  lockerId?: string;
  lockerName?: string;
  fileCount?: number;
  openCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

function normalizedText(value?: string) {
  return (value || '').trim().toLowerCase();
}

function tokenize(value: string) {
  return normalizedText(value).split(/[\s._-]+/).filter(Boolean);
}

function scoreTransfer(entry: SecureFileTransfer, query: string) {
  const q = normalizedText(query);
  if (!q) return 1;

  const tokens = tokenize(q);
  const title = normalizedText(entry.title || entry.fileName);
  const fileName = normalizedText(entry.fileName);
  const notes = normalizedText(entry.notes);
  const category = normalizedText(entry.directoryCategory);
  const tags = (entry.directoryTags || []).map((tag) => normalizedText(tag));

  let score = 0;

  if (title.includes(q)) score += 14;
  if (fileName.includes(q)) score += 12;
  if (category.includes(q)) score += 8;
  if (notes.includes(q)) score += 6;
  if (tags.some((tag) => tag.includes(q))) score += 7;

  for (const token of tokens) {
    if (title.includes(token)) score += 5;
    if (fileName.includes(token)) score += 4;
    if (notes.includes(token)) score += 2;
    if (category.includes(token)) score += 3;
    if (tags.some((tag) => tag.includes(token))) score += 3;
  }

  return score;
}

function toSearchEntry(entry: SecureFileTransfer): FileDirectorySearchEntry {
  return {
    id: entry.id,
    shareId: entry.shareId,
    title: entry.title || entry.fileName,
    fileName: entry.fileName,
    notes: entry.notes,
    mimeType: entry.mimeType,
    sizeInBytes: entry.sizeInBytes,
    category: entry.directoryCategory,
    tags: entry.directoryTags || [],
    visibility: entry.directoryVisibility === 'public' ? 'public' : 'private',
    authMode: entry.authMode,
    linkHref: `/transfer/${entry.shareId}`,
    lockerId: entry.lockerId,
    lockerName: entry.lockerName,
    kind: 'file',
    openCount: entry.openCount || 0,
    downloadCount: entry.downloadCount || 0,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function searchPublicDirectory(options: {
  query?: string;
  category?: string;
  limit?: number;
}) {
  const transfers = await getFileTransfers();
  const query = normalizedText(options.query);
  const category = normalizedText(options.category);
  const limit = Math.max(1, Math.min(options.limit || 12, 30));

  return transfers
    .filter((entry) => !entry.revokedAt && entry.directoryVisibility === 'public' && entry.authMode === 'public')
    .filter((entry) => !category || normalizedText(entry.directoryCategory) === category)
    .map((entry) => ({ entry, score: scoreTransfer(entry, query) }))
    .filter(({ score }) => !query || score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.entry.updatedAt).getTime() - new Date(left.entry.updatedAt).getTime();
    })
    .slice(0, limit)
    .map(({ entry }) => toSearchEntry(entry));
}

export async function searchPrivateDirectory(options: {
  query?: string;
  password?: string;
  category?: string;
  limit?: number;
}) {
  const transfers = await getFileTransfers();
  const query = normalizedText(options.query);
  const password = (options.password || '').trim().toUpperCase();
  const category = normalizedText(options.category);
  const limit = Math.max(1, Math.min(options.limit || 12, 30));

  if (!password) {
    return [];
  }

  const matchingTransfers = transfers
    .filter((entry) => !entry.revokedAt && entry.directoryVisibility !== 'public' && entry.accessPassword === password)
    .filter((entry) => !category || normalizedText(entry.directoryCategory) === category);

  const lockerMap = new Map<string, SecureFileTransfer[]>();
  const looseFiles: SecureFileTransfer[] = [];
  for (const entry of matchingTransfers) {
    if (entry.lockerId) {
      lockerMap.set(entry.lockerId, [...(lockerMap.get(entry.lockerId) || []), entry]);
    } else {
      looseFiles.push(entry);
    }
  }

  const lockerEntries: Array<{ score: number; entry: FileDirectorySearchEntry; updatedAt: string }> = Array.from(lockerMap.entries()).map(([lockerId, items]) => {
    const sorted = [...items].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    const lead = sorted[0];
    const title = lead.lockerName || lead.directoryCategory || 'Private locker';
    const score = scoreTransfer({ ...lead, title, fileName: title }, query);
    return {
      score,
      updatedAt: lead.updatedAt,
      entry: {
        id: lockerId,
        shareId: lockerId,
        kind: items.length > 1 ? 'locker' : 'file',
        title,
        fileName: items.length > 1 ? `${items.length} files` : lead.fileName,
        notes: lead.notes,
        mimeType: items.length > 1 ? 'application/vnd.docrud.locker' : lead.mimeType,
        sizeInBytes: items.reduce((sum, item) => sum + (item.sizeInBytes || 0), 0),
        category: lead.directoryCategory,
        tags: Array.from(new Set(items.flatMap((item) => item.directoryTags || []))),
        visibility: 'private',
        authMode: lead.authMode,
        linkHref: items.length > 1 ? `/file-directory/locker/${lockerId}` : `/transfer/${lead.shareId}`,
        lockerId,
        lockerName: title,
        fileCount: items.length,
        openCount: items.reduce((sum, item) => sum + (item.openCount || 0), 0),
        downloadCount: items.reduce((sum, item) => sum + (item.downloadCount || 0), 0),
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      },
    };
  });

  const fileEntries = looseFiles
    .map((entry) => ({ entry: toSearchEntry(entry), score: scoreTransfer(entry, query), updatedAt: entry.updatedAt }))
    .map((item) => ({ ...item, entry: { ...item.entry, kind: 'file', fileCount: 1 } }));

  return [...lockerEntries, ...fileEntries]
    .filter(({ score }) => !query || score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export async function getDirectoryCategories() {
  const transfers = await getFileTransfers();
  const categoryMap = new Map<string, number>();

  for (const entry of transfers) {
    const key = entry.directoryCategory?.trim();
    if (!key || entry.revokedAt) continue;
    categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
  }

  return Array.from(categoryMap.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => ({ label, count }));
}

function formatStorageMb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 * 100 ? 0 : 1).replace(/\.0$/, '')} MB`;
}

export async function getFileDirectoryStats() {
  const transfers = await getFileTransfers();
  const activeTransfers = transfers.filter((entry) => !entry.revokedAt);
  const publicTransfers = activeTransfers.filter((entry) => entry.directoryVisibility === 'public');
  const privateTransfers = activeTransfers.filter((entry) => entry.directoryVisibility !== 'public');
  const totalSizeInBytes = activeTransfers.reduce((sum, entry) => sum + (entry.sizeInBytes || 0), 0);
  const totalOpens = activeTransfers.reduce((sum, entry) => sum + (entry.openCount || 0), 0);
  const totalDownloads = activeTransfers.reduce((sum, entry) => sum + (entry.downloadCount || 0), 0);
  const uniqueCategories = new Set(activeTransfers.map((entry) => entry.directoryCategory?.trim()).filter(Boolean));

  return {
    totalFiles: activeTransfers.length,
    publicFiles: publicTransfers.length,
    privateFiles: privateTransfers.length,
    totalSizeInBytes,
    totalSizeLabel: formatStorageMb(totalSizeInBytes),
    totalOpens,
    totalDownloads,
    categoryCount: uniqueCategories.size,
  };
}
