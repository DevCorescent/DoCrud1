import { generateSharePassword } from '@/lib/server/history';
import { fileDirectoryLockersPath } from '@/lib/server/storage';
import { getFileTransfers, patchFileTransfersByLockerId, saveFileTransfers } from '@/lib/server/file-transfers';
import { getDbPool } from '@/lib/server/database';
import { readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { FileDirectoryLocker, FileDirectoryLockerHistoryEvent } from '@/types/document';

function createHistoryEvent(event: Omit<FileDirectoryLockerHistoryEvent, 'id' | 'createdAt'>): FileDirectoryLockerHistoryEvent {
  return {
    id: `locker-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...event,
  };
}

function addDays(dateIso: string, days?: number) {
  if (!days || days <= 0) return undefined;
  const date = new Date(dateIso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function generateUniqueLockerPassword(existing: FileDirectoryLocker[], preferred?: string) {
  const existingPasswords = new Set(existing.map((locker) => locker.currentPassword.trim().toUpperCase()));
  const candidate = preferred?.trim().toUpperCase();
  if (candidate && !existingPasswords.has(candidate)) {
    return candidate;
  }
  let password = '';
  do {
    password = generateSharePassword();
  } while (existingPasswords.has(password));
  return password;
}

export async function getFileLockers() {
  return readJsonFile<FileDirectoryLocker[]>(fileDirectoryLockersPath, []);
}

export async function saveFileLockers(lockers: FileDirectoryLocker[]) {
  await writeJsonFile(fileDirectoryLockersPath, lockers);
}

export async function rotateLockerPassword(lockerId: string, options: {
  actorUserId?: string;
  actorName?: string;
  nextPassword?: string;
  rotationDays?: number;
}) {
  const usingDb = Boolean(getDbPool());
  const [lockers, transfers] = await Promise.all([getFileLockers(), usingDb ? Promise.resolve([]) : getFileTransfers()]);
  const index = lockers.findIndex((locker) => locker.id === lockerId);
  if (index === -1) return null;

  const now = new Date().toISOString();
  const current = lockers[index];
  const nextPassword = generateUniqueLockerPassword(lockers.filter((_, itemIndex) => itemIndex !== index), options.nextPassword);
  const updatedLocker: FileDirectoryLocker = {
    ...current,
    currentPassword: nextPassword,
    passwordVersion: (current.passwordVersion || 1) + 1,
    passwordRotationDays: options.rotationDays !== undefined ? options.rotationDays : current.passwordRotationDays,
    passwordLastChangedAt: now,
    lastRotationDueAt: addDays(now, options.rotationDays !== undefined ? options.rotationDays : current.passwordRotationDays),
    updatedAt: now,
    history: [
      createHistoryEvent({
        type: 'password_changed',
        actorName: options.actorName,
        actorUserId: options.actorUserId,
        note: `Locker password rotated to version ${(current.passwordVersion || 1) + 1}. Existing access was revoked automatically.`,
      }),
      ...(current.history || []),
    ],
  };

  const nextLockers = lockers.map((locker, itemIndex) => itemIndex === index ? updatedLocker : locker);

  if (usingDb) {
    await Promise.all([
      saveFileLockers(nextLockers),
      patchFileTransfersByLockerId(lockerId, { accessPassword: nextPassword }),
    ]);
  } else {
    const nextTransfers = transfers.map((transfer) => (
      transfer.lockerId === lockerId
        ? { ...transfer, accessPassword: nextPassword, updatedAt: now }
        : transfer
    ));
    await Promise.all([saveFileLockers(nextLockers), saveFileTransfers(nextTransfers)]);
  }
  return updatedLocker;
}

export async function ensureLockerRotation(locker: FileDirectoryLocker) {
  if (!locker.passwordRotationDays || !locker.lastRotationDueAt) {
    return locker;
  }
  if (new Date(locker.lastRotationDueAt).getTime() > Date.now()) {
    return locker;
  }
  const rotated = await rotateLockerPassword(locker.id, {
    actorName: 'Auto rotation',
    actorUserId: locker.ownerUserId,
    rotationDays: locker.passwordRotationDays,
  });
  return rotated || locker;
}

export async function getVisibleLockersForUser(options: {
  role?: string;
  userId?: string;
  email?: string;
}) {
  const lockers = await getFileLockers();
  const filtered = options.role === 'admin'
    ? lockers
    : options.role === 'client'
      ? lockers.filter((locker) => locker.ownerUserId === options.userId || locker.ownerEmail.toLowerCase() === (options.email || '').toLowerCase() || locker.organizationId === options.userId)
      : lockers.filter((locker) => locker.ownerEmail.toLowerCase() === (options.email || '').toLowerCase());

  return Promise.all(filtered.map((locker) => ensureLockerRotation(locker)));
}

export async function getFileLockerById(lockerId: string) {
  const lockers = await getFileLockers();
  const locker = lockers.find((item) => item.id === lockerId);
  if (!locker) return null;
  return ensureLockerRotation(locker);
}

export async function createFileLocker(input: {
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  organizationId?: string;
  organizationName?: string;
  name: string;
  description?: string;
  category?: string;
  password?: string;
  passwordRotationDays?: number;
}) {
  const lockers = await getFileLockers();
  const now = new Date().toISOString();
  const locker: FileDirectoryLocker = {
    id: `locker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerUserId: input.ownerUserId,
    ownerEmail: input.ownerEmail,
    ownerName: input.ownerName,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    category: input.category?.trim() || undefined,
    currentPassword: generateUniqueLockerPassword(lockers, input.password),
    passwordVersion: 1,
    passwordRotationDays: input.passwordRotationDays,
    passwordLastChangedAt: now,
    lastRotationDueAt: addDays(now, input.passwordRotationDays),
    fileTransferIds: [],
    createdAt: now,
    updatedAt: now,
    history: [
      createHistoryEvent({
        type: 'created',
        actorName: input.ownerName,
        actorUserId: input.ownerUserId,
        note: 'Locker created and ready for multi-file publishing.',
      }),
    ],
  };
  await saveFileLockers([locker, ...lockers]);
  return locker;
}

export async function attachFileToLocker(lockerId: string, transferId: string, options: {
  actorName?: string;
  actorUserId?: string;
  fileName: string;
}) {
  const lockers = await getFileLockers();
  const index = lockers.findIndex((locker) => locker.id === lockerId);
  if (index === -1) return null;
  const now = new Date().toISOString();
  const locker = lockers[index];
  const updated: FileDirectoryLocker = {
    ...locker,
    fileTransferIds: Array.from(new Set([transferId, ...locker.fileTransferIds])),
    updatedAt: now,
    history: [
      createHistoryEvent({
        type: 'file_added',
        actorName: options.actorName,
        actorUserId: options.actorUserId,
        note: `${options.fileName} added to locker.`,
      }),
      ...(locker.history || []),
    ],
  };
  const next = lockers.map((item, itemIndex) => itemIndex === index ? updated : item);
  await saveFileLockers(next);
  return updated;
}

export async function updateLockerSettings(lockerId: string, updates: {
  actorName?: string;
  actorUserId?: string;
  name?: string;
  description?: string;
  category?: string;
  passwordRotationDays?: number;
}) {
  const lockers = await getFileLockers();
  const index = lockers.findIndex((locker) => locker.id === lockerId);
  if (index === -1) return null;
  const locker = lockers[index];
  const now = new Date().toISOString();
  const updated: FileDirectoryLocker = {
    ...locker,
    name: updates.name !== undefined ? updates.name.trim() || locker.name : locker.name,
    description: updates.description !== undefined ? updates.description.trim() || undefined : locker.description,
    category: updates.category !== undefined ? updates.category.trim() || undefined : locker.category,
    passwordRotationDays: updates.passwordRotationDays !== undefined ? updates.passwordRotationDays : locker.passwordRotationDays,
    lastRotationDueAt: addDays(locker.passwordLastChangedAt, updates.passwordRotationDays !== undefined ? updates.passwordRotationDays : locker.passwordRotationDays),
    updatedAt: now,
    history: updates.passwordRotationDays !== undefined
      ? [
          createHistoryEvent({
            type: 'rotation_updated',
            actorName: updates.actorName,
            actorUserId: updates.actorUserId,
            note: `Password rotation set to every ${updates.passwordRotationDays} day(s).`,
          }),
          ...(locker.history || []),
        ]
      : locker.history,
  };
  const next = lockers.map((item, itemIndex) => itemIndex === index ? updated : item);
  await saveFileLockers(next);
  return updated;
}
