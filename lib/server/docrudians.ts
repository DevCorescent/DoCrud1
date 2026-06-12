import { buildQrImageUrl } from '@/lib/url';
import { docrudiansPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import type {
  DocrudianAttachment,
  DocrudianRoomActivity,
  DocrudianCircle,
  DocrudianOpportunity,
  DocrudianPost,
  DocrudianProfile,
  DocrudiansWorkspaceData,
  User,
} from '@/types/document';

type DocrudiansRepository = {
  profiles: DocrudianProfile[];
  posts: DocrudianPost[];
  circles: DocrudianCircle[];
  opportunities: DocrudianOpportunity[];
};

type JoinRoomOptions = {
  accessCode?: string;
};

type TrackRoomEventInput = {
  roomId: string;
  type: DocrudianRoomActivity['type'];
  actorName?: string;
  actorUserId?: string;
  resourceId?: string;
  resourceName?: string;
  note?: string;
};

const emptyRepository: DocrudiansRepository = {
  profiles: [
    {
      id: 'seed-profile-1',
      userId: 'seed-user-1',
      email: 'rooms@docrud.app',
      name: 'Aarav Mehta',
      organizationName: 'Orbit Ops Studio',
      accountType: 'individual',
      headline: 'Builds useful rooms for teams and communities.',
      bio: 'I use Docrudians rooms for launches, collabs, and knowledge sharing.',
      location: 'Bengaluru',
      domain: 'Operations',
      skills: ['Rooms', 'Operations', 'Collaboration'],
      interests: ['Community', 'Systems', 'Knowledge sharing'],
      lookingFor: ['collaborators', 'community'],
      badges: ['Builder'],
      links: [],
      visibility: 'public',
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-01T10:00:00.000Z',
    },
  ],
  circles: [
    {
      id: 'seed-room-1',
      slug: 'dev-ship-room',
      ownerUserId: 'seed-user-1',
      ownerName: 'Aarav Mehta',
      title: 'Dev Ship Room',
      description: 'A public build room for developers sharing updates, docs, and launch resources.',
      category: 'developers',
      visibility: 'public',
      useCase: 'developer',
      tags: ['developers', 'ship', 'resources'],
      featureFlags: ['resources', 'invite_link', 'compression', 'announcements'],
      shareLink: '/docrudians/room/seed-room-1',
      memberUserIds: ['seed-user-1'],
      joinRequests: [],
      resources: [
        {
          id: 'seed-room-resource-1',
          type: 'document',
          name: 'Launch checklist.pdf',
          url: 'data:text/plain;charset=utf-8,Launch%20checklist%0A-%20Open%20the%20room%0A-%20Share%20the%20link%0A-%20Drop%20the%20resources%0A-%20Track%20who%20opened%20and%20downloaded',
          mimeType: 'text/plain',
          sizeLabel: '1 KB',
        },
      ],
      activity: [],
      createdAt: '2026-04-02T10:00:00.000Z',
      updatedAt: '2026-04-02T10:00:00.000Z',
    },
    {
      id: 'seed-room-2',
      slug: 'college-fest-core-room',
      ownerUserId: 'seed-user-1',
      ownerName: 'Aarav Mehta',
      title: 'College Fest Core Room',
      description: 'A private room for student coordinators to collect docs, posters, and execution plans.',
      category: 'colleges',
      visibility: 'private',
      useCase: 'college',
      tags: ['college', 'events', 'coordination'],
      featureFlags: ['resources', 'invite_link', 'submissions', 'compression'],
      shareLink: '/docrudians/room/seed-room-2',
      accessCode: 'FEST2026',
      memberUserIds: ['seed-user-1'],
      joinRequests: [],
      resources: [],
      activity: [],
      createdAt: '2026-04-03T10:00:00.000Z',
      updatedAt: '2026-04-03T10:00:00.000Z',
    },
  ],
  posts: [
    {
      id: 'seed-post-1',
      roomId: 'seed-room-1',
      authorUserId: 'seed-user-1',
      authorName: 'Aarav Mehta',
      authorHeadline: 'Builds useful rooms for teams and communities.',
      visibility: 'public',
      attachments: [],
      title: 'Starter pack added for this week',
      content: 'Dropped a reusable launch checklist and clean docs pack for builders shipping this weekend.',
      category: 'showcase',
      tags: ['docs', 'launch'],
      createdAt: '2026-04-03T10:00:00.000Z',
    },
  ],
  opportunities: [],
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizeText(value?: string) {
  return String(value || '').trim();
}

function normalizeList(value?: string[] | null) {
  return Array.from(new Set((value || []).map((item) => normalizeText(item)).filter(Boolean)));
}

function normalizeAttachments(value?: DocrudianAttachment[] | null) {
  return Array.isArray(value)
    ? value
        .map((item, index): DocrudianAttachment => ({
          id: item.id || `attachment-${index + 1}`,
          type: item.type === 'document' || item.type === 'link' ? item.type : 'image',
          name: normalizeText(item.name) || `Attachment ${index + 1}`,
          url: normalizeText(item.url),
          mimeType: normalizeText(item.mimeType) || undefined,
          sizeLabel: normalizeText(item.sizeLabel) || undefined,
          shareUrl: normalizeText(item.shareUrl) || undefined,
          qrUrl: normalizeText(item.qrUrl) || undefined,
        }))
        .filter((item) => item.url)
    : [];
}

function enrichRoomAttachment(roomId: string, attachment: DocrudianAttachment) {
  const shareUrl = attachment.shareUrl || `/docrudians/room/${roomId}/file/${attachment.id}`;
  return {
    ...attachment,
    shareUrl,
    qrUrl: attachment.qrUrl || buildQrImageUrl(shareUrl),
  };
}

function enrichRoomAttachments(roomId: string, attachments?: DocrudianAttachment[] | null) {
  return normalizeAttachments(attachments).map((attachment) => enrichRoomAttachment(roomId, attachment));
}

function normalizeCategory(value?: string): DocrudianCircle['category'] {
  switch (value) {
    case 'developers':
    case 'students':
    case 'colleges':
    case 'events':
    case 'founders':
    case 'freelance':
    case 'builders':
    case 'operators':
    case 'hiring':
      return value;
    default:
      return 'builders';
  }
}

function normalizeUseCase(value?: string): DocrudianCircle['useCase'] {
  switch (value) {
    case 'developer':
    case 'student':
    case 'college':
    case 'event':
    case 'startup':
    case 'team':
      return value;
    default:
      return 'team';
  }
}

function normalizeRoom(entry: DocrudianCircle): DocrudianCircle {
  const roomId = entry.id;
  return {
    ...entry,
    slug: normalizeText(entry.slug) || slugify(entry.title) || entry.id,
    category: normalizeCategory(entry.category),
    visibility: entry.visibility === 'private' ? 'private' : 'public',
    useCase: normalizeUseCase(entry.useCase),
    tags: normalizeList(entry.tags),
    featureFlags: Array.isArray(entry.featureFlags)
      ? entry.featureFlags.filter((flag) =>
          ['compression', 'announcements', 'resources', 'invite_link', 'submissions'].includes(flag),
        )
      : ['resources', 'invite_link'],
    shareLink: normalizeText(entry.shareLink) || `/docrudians/room/${entry.id}`,
    accessCode: entry.visibility === 'private' ? normalizeText(entry.accessCode) || undefined : undefined,
    memberUserIds: Array.from(new Set(entry.memberUserIds || [])),
    joinRequests: Array.from(new Set(entry.joinRequests || [])),
	    resources: enrichRoomAttachments(roomId, entry.resources),
	    activity: Array.isArray(entry.activity)
	      ? entry.activity
	          .map((item, index): DocrudianRoomActivity => ({
	            id: item.id || `activity-${index + 1}`,
	            type:
	              item.type === 'join' || item.type === 'file_open' || item.type === 'download' || item.type === 'share'
	                ? item.type
	                : 'view',
	            createdAt: normalizeText(item.createdAt) || new Date().toISOString(),
	            actorName: normalizeText(item.actorName) || undefined,
	            actorUserId: normalizeText(item.actorUserId) || undefined,
	            resourceId: normalizeText(item.resourceId) || undefined,
	            resourceName: normalizeText(item.resourceName) || undefined,
	            note: normalizeText(item.note) || undefined,
	          }))
	          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
	      : [],
	  };
}

async function saveRepository(data: DocrudiansRepository) {
  await writeJsonFile(docrudiansPath, data);
}

export async function getDocrudiansRepository(): Promise<DocrudiansRepository> {
  const stored = await readJsonFile<Partial<DocrudiansRepository>>(docrudiansPath, emptyRepository);
  return {
    profiles: Array.isArray(stored.profiles) ? (stored.profiles as DocrudianProfile[]) : [],
    posts: Array.isArray(stored.posts)
      ? stored.posts.map((post): DocrudianPost => ({
          ...post,
          roomId: normalizeText(post.roomId) || undefined,
          visibility: post.visibility === 'members' ? 'members' : 'public',
          attachments: normalizeAttachments(post.attachments),
        }))
      : [],
    circles: Array.isArray(stored.circles) ? stored.circles.map(normalizeRoom) : [],
    opportunities: Array.isArray(stored.opportunities)
      ? stored.opportunities.map((item): DocrudianOpportunity => ({
          ...item,
          visibility: item.visibility === 'members' ? 'members' : 'public',
        }))
      : [],
  };
}

function buildStats(repository: DocrudiansRepository, visibleRooms?: DocrudianCircle[]) {
  const rooms = visibleRooms || repository.circles;
  return {
    members: repository.profiles.length,
    posts: repository.posts.length,
    circles: rooms.length,
    opportunities: repository.opportunities.filter((item) => item.status === 'open').length,
    matchingCircles: rooms.length,
    privateRooms: rooms.filter((item) => item.visibility === 'private').length,
    publicRooms: rooms.filter((item) => item.visibility === 'public').length,
    sharedResources: rooms.reduce((count, room) => count + (room.resources?.length || 0), 0),
  };
}

export async function getPublicDocrudiansData() {
  const repository = await getDocrudiansRepository();
  const publicRooms = repository.circles
    .filter((room) => room.visibility === 'public')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const publicPosts = repository.posts
    .filter((post) => post.visibility === 'public' && (!post.roomId || publicRooms.some((room) => room.id === post.roomId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    profiles: repository.profiles.filter((profile) => profile.visibility === 'public').slice(0, 12),
    posts: publicPosts.slice(0, 18),
    circles: publicRooms.slice(0, 20),
    opportunities: [],
    stats: buildStats(repository, publicRooms),
  };
}

export async function getPublicDocrudiansRoom(roomIdOrSlug: string) {
  const repository = await getDocrudiansRepository();
  const room = repository.circles.find((entry) => entry.id === roomIdOrSlug || entry.slug === roomIdOrSlug);
  if (!room) return null;
  const posts = repository.posts
    .filter((entry) => entry.roomId === room.id && (room.visibility === 'public' ? entry.visibility === 'public' : true))
    .map((entry) => ({
      ...entry,
      attachments: enrichRoomAttachments(room.id, entry.attachments),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const roomActivity = room.activity || [];
  return {
    room,
    posts,
    analytics: {
      views: roomActivity.filter((item) => item.type === 'view').length,
      joins: roomActivity.filter((item) => item.type === 'join').length,
      fileOpens: roomActivity.filter((item) => item.type === 'file_open').length,
      downloads: roomActivity.filter((item) => item.type === 'download').length,
      activity: roomActivity.slice(0, 24),
    },
  };
}

export async function getPublicDocrudiansRoomFile(roomIdOrSlug: string, fileId: string) {
  const payload = await getPublicDocrudiansRoom(roomIdOrSlug);
  if (!payload) return null;
  const fromRoom = (payload.room.resources || []).find((attachment) => attachment.id === fileId);
  if (fromRoom) {
    return { room: payload.room, attachment: enrichRoomAttachment(payload.room.id, fromRoom) };
  }
  for (const post of payload.posts) {
    const fromPost = (post.attachments || []).find((attachment) => attachment.id === fileId);
    if (fromPost) {
      return { room: payload.room, attachment: enrichRoomAttachment(payload.room.id, fromPost), post };
    }
  }
  return null;
}

export async function getDocrudiansWorkspaceData(actor: User): Promise<DocrudiansWorkspaceData> {
  const repository = await getDocrudiansRepository();
  const profile = repository.profiles.find((entry) => entry.userId === actor.id) || null;
  const visibleRooms = repository.circles.filter(
    (entry) => entry.visibility === 'public' || entry.ownerUserId === actor.id || entry.memberUserIds.includes(actor.id),
  );
  const visibleRoomIds = new Set(visibleRooms.map((item) => item.id));
  const visiblePosts = repository.posts.filter(
    (entry) =>
      (!entry.roomId || visibleRoomIds.has(entry.roomId)) &&
      (entry.visibility === 'public' || entry.authorUserId === actor.id || visibleRooms.some((room) => room.id === entry.roomId && room.memberUserIds.includes(actor.id))),
  );

  return {
    profile,
    profiles: repository.profiles.filter((entry) => entry.visibility === 'public' || entry.userId === actor.id).slice(0, 20),
    posts: visiblePosts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40),
    circles: visibleRooms.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30),
    opportunities: [],
    stats: buildStats(repository, visibleRooms),
  };
}

export async function upsertDocrudianProfile(actor: User, input: Partial<DocrudianProfile>) {
  const repository = await getDocrudiansRepository();
  const existing = repository.profiles.find((entry) => entry.userId === actor.id);
  const now = new Date().toISOString();

  const nextProfile: DocrudianProfile = {
    id: existing?.id || createId('docrudian-profile'),
    userId: actor.id,
    email: actor.email,
    name: actor.name,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    accountType: actor.accountType,
    headline:
      normalizeText(input.headline) ||
      existing?.headline ||
      (actor.accountType === 'business' ? 'Runs trusted rooms for teams and communities.' : 'Shares useful work through focused rooms.'),
    bio: normalizeText(input.bio) || existing?.bio || 'Building, sharing, and growing with secure rooms inside docrud.',
    location: normalizeText(input.location) || existing?.location,
    domain: normalizeText(input.domain) || existing?.domain,
    skills: normalizeList(input.skills || existing?.skills),
    interests: normalizeList(input.interests || existing?.interests),
    lookingFor: Array.isArray(input.lookingFor) && input.lookingFor.length ? input.lookingFor : existing?.lookingFor || ['community'],
    badges: normalizeList(input.badges || existing?.badges),
    links: Array.isArray(input.links)
      ? input.links
          .filter((item) => normalizeText(item.url))
          .map((item, index) => ({
            id: item.id || `link-${index + 1}`,
            label: normalizeText(item.label) || 'Link',
            url: normalizeText(item.url),
          }))
      : existing?.links || [],
    visibility: input.visibility === 'members' ? 'members' : existing?.visibility || 'public',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const profiles = existing
    ? repository.profiles.map((entry) => (entry.userId === actor.id ? nextProfile : entry))
    : [nextProfile, ...repository.profiles];
  await saveRepository({ ...repository, profiles });
  return nextProfile;
}

export async function createDocrudiansPost(actor: User, input: Partial<DocrudianPost>) {
  const repository = await getDocrudiansRepository();
  const profile = repository.profiles.find((entry) => entry.userId === actor.id);
  const roomId = normalizeText(input.roomId);

  if (roomId) {
    const room = repository.circles.find((entry) => entry.id === roomId);
    if (!room) {
      throw new Error('Room not found.');
    }
    const canPost = room.ownerUserId === actor.id || room.memberUserIds.includes(actor.id) || room.visibility === 'public';
    if (!canPost) {
      throw new Error('You do not have access to post in this room.');
    }
  }

  const created: DocrudianPost = {
    id: createId('docrudian-post'),
    roomId: roomId || undefined,
    authorUserId: actor.id,
    authorName: actor.name,
    authorHeadline: profile?.headline,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    visibility: input.visibility === 'members' ? 'members' : 'public',
    attachments: normalizeAttachments(input.attachments),
    title: normalizeText(input.title) || 'Untitled update',
    content: normalizeText(input.content),
    category: input.category === 'help' || input.category === 'showcase' || input.category === 'idea' || input.category === 'collab' ? input.category : 'win',
    tags: normalizeList(input.tags),
    createdAt: new Date().toISOString(),
  };
  await saveRepository({ ...repository, posts: [created, ...repository.posts] });
  return created;
}

export async function createDocrudiansCircle(actor: User, input: Partial<DocrudianCircle>) {
  const repository = await getDocrudiansRepository();
  const roomId = createId('docrudian-room');
  const now = new Date().toISOString();
  const title = normalizeText(input.title) || 'Untitled room';
  const created: DocrudianCircle = normalizeRoom({
    id: roomId,
    slug: slugify(title),
    ownerUserId: actor.id,
    ownerName: actor.name,
    organizationId: actor.organizationId,
    title,
    description: normalizeText(input.description),
    category: normalizeCategory(input.category),
    visibility: input.visibility === 'private' ? 'private' : 'public',
    coverImageUrl: normalizeText(input.coverImageUrl) || undefined,
    tags: normalizeList(input.tags),
    useCase: normalizeUseCase(input.useCase),
    featureFlags: Array.isArray(input.featureFlags) && input.featureFlags.length ? input.featureFlags : ['resources', 'invite_link', 'compression'],
    shareLink: `/docrudians/room/${roomId}`,
    accessCode: input.visibility === 'private' ? normalizeText(input.accessCode) || undefined : undefined,
    memberUserIds: Array.from(new Set([actor.id, ...(input.memberUserIds || [])])),
    joinRequests: [],
    resources: normalizeAttachments(input.resources),
    activity: [],
    createdAt: now,
    updatedAt: now,
  });
  await saveRepository({ ...repository, circles: [created, ...repository.circles] });
  return created;
}

export async function joinDocrudiansCircle(actor: User, circleId: string, options?: JoinRoomOptions) {
  const repository = await getDocrudiansRepository();
  const room = repository.circles.find((entry) => entry.id === circleId || entry.slug === circleId);
  if (!room) {
    throw new Error('Room not found.');
  }
  if (room.visibility === 'private' && normalizeText(room.accessCode) && normalizeText(options?.accessCode) !== normalizeText(room.accessCode)) {
    throw new Error('Invalid room access code.');
  }

  const circles = repository.circles.map((entry) => {
    if (entry.id !== room.id) return entry;
	    return normalizeRoom({
	      ...entry,
	      memberUserIds: Array.from(new Set([actor.id, ...entry.memberUserIds])),
	      activity: ([
	        {
	          id: createId('room-activity'),
	          type: 'join',
	          createdAt: new Date().toISOString(),
	          actorName: actor.name,
	          actorUserId: actor.id,
	          note: 'Joined via room link',
	        } as DocrudianRoomActivity,
	        ...(entry.activity || []),
	      ] as DocrudianRoomActivity[]).slice(0, 100),
	      updatedAt: new Date().toISOString(),
	    });
	  });
  await saveRepository({ ...repository, circles });
  return circles.find((entry) => entry.id === room.id) || null;
}

export async function addDocrudiansRoomResource(actor: User, circleId: string, resource: DocrudianAttachment) {
  const repository = await getDocrudiansRepository();
  const room = repository.circles.find((entry) => entry.id === circleId);
  if (!room) {
    throw new Error('Room not found.');
  }
  if (!(room.ownerUserId === actor.id || room.memberUserIds.includes(actor.id))) {
    throw new Error('Only room members can add resources.');
  }

  const attachment = normalizeAttachments([resource])[0];
  if (!attachment) {
    throw new Error('A valid resource is required.');
  }

  const circles = repository.circles.map((entry) => {
    if (entry.id !== circleId) return entry;
	    return normalizeRoom({
	      ...entry,
	      resources: [attachment, ...(entry.resources || [])].slice(0, 24),
	      activity: ([
	        {
	          id: createId('room-activity'),
	          type: 'share',
	          createdAt: new Date().toISOString(),
	          actorName: actor.name,
	          actorUserId: actor.id,
	          resourceId: attachment.id,
	          resourceName: attachment.name,
	          note: 'Added a room resource',
	        } as DocrudianRoomActivity,
	        ...(entry.activity || []),
	      ] as DocrudianRoomActivity[]).slice(0, 100),
	      updatedAt: new Date().toISOString(),
	    });
	  });
  await saveRepository({ ...repository, circles });
  return circles.find((entry) => entry.id === circleId) || null;
}

export async function createDocrudiansOpportunity(actor: User, input: Partial<DocrudianOpportunity>) {
  const repository = await getDocrudiansRepository();
  const created: DocrudianOpportunity = {
    id: createId('docrudian-opportunity'),
    createdByUserId: actor.id,
    createdByName: actor.name,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    visibility: input.visibility === 'members' ? 'members' : 'public',
    title: normalizeText(input.title) || 'Untitled opportunity',
    type: input.type === 'gig' || input.type === 'collab' || input.type === 'mentor' || input.type === 'event' ? input.type : 'job',
    summary: normalizeText(input.summary),
    skills: normalizeList(input.skills),
    location: normalizeText(input.location),
    link: normalizeText(input.link),
    status: input.status === 'closed' ? 'closed' : 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveRepository({ ...repository, opportunities: [created, ...repository.opportunities] });
  return created;
}

export async function trackDocrudiansRoomEvent(input: TrackRoomEventInput) {
  const repository = await getDocrudiansRepository();
  const room = repository.circles.find((entry) => entry.id === input.roomId || entry.slug === input.roomId);
  if (!room) {
    throw new Error('Room not found.');
  }

  const activity: DocrudianRoomActivity = {
    id: createId('room-activity'),
    type: input.type,
    createdAt: new Date().toISOString(),
    actorName: normalizeText(input.actorName) || undefined,
    actorUserId: normalizeText(input.actorUserId) || undefined,
    resourceId: normalizeText(input.resourceId) || undefined,
    resourceName: normalizeText(input.resourceName) || undefined,
    note: normalizeText(input.note) || undefined,
  };

  const circles = repository.circles.map((entry) => {
    if (entry.id !== room.id) return entry;
    return normalizeRoom({
      ...entry,
      activity: [activity, ...(entry.activity || [])].slice(0, 100),
      updatedAt: entry.updatedAt,
    });
  });
  await saveRepository({ ...repository, circles });
  return activity;
}
