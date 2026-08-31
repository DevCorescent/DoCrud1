/**
 * Compose drafts.
 *
 * A draft is a campaign that has not been sent yet, so this deliberately does
 * NOT introduce a parallel entity: it stores the composer's working state and
 * hands it to the existing campaign system when the admin sends or schedules.
 * Keeping drafts separate from `mail_campaigns` avoids polluting the campaign
 * list with half-written messages, while the shape stays close enough that
 * promotion is a straight mapping.
 *
 * Persistence is the project's standard three-tier storage, so this works with
 * MongoDB when configured and local JSON otherwise. Writes go through
 * `withStorageLock` because the document is read-modify-written and autosave
 * can overlap a manual save — the same hazard that lost outbox rows.
 */
import {
  readJsonFile, writeJsonFile, mailDraftsPath, withStorageLock,
} from '@/lib/server/storage';
import { sanitizeEmailHtml } from '@/lib/security/email-html-sanitizer';
import { emailHtmlToText } from '@/lib/email/html-to-text';

export interface MailDraftAttachment {
  filename: string;
  /** Bytes, for display and validation. */
  size: number;
  contentType: string;
  /** Where the file lives; never a local filesystem path. */
  url: string;
}

export interface MailDraft {
  id: string;
  subject: string;
  /** ALWAYS sanitized before it reaches this field. */
  html: string;
  /** Derived from `html`; never authored separately. */
  text: string;
  preheader?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: MailDraftAttachment[];
  /** Opaque to this module; the recipient picker owns its shape (Phase 5). */
  audience?: unknown;
  /* Scheduling INTENT only. A draft never executes: nothing reads this except
     the composer, and only an explicit Send/Schedule creates a campaign. */
  scheduleAt?: string;
  scheduleTimezone?: string;
  /**
   * Incremented on every write. Autosave sends the revision it last saw, and a
   * write built on a stale revision is refused — otherwise a slow request can
   * land after a fast one and silently restore older content.
   */
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface DraftState { drafts: MailDraft[] }
const fallback: DraftState = { drafts: [] };
const DRAFT_LOCK = 'mail-drafts';
const MAX_DRAFTS = 200;

export function createDraftId() {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getMailDrafts(): Promise<MailDraft[]> {
  const state = await readJsonFile<DraftState>(mailDraftsPath, fallback);
  const drafts = Array.isArray(state?.drafts) ? state.drafts : [];
  return drafts
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getMailDraftById(id: string): Promise<MailDraft | null> {
  return (await getMailDrafts()).find((d) => d.id === id) ?? null;
}

/** Raised when a save is built on a revision that is no longer current. */
export class DraftConflictError extends Error {
  readonly current: MailDraft;
  constructor(current: MailDraft) {
    super('This draft was modified by a newer save.');
    this.name = 'DraftConflictError';
    this.current = current;
  }
}

export interface SaveDraftInput {
  id?: string;
  subject: string;
  html: string;
  preheader?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: MailDraftAttachment[];
  audience?: unknown;
  scheduleAt?: string;
  scheduleTimezone?: string;
  /** The revision this edit was based on. Omit only when creating. */
  baseRevision?: number;
  actor: string;
}

/**
 * Create or update a draft.
 *
 * Sanitization happens HERE rather than at the route, so no future caller can
 * reach storage with unsanitized HTML by taking a different path in.
 */
export async function saveMailDraft(input: SaveDraftInput): Promise<MailDraft> {
  const html = sanitizeEmailHtml(input.html);
  const now = new Date().toISOString();

  return withStorageLock(DRAFT_LOCK, async () => {
    const state = await readJsonFile<DraftState>(mailDraftsPath, fallback);
    const drafts = Array.isArray(state?.drafts) ? state.drafts : [];
    const existing = input.id ? drafts.find((d) => d.id === input.id) : undefined;

    /* Reject an edit built on an older revision. Request ORDER is not a safe
       proxy for recency: two autosaves in flight can complete in either order,
       and the slower one carries the older content. */
    if (existing && typeof input.baseRevision === 'number'
        && input.baseRevision !== existing.revision) {
      throw new DraftConflictError(existing);
    }

    const record: MailDraft = {
      id: existing?.id ?? input.id ?? createDraftId(),
      subject: String(input.subject ?? '').trim().slice(0, 300),
      html,
      /* Derived, so the two versions cannot drift apart. */
      text: emailHtmlToText(html),
      preheader: input.preheader?.trim().slice(0, 300) || undefined,
      replyTo: input.replyTo?.trim() || undefined,
      cc: input.cc?.filter(Boolean).slice(0, 50),
      bcc: input.bcc?.filter(Boolean).slice(0, 50),
      attachments: input.attachments?.slice(0, 10),
      audience: input.audience,
      scheduleAt: input.scheduleAt || undefined,
      scheduleTimezone: input.scheduleTimezone || undefined,
      revision: (existing?.revision ?? 0) + 1,
      createdBy: existing?.createdBy ?? input.actor,
      updatedBy: input.actor,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const next = existing
      ? drafts.map((d) => (d.id === record.id ? record : d))
      : [record, ...drafts];

    await writeJsonFile(mailDraftsPath, { drafts: next.slice(0, MAX_DRAFTS) });
    return record;
  });
}

export async function deleteMailDraft(id: string): Promise<void> {
  await withStorageLock(DRAFT_LOCK, async () => {
    const state = await readJsonFile<DraftState>(mailDraftsPath, fallback);
    const drafts = Array.isArray(state?.drafts) ? state.drafts : [];
    await writeJsonFile(mailDraftsPath, { drafts: drafts.filter((d) => d.id !== id) });
  });
}

/** Copy a draft. Never carries send state — a duplicate cannot deliver. */
export async function duplicateMailDraft(id: string, actor: string): Promise<MailDraft | null> {
  const source = await getMailDraftById(id);
  if (!source) return null;
  return saveMailDraft({
    subject: `${source.subject} (copy)`,
    html: source.html,
    preheader: source.preheader,
    replyTo: source.replyTo,
    cc: source.cc,
    bcc: source.bcc,
    attachments: source.attachments,
    audience: source.audience,
    /* Scheduling intent is deliberately NOT copied: a duplicate should not
       inherit a time someone chose for a different message. */
    actor,
  });
}
