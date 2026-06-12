import { readJsonFile, writeJsonFile, publishRegistrationsPath } from '@/lib/server/storage';

export type RegistrationKind = 'event' | 'hackathon' | 'job' | 'survey' | 'poll' | 'webinar' | 'general';

export interface PublishRegistration {
  id: string;
  kind: RegistrationKind;
  itemId: string;
  itemTitle: string;
  itemCategory: string;
  publisherUserId: string;
  registrantUserId?: string;
  registrantName: string;
  registrantEmail: string;
  registrantPhone?: string;
  registrantOrg?: string;
  message?: string;
  applicationUrl?: string;
  resumeUrl?: string;
  status: 'pending' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';
  reviewNote?: string;
  reviewedAt?: string;
  registeredAt: string;
  updatedAt: string;
}

async function read(): Promise<PublishRegistration[]> {
  return readJsonFile<PublishRegistration[]>(publishRegistrationsPath, []);
}

async function write(items: PublishRegistration[]): Promise<void> {
  await writeJsonFile(publishRegistrationsPath, items);
}

export async function getAllRegistrations(): Promise<PublishRegistration[]> {
  return read();
}

export async function getRegistrationsForItem(itemId: string): Promise<PublishRegistration[]> {
  return (await read()).filter(r => r.itemId === itemId);
}

export async function getRegistrationsByPublisher(publisherUserId: string): Promise<PublishRegistration[]> {
  return (await read()).filter(r => r.publisherUserId === publisherUserId);
}

export async function getRegistrationsByUser(registrantUserId: string): Promise<PublishRegistration[]> {
  return (await read()).filter(r => r.registrantUserId === registrantUserId);
}

export async function findDuplicate(itemId: string, registrantUserId?: string, registrantEmail?: string): Promise<PublishRegistration | null> {
  const all = await read();
  return all.find(r =>
    r.itemId === itemId &&
    (
      (registrantUserId && r.registrantUserId === registrantUserId) ||
      (registrantEmail && r.registrantEmail.toLowerCase() === registrantEmail.toLowerCase())
    )
  ) ?? null;
}

export async function createRegistration(data: Omit<PublishRegistration, 'id' | 'registeredAt' | 'updatedAt' | 'status'>): Promise<PublishRegistration> {
  const all = await read();
  const now = new Date().toISOString();
  const reg: PublishRegistration = {
    ...data,
    id: `reg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    registeredAt: now,
    updatedAt: now,
  };
  await write([reg, ...all]);
  return reg;
}

export async function updateRegistrationStatus(
  id: string,
  publisherUserId: string,
  status: PublishRegistration['status'],
  reviewNote?: string,
): Promise<PublishRegistration | null> {
  const all = await read();
  const idx = all.findIndex(r => r.id === id && r.publisherUserId === publisherUserId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], status, reviewNote, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await write(all);
  return all[idx];
}

export async function deleteRegistration(id: string, requestingUserId: string): Promise<boolean> {
  const all = await read();
  const item = all.find(r => r.id === id);
  if (!item) return false;
  if (item.publisherUserId !== requestingUserId && item.registrantUserId !== requestingUserId) return false;
  await write(all.filter(r => r.id !== id));
  return true;
}

export function registrationsToCSV(regs: PublishRegistration[]): string {
  const headers = ['ID','Item Title','Category','Kind','Name','Email','Phone','Organisation','Message','Status','Review Note','Registered At'];
  const rows = regs.map(r => [
    r.id, r.itemTitle, r.itemCategory, r.kind,
    r.registrantName, r.registrantEmail, r.registrantPhone ?? '',
    r.registrantOrg ?? '', r.message ?? '',
    r.status, r.reviewNote ?? '', new Date(r.registeredAt).toLocaleString('en-IN'),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}
