import { randomBytes } from 'crypto';
import { DocWordAccessGroup, DocWordBlock, DocWordDocument, DocWordDocumentVersion, DocWordGroupMember, DocWordSharedAccess } from '@/types/document';
import { docwordDocumentsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';
import {
  deleteDocWordRow,
  selectAllDocWordRows,
  selectDocWordRowById,
  selectDocWordRowByShareToken,
  upsertDocWordRow,
} from '@/lib/server/db/docword-rows';

type DocWordActor =
  | { type: 'user'; userId?: string; email?: string }
  | { type: 'guest'; guestId: string };

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function countWords(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words;
}

function estimateReadTime(text: string) {
  return Math.max(1, Math.ceil(countWords(text) / 220));
}

export function createDocWordBlock(type: DocWordBlock['type'] = 'paragraph', html = ''): DocWordBlock {
  const text = stripHtml(html);
  return {
    id: `dwb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    html,
    text,
  };
}

function renderBlockToHtml(block: DocWordBlock) {
  if (block.type === 'image') {
    const src = block.meta?.src?.trim();
    if (!src) return '';
    const alt = block.meta?.alt?.trim() || 'DocWord image';
    return `<figure><img src="${src}" alt="${alt}" /><figcaption>${block.html || ''}</figcaption></figure>`;
  }

  if (block.type === 'table') {
    const columns = block.meta?.columns || ['Column 1', 'Column 2'];
    const rows = block.meta?.rows || [['', ''], ['', '']];
    const headerHtml = columns.map((column) => `<th>${column}</th>`).join('');
    const rowsHtml = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
      .join('');
    return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  }

  const tag =
    block.type === 'heading-1'
      ? 'h1'
      : block.type === 'heading-2'
        ? 'h2'
        : block.type === 'heading-3'
          ? 'h3'
          : block.type === 'quote'
            ? 'blockquote'
            : block.type === 'callout'
              ? 'aside'
              : 'div';
  return `<${tag}>${block.html || ''}</${tag}>`;
}

export function buildDocWordHtml(blocks: DocWordBlock[]) {
  return blocks.map(renderBlockToHtml).join('\n');
}

function normalizeBlocks(blocks: DocWordBlock[] | undefined) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return [createDocWordBlock('paragraph', '<p>Start typing...</p>')];
  }

  return blocks.map((block) => ({
    ...block,
    text: stripHtml(block.html || block.text || ''),
  }));
}

function normalizeVersion(version: Partial<DocWordDocumentVersion>): DocWordDocumentVersion {
  return {
    id: version.id || `dwv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: version.title || 'Untitled version',
    html: version.html || '',
    plainText: version.plainText || stripHtml(version.html || ''),
    createdAt: version.createdAt || new Date().toISOString(),
    source: version.source || 'manual',
  };
}

function normalizeSharedAccess(entry: Partial<DocWordSharedAccess>): DocWordSharedAccess | null {
  const userId = entry.userId?.trim();
  const email = entry.email?.trim().toLowerCase();
  if (!userId && !email) return null;
  return {
    userId,
    email,
    addedAt: entry.addedAt || new Date().toISOString(),
    permission: entry.permission === 'write' ? 'write' : 'read',
    viaToken: entry.viaToken?.trim() || undefined,
  };
}

function normalizeGroupMember(entry: Partial<DocWordGroupMember>): DocWordGroupMember | null {
  const userId = entry.userId?.trim();
  const password = entry.password?.trim();
  if (!userId || !password) return null;
  return {
    id: entry.id || `dwgm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    name: entry.name?.trim() || undefined,
    password,
    permission: entry.permission === 'write' ? 'write' : 'read',
    addedAt: entry.addedAt || new Date().toISOString(),
  };
}

function normalizeAccessGroup(entry: Partial<DocWordAccessGroup>): DocWordAccessGroup | null {
  const name = entry.name?.trim();
  if (!name) return null;
  return {
    id: entry.id || `dwg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: entry.description?.trim() || undefined,
    createdAt: entry.createdAt || new Date().toISOString(),
    shareToken: entry.shareToken?.trim() || `dwgshare_${randomBytes(8).toString('hex')}`,
    inviteToken: entry.inviteToken?.trim() || `dwginvite_${randomBytes(8).toString('hex')}`,
    invitePermission: entry.invitePermission === 'write' ? 'write' : 'read',
    members: Array.isArray(entry.members) ? entry.members.map(normalizeGroupMember).filter(Boolean) as DocWordGroupMember[] : [],
  };
}

export function normalizeDocWordDocument(input: Partial<DocWordDocument>): DocWordDocument {
  const blocks = normalizeBlocks(input.blocks);
  const html = input.html || buildDocWordHtml(blocks);
  const plainText = input.plainText || stripHtml(html);
  const wordCount = input.wordCount || countWords(plainText);
  const readTimeMinutes = input.readTimeMinutes || estimateReadTime(plainText);

  return {
    id: input.id || `dwd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerUserId: input.ownerUserId,
    ownerEmail: input.ownerEmail,
    guestId: input.guestId,
    title: input.title?.trim() || 'Untitled document',
    emoji: input.emoji || '✍️',
    isFavorite: Boolean(input.isFavorite),
    favoriteSourceFolder: input.favoriteSourceFolder?.trim() || undefined,
    folderName: input.folderName?.trim() || 'General',
    folderLockCode: input.folderLockCode?.trim() || undefined,
    documentLockCode: input.documentLockCode?.trim() || undefined,
    templateId: input.templateId?.trim() || undefined,
    summary: input.summary?.trim() || undefined,
    documentTheme: input.documentTheme || 'classic',
    headerHtml: input.headerHtml?.trim() || undefined,
    footerHtml: input.footerHtml?.trim() || undefined,
    watermarkText: input.watermarkText?.trim() || undefined,
    requireSignature: Boolean(input.requireSignature),
    signatures: Array.isArray(input.signatures) ? input.signatures : [],
    trackChangesEnabled: Boolean(input.trackChangesEnabled),
    trackedChanges: Array.isArray(input.trackedChanges) ? input.trackedChanges : [],
    selectionComments: Array.isArray(input.selectionComments) ? input.selectionComments : [],
    blocks,
    html,
    plainText,
    wordCount,
    readTimeMinutes,
    lastAiAction: input.lastAiAction,
    shareToken: input.shareToken,
    shareMode: input.shareMode || 'private',
    sharedAccess: Array.isArray(input.sharedAccess)
      ? input.sharedAccess.map(normalizeSharedAccess).filter(Boolean) as DocWordSharedAccess[]
      : [],
    accessGroups: Array.isArray(input.accessGroups)
      ? input.accessGroups.map(normalizeAccessGroup).filter(Boolean) as DocWordAccessGroup[]
      : [],
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    versions: Array.isArray(input.versions) ? input.versions.map(normalizeVersion) : [],
  };
}

export async function getDocWordDocuments() {
  if (getDbPool()) {
    const records = await selectAllDocWordRows();
    return records.map(normalizeDocWordDocument);
  }
  const records = await readJsonFile<DocWordDocument[]>(docwordDocumentsPath, []);
  const normalized = records.map(normalizeDocWordDocument);
  if (JSON.stringify(records) !== JSON.stringify(normalized)) {
    await writeJsonFile(docwordDocumentsPath, normalized);
  }
  return normalized;
}

async function saveDocWordDocuments(records: DocWordDocument[]) {
  await writeJsonFile(docwordDocumentsPath, records);
}

function actorOwnsDocument(document: DocWordDocument, actor: DocWordActor) {
  if (actor.type === 'guest') {
    return document.guestId === actor.guestId;
  }
  return Boolean(
    (actor.userId && document.ownerUserId === actor.userId) ||
    (actor.email && document.ownerEmail?.toLowerCase() === actor.email.toLowerCase()),
  );
}

function actorHasSharedAccess(document: DocWordDocument, actor: DocWordActor) {
  if (actor.type === 'guest') return false;
  return (document.sharedAccess || []).some(
    (entry) =>
      (actor.userId && entry.userId === actor.userId) ||
      (actor.email && entry.email?.toLowerCase() === actor.email.toLowerCase()),
  );
}

function actorCanReadDocument(document: DocWordDocument, actor: DocWordActor) {
  return actorOwnsDocument(document, actor) || actorHasSharedAccess(document, actor);
}

function actorCanEditDocument(document: DocWordDocument, actor: DocWordActor) {
  if (actorOwnsDocument(document, actor)) return true;
  if (actor.type === 'guest') return false;
  return (document.sharedAccess || []).some(
    (entry) =>
      entry.permission === 'write' &&
      ((actor.userId && entry.userId === actor.userId) ||
        (actor.email && entry.email?.toLowerCase() === actor.email.toLowerCase())),
  );
}

export async function listDocWordDocumentsForActor(actor: DocWordActor) {
  const records = await getDocWordDocuments();
  return records
    .filter((document) => actorCanReadDocument(document, actor))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDocWordDocumentForActor(id: string, actor: DocWordActor) {
  const records = await getDocWordDocuments();
  return records.find((document) => document.id === id && actorCanReadDocument(document, actor)) || null;
}

export async function createDocWordDocument(
  actor: DocWordActor,
  input?: Partial<DocWordDocument>,
) {
  const now = new Date().toISOString();
  const document = normalizeDocWordDocument({
    ...input,
    ownerUserId: actor.type === 'user' ? actor.userId : undefined,
    ownerEmail: actor.type === 'user' ? actor.email : undefined,
    guestId: actor.type === 'guest' ? actor.guestId : undefined,
    createdAt: now,
    updatedAt: now,
    versions: [],
    sharedAccess: [],
  });
  if (getDbPool()) {
    await upsertDocWordRow(document);
    return document;
  }
  const records = await getDocWordDocuments();
  await saveDocWordDocuments([document, ...records]);
  return document;
}

export async function updateDocWordDocument(
  id: string,
  actor: DocWordActor,
  updates: Partial<DocWordDocument>,
  source: DocWordDocumentVersion['source'] = 'manual',
) {
  const usingDb = Boolean(getDbPool());
  const records = usingDb ? [] : await getDocWordDocuments();
  const rawCurrent = usingDb
    ? await selectDocWordRowById(id)
    : records.find((document) => document.id === id) || null;
  const current = rawCurrent ? normalizeDocWordDocument(rawCurrent) : null;
  if (!current || !actorCanEditDocument(current, actor)) {
    throw new Error('Document not found.');
  }

  const now = new Date().toISOString();
  const merged = normalizeDocWordDocument({
    ...current,
    ...updates,
    id: current.id,
    ownerUserId: current.ownerUserId,
    ownerEmail: current.ownerEmail,
    guestId: current.guestId,
    sharedAccess: current.sharedAccess,
    createdAt: current.createdAt,
    updatedAt: now,
  });

  const contentChanged = current.html !== merged.html || current.title !== merged.title;
  const nextVersions = contentChanged
    ? [
        normalizeVersion({
          title: current.title,
          html: current.html,
          plainText: current.plainText,
          createdAt: now,
          source,
        }),
        ...(current.versions || []),
      ].slice(0, 20)
    : current.versions || [];

  const nextDocument = {
    ...merged,
    versions: nextVersions,
  };

  if (usingDb) {
    await upsertDocWordRow(nextDocument);
  } else {
    await saveDocWordDocuments(records.map((document) => (document.id === id ? nextDocument : document)));
  }
  return nextDocument;
}

export async function deleteDocWordDocument(id: string, actor: DocWordActor) {
  if (getDbPool()) {
    const current = await selectDocWordRowById(id);
    if (!current || !actorOwnsDocument(current, actor)) {
      throw new Error('Document not found.');
    }
    await deleteDocWordRow(id);
    return;
  }
  const records = await getDocWordDocuments();
  const exists = records.find((document) => document.id === id && actorOwnsDocument(document, actor));
  if (!exists) {
    throw new Error('Document not found.');
  }
  await saveDocWordDocuments(records.filter((document) => document.id !== id));
}

export async function getPublicDocWordDocument(token: string) {
  if (getDbPool()) {
    const row = await selectDocWordRowByShareToken(token);
    if (!row) return null;
    const normalized = normalizeDocWordDocument(row);
    return normalized.shareMode !== 'private' ? normalized : null;
  }
  const records = await getDocWordDocuments();
  return records.find((document) => document.shareToken === token && document.shareMode !== 'private') || null;
}

export async function getDocWordDocumentByShareToken(token: string) {
  if (getDbPool()) {
    const row = await selectDocWordRowByShareToken(token);
    return row ? normalizeDocWordDocument(row) : null;
  }
  const records = await getDocWordDocuments();
  return records.find((document) => document.shareToken === token) || null;
}

export async function resolveDocWordSharedEntry(token: string) {
  const needle = token.trim();
  if (!needle) return null;
  const records = await getDocWordDocuments();
  for (const document of records) {
    if (document.shareToken === needle) {
      return {
        document,
        documentToken: document.shareToken,
        groupShareToken: undefined,
        inviteToken: undefined,
      };
    }
    const matchedGroup = (document.accessGroups || []).find((group) => group.shareToken === needle);
    if (matchedGroup) {
      return {
        document,
        documentToken: document.shareToken,
        groupShareToken: matchedGroup.shareToken,
        inviteToken: undefined,
      };
    }
    const matchedInvite = (document.accessGroups || []).find((group) => group.inviteToken === needle);
    if (matchedInvite) {
      return {
        document,
        documentToken: document.shareToken,
        groupShareToken: undefined,
        inviteToken: matchedInvite.inviteToken,
      };
    }
  }
  return null;
}

export function resolveDocWordGroupAccess(
  document: DocWordDocument,
  credentials?: { userId?: string; password?: string; groupToken?: string; inviteToken?: string },
) {
  const userId = credentials?.userId?.trim();
  const password = credentials?.password?.trim();
  if (!userId || !password) return null;

  const targetGroups =
    credentials?.groupToken?.trim()
      ? (document.accessGroups || []).filter((group) => group.shareToken === credentials.groupToken?.trim())
      : credentials?.inviteToken?.trim()
        ? (document.accessGroups || []).filter((group) => group.inviteToken === credentials.inviteToken?.trim())
        : document.accessGroups || [];

  for (const group of targetGroups) {
    const member = group.members.find((item) => item.userId === userId && item.password === password);
    if (member) {
      return {
        groupId: group.id,
        groupName: group.name,
        member,
        permission: member.permission,
      };
    }
  }

  return null;
}

export function resolveDocWordGroupByShareToken(document: DocWordDocument, shareToken?: string) {
  const token = shareToken?.trim();
  if (!token) return null;
  return (document.accessGroups || []).find((group) => group.shareToken === token) || null;
}

export function resolveDocWordGroupByInviteToken(document: DocWordDocument, inviteToken?: string) {
  const token = inviteToken?.trim();
  if (!token) return null;
  return (document.accessGroups || []).find((group) => group.inviteToken === token) || null;
}

export function createDocWordShareToken() {
  return `dwshare_${randomBytes(12).toString('hex')}`;
}

export async function registerDocWordSharedAccess(
  token: string,
  actor: Extract<DocWordActor, { type: 'user' }>,
) {
  const usingDb = Boolean(getDbPool());
  const records = usingDb ? [] : await getDocWordDocuments();
  const rawCurrent = usingDb
    ? await selectDocWordRowByShareToken(token)
    : records.find((document) => document.shareToken === token) || null;
  const current = rawCurrent && rawCurrent.shareMode !== 'private' ? normalizeDocWordDocument(rawCurrent) : null;
  if (!current) {
    throw new Error('Shared document not found.');
  }

  const normalizedEmail = actor.email?.toLowerCase();
  const exists = (current.sharedAccess || []).some(
    (entry) =>
      (actor.userId && entry.userId === actor.userId) ||
      (normalizedEmail && entry.email?.toLowerCase() === normalizedEmail),
  );
  if (exists) return current;

  const nextDocument = normalizeDocWordDocument({
    ...current,
    sharedAccess: [
      ...(current.sharedAccess || []),
      {
        userId: actor.userId,
        email: normalizedEmail,
        addedAt: new Date().toISOString(),
        permission: current.shareMode === 'write' ? 'write' : 'read',
        viaToken: token,
      },
    ],
  });

  if (usingDb) {
    await upsertDocWordRow(nextDocument);
  } else {
    await saveDocWordDocuments(records.map((document) => (document.id === current.id ? nextDocument : document)));
  }
  return nextDocument;
}

export async function updateDocWordDocumentByShareToken(
  token: string,
  updates: Partial<DocWordDocument>,
  source: DocWordDocumentVersion['source'] = 'manual',
) {
  const usingDb = Boolean(getDbPool());
  const records = usingDb ? [] : await getDocWordDocuments();
  const rawCurrent = usingDb
    ? await selectDocWordRowByShareToken(token)
    : records.find((document) => document.shareToken === token) || null;
  const current = rawCurrent ? normalizeDocWordDocument(rawCurrent) : null;
  if (!current) {
    throw new Error('Shared document not found.');
  }

  const now = new Date().toISOString();
  const merged = normalizeDocWordDocument({
    ...current,
    ...updates,
    id: current.id,
    ownerUserId: current.ownerUserId,
    ownerEmail: current.ownerEmail,
    guestId: current.guestId,
    createdAt: current.createdAt,
    updatedAt: now,
  });
  const contentChanged = current.html !== merged.html || current.title !== merged.title;
  const nextDocument = {
    ...merged,
    versions: contentChanged
      ? [
          normalizeVersion({
            title: current.title,
            html: current.html,
            plainText: current.plainText,
            createdAt: now,
            source,
          }),
          ...(current.versions || []),
        ].slice(0, 20)
      : current.versions || [],
  };

  if (usingDb) {
    await upsertDocWordRow(nextDocument);
  } else {
    await saveDocWordDocuments(records.map((document) => (document.id === current.id ? nextDocument : document)));
  }
  return nextDocument;
}

export async function joinDocWordGroupByInviteToken(
  documentToken: string,
  inviteToken: string,
  memberInput: { userId: string; name?: string; password: string },
) {
  const usingDb = Boolean(getDbPool());
  const records = usingDb ? [] : await getDocWordDocuments();
  const rawCurrent = usingDb
    ? await selectDocWordRowByShareToken(documentToken)
    : records.find((document) => document.shareToken === documentToken) || null;
  const current = rawCurrent ? normalizeDocWordDocument(rawCurrent) : null;
  if (!current) {
    throw new Error('Shared document not found.');
  }

  const targetGroup = resolveDocWordGroupByInviteToken(current, inviteToken);
  if (!targetGroup) {
    throw new Error('Invite link is no longer valid.');
  }

  const normalizedUserId = memberInput.userId.trim();
  const normalizedPassword = memberInput.password.trim();
  if (!normalizedUserId || !normalizedPassword) {
    throw new Error('User ID and password are required.');
  }

  const duplicateMember = (targetGroup.members || []).find((member) => member.userId === normalizedUserId);
  if (duplicateMember) {
    throw new Error('This user ID already exists in the group.');
  }

  const nextGroups: DocWordAccessGroup[] = (current.accessGroups || []).map((group: DocWordAccessGroup) =>
    group.id === targetGroup.id
      ? {
          ...group,
          members: [
            {
              id: `dwgm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              userId: normalizedUserId,
              name: memberInput.name?.trim() || undefined,
              password: normalizedPassword,
              permission: (group.invitePermission === 'write' ? 'write' : 'read') as DocWordGroupMember['permission'],
              addedAt: new Date().toISOString(),
            } as DocWordGroupMember,
            ...(group.members || []),
          ],
        }
      : group,
  );

  const nextDocument = normalizeDocWordDocument({
    ...current,
    accessGroups: nextGroups,
    updatedAt: new Date().toISOString(),
  });

  if (usingDb) {
    await upsertDocWordRow(nextDocument);
  } else {
    await saveDocWordDocuments(records.map((document) => (document.id === current.id ? nextDocument : document)));
  }

  return {
    document: nextDocument,
    group: resolveDocWordGroupByInviteToken(nextDocument, inviteToken),
  };
}
