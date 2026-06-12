import { socialEventsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';

export type SocialEventType = 'follow' | 'profile_view' | 'like' | 'comment' | 'mention' | 'gig_applied' | 'document_viewed';

export interface SocialEvent {
  id: string;
  type: SocialEventType;
  actorId: string;
  actorName: string;
  actorAvatar?: string;
  actorHeadline?: string;
  targetUserId: string;
  resourceId?: string;
  resourceTitle?: string;
  excerpt?: string;
  href?: string;
  createdAt: string;
}

type SocialEventsData = { events: SocialEvent[] };
const empty: SocialEventsData = { events: [] };

const MAX_EVENTS = 500;

function rowToEvent(row: Record<string, unknown>): SocialEvent {
  return {
    id: row.id as string,
    type: row.type as SocialEventType,
    actorId: row.actor_id as string,
    actorName: row.actor_name as string,
    actorAvatar: (row.actor_avatar as string | null) ?? undefined,
    actorHeadline: (row.actor_headline as string | null) ?? undefined,
    targetUserId: row.target_user_id as string,
    resourceId: (row.resource_id as string | null) ?? undefined,
    resourceTitle: (row.resource_title as string | null) ?? undefined,
    excerpt: (row.excerpt as string | null) ?? undefined,
    href: (row.href as string | null) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export async function getSocialEvents(): Promise<SocialEventsData> {
  return readJsonFile<SocialEventsData>(socialEventsPath, empty);
}

export async function addSocialEvent(event: Omit<SocialEvent, 'id' | 'createdAt'>): Promise<SocialEvent> {
  const id = `se_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const newEvent: SocialEvent = { ...event, id, createdAt };

  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `INSERT INTO social_events (id, type, actor_id, actor_name, actor_avatar, actor_headline, target_user_id, resource_id, resource_title, excerpt, href, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, event.type, event.actorId, event.actorName, event.actorAvatar ?? null,
        event.actorHeadline ?? null, event.targetUserId, event.resourceId ?? null,
        event.resourceTitle ?? null, event.excerpt ?? null, event.href ?? null, createdAt]
    );
  } else {
    const data = await getSocialEvents();
    data.events = [newEvent, ...data.events].slice(0, MAX_EVENTS);
    await writeJsonFile(socialEventsPath, data);
  }

  void sendEventEmail(newEvent).catch(() => {});
  return newEvent;
}

async function sendEventEmail(event: SocialEvent): Promise<void> {
  try {
    const [{ getStoredUsers }, { sendNotificationEmail }] = await Promise.all([
      import('@/lib/server/users'),
      import('@/lib/server/notification-emails'),
    ]);

    const users = await getStoredUsers();
    const target = users.find((u) => u.id === event.targetUserId);
    if (!target || !target.email) return;

    const prefs = target.emailPreferences ?? {};
    const defaultOn = !['profile_view', 'document_viewed'].includes(event.type);

    const prefKeyMap: Partial<Record<SocialEventType, keyof NonNullable<typeof target.emailPreferences>>> = {
      follow: 'follows',
      like: 'likes',
      comment: 'comments',
      mention: 'mentions',
      gig_applied: 'gig_applied',
    };
    const prefKey = prefKeyMap[event.type];
    const enabled = prefKey !== undefined && prefKey in prefs ? prefs[prefKey] : defaultOn;
    if (!enabled) return;

    await sendNotificationEmail({
      to: target.email,
      recipientName: target.name || target.email,
      type: event.type,
      actorName: event.actorName,
      actorId: event.actorId,
      resourceTitle: event.resourceTitle,
      resourceId: event.resourceId,
      excerpt: event.excerpt,
      href: event.href,
    });
  } catch {
    // non-critical
  }
}

export async function getSocialEventsForUser(userId: string): Promise<SocialEvent[]> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM social_events WHERE target_user_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [userId]
    );
    return result.rows.map(rowToEvent);
  }
  const data = await getSocialEvents();
  return data.events.filter((e) => e.targetUserId === userId).slice(0, 60);
}

export async function getDeduplicatedSocialEventsForUser(userId: string): Promise<SocialEvent[]> {
  const events = await getSocialEventsForUser(userId);
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.type}:${e.actorId}:${e.resourceId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
