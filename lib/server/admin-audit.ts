import { adminAuditPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import type { AdminAuditEvent } from '@/types/document';

type AdminAuditState = { events: AdminAuditEvent[] };

const fallback: AdminAuditState = { events: [] };

function createId(prefix = 'audit') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAdminAuditEvents(limit = 300): Promise<AdminAuditEvent[]> {
  const state = await readJsonFile<AdminAuditState>(adminAuditPath, fallback);
  const events = Array.isArray(state?.events) ? state.events : [];
  return events
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(1, Math.min(2000, Math.round(limit))));
}

export async function appendAdminAuditEvent(input: Omit<AdminAuditEvent, 'id' | 'createdAt'>) {
  const state = await readJsonFile<AdminAuditState>(adminAuditPath, fallback);
  const events = Array.isArray(state?.events) ? state.events : [];
  const event: AdminAuditEvent = {
    id: createId(),
    createdAt: new Date().toISOString(),
    ...input,
  };
  const next = [event, ...events].slice(0, 25_000);
  await writeJsonFile(adminAuditPath, { events: next });
  return event;
}

