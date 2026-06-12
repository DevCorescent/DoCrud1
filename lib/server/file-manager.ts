import { FileManagerFolder } from '@/types/document';
import { fileManagerFoldersPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export async function getFileManagerFolders() {
  return readJsonFile<FileManagerFolder[]>(fileManagerFoldersPath, []);
}

export async function saveFileManagerFolders(folders: FileManagerFolder[]) {
  await writeJsonFile(fileManagerFoldersPath, folders);
}

export function normalizeFileManagerFolder(entry: Partial<FileManagerFolder>): FileManagerFolder {
  const now = new Date().toISOString();
  const id = entry.id || `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: String(entry.name || 'Untitled Folder'),
    description: entry.description ? String(entry.description) : undefined,
    colorTone: entry.colorTone || 'slate',
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
    createdBy: String(entry.createdBy || 'system'),
    createdByUserId: entry.createdByUserId ? String(entry.createdByUserId) : undefined,
    organizationId: entry.organizationId ? String(entry.organizationId) : undefined,
    organizationName: entry.organizationName ? String(entry.organizationName) : undefined,
  };
}

export async function appendFileManagerFolder(entry: Partial<FileManagerFolder>) {
  const folders = await getFileManagerFolders();
  const folder = normalizeFileManagerFolder(entry);
  await saveFileManagerFolders([folder, ...folders]);
  return folder;
}

export async function updateFileManagerFolder(
  id: string,
  updater: (entry: FileManagerFolder) => FileManagerFolder | null,
) {
  const folders = await getFileManagerFolders();
  const index = folders.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const updated = updater(folders[index]);
  if (!updated) return null;
  const next = folders.map((entry, entryIndex) => (entryIndex === index ? updated : entry));
  await saveFileManagerFolders(next);
  return updated;
}

export async function removeFileManagerFolder(id: string) {
  const folders = await getFileManagerFolders();
  const next = folders.filter((entry) => entry.id !== id);
  if (next.length === folders.length) {
    return false;
  }
  await saveFileManagerFolders(next);
  return true;
}
