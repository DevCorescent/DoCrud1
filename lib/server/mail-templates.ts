/**
 * Reusable email templates.
 *
 * A template is CONTENT, nothing else. It holds no recipients, no schedule, no
 * delivery state, and nothing reads it at send time — using one copies its
 * content into a draft. That copy is what makes campaign history stable:
 * editing a template tomorrow cannot rewrite an email that went out yesterday.
 *
 * Sanitization and plain-text derivation happen here rather than in the route,
 * so no future caller can reach storage by another path with unsanitized HTML.
 * Revision handling mirrors drafts — the same optimistic-concurrency guard,
 * not a second mechanism.
 */
import {
  readJsonFile, writeJsonFile, mailTemplatesPath, withStorageLock,
} from '@/lib/server/storage';
import { sanitizeEmailHtml } from '@/lib/security/email-html-sanitizer';
import { emailHtmlToText } from '@/lib/email/html-to-text';

/** Deliberately few: a category with no meaning is just a free-text field. */
export const TEMPLATE_CATEGORIES = ['marketing', 'system', 'transactional', 'general'] as const;
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];

export type TemplateStatus = 'active' | 'archived';

export interface MailTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  /** ALWAYS sanitized before it reaches this field. */
  html: string;
  /** Derived from `html`; never authored separately. */
  text: string;
  preheader?: string;
  status: TemplateStatus;
  /** Incremented on every write; a stale write is refused. */
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateState { templates: MailTemplate[] }
const fallback: TemplateState = { templates: [] };
const TEMPLATE_LOCK = 'mail-templates';
const MAX_TEMPLATES = 500;

/** Raised when a save is built on a revision that is no longer current. */
export class TemplateConflictError extends Error {
  readonly current: MailTemplate;
  constructor(current: MailTemplate) {
    super('This template was changed by another administrator.');
    this.name = 'TemplateConflictError';
    this.current = current;
  }
}

export function createTemplateId() {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getMailTemplates(): Promise<MailTemplate[]> {
  const state = await readJsonFile<TemplateState>(mailTemplatesPath, fallback);
  const templates = Array.isArray(state?.templates) ? state.templates : [];
  return templates
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getMailTemplateById(id: string): Promise<MailTemplate | null> {
  return (await getMailTemplates()).find((t) => t.id === id) ?? null;
}

export interface SaveTemplateInput {
  id?: string;
  name: string;
  subject: string;
  html: string;
  preheader?: string;
  category?: string;
  status?: TemplateStatus;
  baseRevision?: number;
  actor: string;
}

export async function saveMailTemplate(input: SaveTemplateInput): Promise<MailTemplate> {
  const html = sanitizeEmailHtml(input.html);
  const now = new Date().toISOString();
  const category: TemplateCategory =
    (TEMPLATE_CATEGORIES as readonly string[]).includes(String(input.category))
      ? input.category as TemplateCategory
      : 'general';

  return withStorageLock(TEMPLATE_LOCK, async () => {
    const state = await readJsonFile<TemplateState>(mailTemplatesPath, fallback);
    const templates = Array.isArray(state?.templates) ? state.templates : [];
    const existing = input.id ? templates.find((t) => t.id === input.id) : undefined;

    /* Request ORDER is not a safe proxy for recency: two saves in flight can
       complete in either order, and the slower one carries older content. */
    if (existing && typeof input.baseRevision === 'number'
        && input.baseRevision !== existing.revision) {
      throw new TemplateConflictError(existing);
    }

    const record: MailTemplate = {
      id: existing?.id ?? input.id ?? createTemplateId(),
      name: String(input.name ?? '').trim().slice(0, 160) || 'Untitled template',
      category,
      subject: String(input.subject ?? '').trim().slice(0, 300),
      html,
      text: emailHtmlToText(html),
      preheader: input.preheader?.trim().slice(0, 300) || undefined,
      status: input.status ?? existing?.status ?? 'active',
      revision: (existing?.revision ?? 0) + 1,
      createdBy: existing?.createdBy ?? input.actor,
      updatedBy: input.actor,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const next = existing
      ? templates.map((t) => (t.id === record.id ? record : t))
      : [record, ...templates];

    await writeJsonFile(mailTemplatesPath, { templates: next.slice(0, MAX_TEMPLATES) });
    return record;
  });
}

export async function deleteMailTemplate(id: string): Promise<void> {
  await withStorageLock(TEMPLATE_LOCK, async () => {
    const state = await readJsonFile<TemplateState>(mailTemplatesPath, fallback);
    const templates = Array.isArray(state?.templates) ? state.templates : [];
    await writeJsonFile(mailTemplatesPath, { templates: templates.filter((t) => t.id !== id) });
  });
}

/** Copy a template. Carries content only — there is no send state to copy. */
export async function duplicateMailTemplate(
  id: string, actor: string,
): Promise<MailTemplate | null> {
  const source = await getMailTemplateById(id);
  if (!source) return null;
  return saveMailTemplate({
    name: `${source.name} (Copy)`,
    subject: source.subject,
    html: source.html,
    preheader: source.preheader,
    category: source.category,
    status: 'active',
    actor,
  });
}
