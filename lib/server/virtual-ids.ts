import { getStoredUsers } from '@/lib/server/auth';
import { readJsonFile, virtualIdsPath, writeJsonFile } from '@/lib/server/storage';
import { buildQrImageUrl } from '@/lib/url';
import type { User, VirtualIdAnalyticsEvent, VirtualIdCard } from '@/types/document';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `card-${Date.now().toString(36)}`;
}

function buildQrUrl(path: string) {
  return buildQrImageUrl(path);
}

function computeAnalytics(events: VirtualIdAnalyticsEvent[]) {
  const uniqueVisitors = new Set(events.map((event) => event.visitorKey).filter(Boolean)).size;
  const openEvents = events.filter((event) => event.type === 'open');
  const scanEvents = events.filter((event) => event.type === 'scan');
  const downloadEvents = events.filter((event) => event.type === 'download');
  const sourceCounts = events.reduce<Record<string, number>>((acc, event) => {
    if (event.source) {
      acc[event.source] = (acc[event.source] || 0) + 1;
    }
    return acc;
  }, {});
  const topSource = Object.entries(sourceCounts).sort((left, right) => right[1] - left[1])[0]?.[0];

  return {
    openCount: openEvents.length,
    scanCount: scanEvents.length,
    downloadCount: downloadEvents.length,
    uniqueVisitors,
    lastOpenedAt: openEvents[0]?.createdAt,
    lastScannedAt: scanEvents[0]?.createdAt,
    lastDownloadedAt: downloadEvents[0]?.createdAt,
    topSource,
  };
}

function normalizeCard(entry: Partial<VirtualIdCard>): VirtualIdCard {
  const slug = entry.slug || slugify(entry.title || entry.ownerName || 'profile');
  const events: VirtualIdAnalyticsEvent[] = Array.isArray(entry.events)
    ? entry.events
        .map<VirtualIdAnalyticsEvent>((event) => ({
          id: event.id || createId('vid-event'),
          type: event.type === 'scan' || event.type === 'download' ? event.type : 'open',
          createdAt: event.createdAt || new Date().toISOString(),
          source: event.source,
          visitorKey: event.visitorKey,
          userAgent: event.userAgent,
        }))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    : [];

  return {
    id: entry.id || createId('vid'),
    ownerUserId: String(entry.ownerUserId || ''),
    ownerEmail: String(entry.ownerEmail || '').toLowerCase(),
    ownerName: String(entry.ownerName || 'docrud user'),
    organizationId: entry.organizationId ? String(entry.organizationId) : undefined,
    organizationName: entry.organizationName ? String(entry.organizationName) : undefined,
    title: String(entry.title || 'Virtual ID'),
    headline: entry.headline ? String(entry.headline) : undefined,
    bio: entry.bio ? String(entry.bio) : undefined,
    avatarUrl: entry.avatarUrl ? String(entry.avatarUrl) : undefined,
    company: entry.company ? String(entry.company) : undefined,
    department: entry.department ? String(entry.department) : undefined,
    roleLabel: entry.roleLabel ? String(entry.roleLabel) : undefined,
    phone: entry.phone ? String(entry.phone) : undefined,
    website: entry.website ? String(entry.website) : undefined,
    location: entry.location ? String(entry.location) : undefined,
    socialLinks: Array.isArray(entry.socialLinks)
      ? entry.socialLinks
          .map((link, index) => ({
            id: link.id || `link-${index + 1}`,
            label: String(link.label || 'Link'),
            url: String(link.url || ''),
          }))
          .filter((link) => Boolean(link.url))
      : [],
    skills: Array.isArray(entry.skills) ? entry.skills.map(String).filter(Boolean) : [],
    highlights: Array.isArray(entry.highlights) ? entry.highlights.map(String).filter(Boolean) : [],
    theme: entry.theme === 'amber' || entry.theme === 'emerald' || entry.theme === 'sky' || entry.theme === 'rose' ? entry.theme : 'slate',
    visibility: entry.visibility === 'private' ? 'private' : 'public',
    slug,
    qrUrl: buildQrUrl(`/id/${slug}`),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
    analytics: computeAnalytics(events),
    events,
  };
}

async function saveCards(cards: VirtualIdCard[]) {
  await writeJsonFile(virtualIdsPath, cards);
}

export async function getVirtualIdCards() {
  const cards = await readJsonFile<VirtualIdCard[]>(virtualIdsPath, []);
  const normalized = cards.map(normalizeCard);
  if (JSON.stringify(cards) !== JSON.stringify(normalized)) {
    await saveCards(normalized);
  }
  return normalized;
}

export async function getVisibleVirtualIdCards(actor: User) {
  const cards = await getVirtualIdCards();
  if (actor.role === 'admin') {
    return cards;
  }
  if (actor.role === 'client' || actor.role === 'member') {
    return cards.filter((card) => card.ownerUserId === actor.id || (actor.organizationId && card.organizationId === actor.organizationId) || card.organizationId === actor.id);
  }
  return cards.filter((card) => card.ownerUserId === actor.id);
}

export async function createVirtualIdCard(actor: User, input: Partial<VirtualIdCard>) {
  const cards = await getVirtualIdCards();
  const slugBase = slugify(input.title || actor.name || 'profile');
  let slug = slugBase;
  let attempt = 1;
  while (cards.some((entry) => entry.slug === slug)) {
    slug = `${slugBase}-${attempt += 1}`;
  }
  const now = new Date().toISOString();
  const created = normalizeCard({
    ...input,
    id: createId('vid'),
    slug,
    ownerUserId: actor.id,
    ownerEmail: actor.email,
    ownerName: actor.name,
    organizationId: actor.role === 'client' ? actor.id : actor.organizationId,
    organizationName: actor.organizationName,
    createdAt: now,
    updatedAt: now,
    events: [],
  });
  await saveCards([created, ...cards]);
  return created;
}

export async function updateVirtualIdCard(actor: User, cardId: string, updates: Partial<VirtualIdCard>) {
  const cards = await getVirtualIdCards();
  const current = cards.find((card) => card.id === cardId);
  if (!current) {
    throw new Error('Virtual ID not found.');
  }
  const allowed = actor.role === 'admin' || current.ownerUserId === actor.id || (actor.organizationId && current.organizationId === actor.organizationId);
  if (!allowed) {
    throw new Error('You cannot update this Virtual ID.');
  }
  const nextCards = cards.map((card) => {
    if (card.id !== cardId) return card;
    return normalizeCard({
      ...card,
      ...updates,
      id: card.id,
      slug: card.slug,
      ownerUserId: card.ownerUserId,
      ownerEmail: card.ownerEmail,
      ownerName: card.ownerName,
      organizationId: card.organizationId,
      organizationName: card.organizationName,
      events: card.events,
      updatedAt: new Date().toISOString(),
    });
  });
  await saveCards(nextCards);
  return nextCards.find((card) => card.id === cardId) || null;
}

export async function deleteVirtualIdCard(actor: User, cardId: string) {
  const cards = await getVirtualIdCards();
  const current = cards.find((card) => card.id === cardId);
  if (!current) {
    throw new Error('Virtual ID not found.');
  }
  const allowed = actor.role === 'admin' || current.ownerUserId === actor.id || (actor.organizationId && current.organizationId === actor.organizationId);
  if (!allowed) {
    throw new Error('You cannot delete this Virtual ID.');
  }
  const nextCards = cards.filter((card) => card.id !== cardId);
  await saveCards(nextCards);
}

export async function getPublicVirtualIdCard(slug: string) {
  const cards = await getVirtualIdCards();
  return cards.find((card) => card.slug === slug && card.visibility === 'public') || null;
}

export async function recordVirtualIdEvent(
  slug: string,
  event: Pick<VirtualIdAnalyticsEvent, 'type' | 'source' | 'visitorKey' | 'userAgent'>,
): Promise<VirtualIdCard | null> {
  const cards = await getVirtualIdCards();
  let updatedCard: VirtualIdCard | null = null;
  const nextCards = cards.map((card) => {
    if (card.slug !== slug) {
      return card;
    }
    const next = normalizeCard({
      ...card,
      events: [
        {
          id: createId('vid-event'),
          type: event.type,
          source: event.source,
          visitorKey: event.visitorKey,
          userAgent: event.userAgent,
          createdAt: new Date().toISOString(),
        },
        ...card.events,
      ],
      updatedAt: new Date().toISOString(),
    });
    updatedCard = next;
    return next;
  });
  await saveCards(nextCards);
  return updatedCard;
}

export async function getVirtualIdWorkspaceData(actor: User) {
  const cards = await getVisibleVirtualIdCards(actor);
  const totals = cards.reduce(
    (acc, card) => {
      acc.cards += 1;
      acc.opens += card.analytics.openCount;
      acc.scans += card.analytics.scanCount;
      acc.downloads += card.analytics.downloadCount;
      return acc;
    },
    { cards: 0, opens: 0, scans: 0, downloads: 0 },
  );

  return {
    cards,
    totals,
    suggestedProfile: {
      title: actor.name,
      headline: actor.role === 'individual' ? 'Open to work' : actor.organizationName || 'docrud workspace',
      company: actor.organizationName || '',
      roleLabel: actor.role === 'individual' ? 'Independent professional' : actor.role,
      bio: 'Share a clean digital identity with one QR and a public profile page.',
    },
  };
}

export async function getVirtualIdAdminStats() {
  const users = await getStoredUsers();
  const cards = await getVirtualIdCards();
  return {
    totalCards: cards.length,
    totalScans: cards.reduce((sum, card) => sum + card.analytics.scanCount, 0),
    totalOpens: cards.reduce((sum, card) => sum + card.analytics.openCount, 0),
    totalDownloads: cards.reduce((sum, card) => sum + card.analytics.downloadCount, 0),
    activeOwners: new Set(cards.map((card) => card.ownerUserId)).size,
    adoptionRate: users.length ? Math.round((new Set(cards.map((card) => card.ownerUserId)).size / users.length) * 100) : 0,
  };
}
