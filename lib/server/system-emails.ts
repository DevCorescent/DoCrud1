/**
 * System (transactional) email configuration.
 *
 * These are the emails the APPLICATION sends by itself — not campaigns. An
 * admin can edit their presentation; everything else stays where it is. The
 * sender still owns the recipient, the OTP generation, expiry, security and
 * delivery. Only subject and body come from here.
 *
 * THREE RULES THIS MODULE EXISTS TO ENFORCE:
 *
 * 1. A REGISTERED TYPE MUST HAVE A REAL SENDER. Configuration nothing reads is
 *    worse than no configuration: an admin edits it, sees it saved, and the
 *    production email never changes. Only types actually wired into a sender
 *    appear here.
 *
 * 2. EDITING IS NOT PUBLISHING. Senders read the PUBLISHED version. A draft
 *    can be broken, half-written or mid-edit without touching production.
 *
 * 3. FAILURE FALLS BACK, NEVER FAILS. If the store is unavailable, corrupt, or
 *    the published content is invalid, the sender uses its built-in template.
 *    An admin's typo must never stop a user receiving a login code.
 */
import {
  readJsonFile, writeJsonFile, systemEmailsPath, withStorageLock,
} from '@/lib/server/storage';
import { sanitizeEmailHtml } from '@/lib/security/email-html-sanitizer';
import { emailHtmlToText } from '@/lib/email/html-to-text';

import { sampleValuesFor } from '@/lib/email/variable-contracts';
import {
  renderEmail, resolveEmailVariables, unsupportedEmailVariables, extractEmailVariables,
} from '@/lib/email/render-email';
/** Only types with a sender that actually consumes this configuration. */
export type SystemEmailType =
  | 'signup_otp' | 'account_action_otp' | 'public_face_otp'
  | 'account_deactivated' | 'account_deletion_warning'
  | 'account_deleted' | 'account_reactivated'
  | 'business_verification_submitted' | 'business_verification_approved'
  | 'business_verification_rejected'
  | 'public_face_received' | 'public_face_approved' | 'public_face_rejected';

export interface SystemEmailDefinition {
  type: SystemEmailType;
  name: string;
  /** What causes the application to send it. */
  trigger: string;
  /** The sender that reads this configuration. */
  sender: string;
  /** Variables THIS email supports — not a global list. */
  variables: string[];
  /** Sample values for preview. Never used in a real send. */
  sampleValues: Record<string, string>;
  /** True when the application cannot function without it. */
  required: boolean;
  defaultSubject: string;
  defaultHtml: string;
}

/**
 * The registry.
 *
 * `signup_otp` is the verification code every OTP path sends, built and
 * delivered by `lib/server/otp-email.ts` — the onboarding signup flow, the
 * re-verification endpoint and the legacy screens all go through it. Other
 * transactional senders exist in the codebase (account-action OTP, account
 * deactivation, business verification, public-face) but are NOT listed here:
 * until a sender reads this configuration, listing it would be a UI that edits
 * nothing.
 */
const DEFINITIONS: Omit<SystemEmailDefinition, 'sampleValues'>[] = [
  {
    type: 'signup_otp',
    name: 'Email verification code',
    trigger: 'A user requests a verification code during signup or login',
    sender: 'lib/server/otp-email',
    variables: ['otp', 'firstName', 'email'],
    required: true,
    defaultSubject: '{{otp}} is your Docrud verification code',
    defaultHtml:
      '<p>Hi {{firstName}},</p>'
      + '<p>Use this code to verify your email address:</p>'
      + '<p style="font-size: 32px; font-weight: bold; letter-spacing: 0.15em;">{{otp}}</p>'
      + '<p>This code expires shortly. If you did not request it, you can ignore this email.</p>',
  },
  {
    type: 'account_action_otp',
    name: 'Account action code',
    trigger: 'A user confirms deactivating or deleting their account',
    sender: 'lib/server/account-emails',
    /* `action` is the word "deactivate"/"delete" the sender already computes;
       `expiresAt` is the formatted time. Neither is generated here. */
    variables: ['otp', 'firstName', 'action', 'expiresAt'],
    required: true,
    defaultSubject: '{{otp}} — Your Docrud account action code',
    defaultHtml:
      '<p>Hi {{firstName}},</p>'
      + '<p>We received a request to {{action}} your Docrud account. Use this code to confirm:</p>'
      + '<p style="font-size: 32px; font-weight: bold; letter-spacing: 0.15em;">{{otp}}</p>'
      + '<p>Valid until {{expiresAt}}. If this was not you, ignore this email and your account '
      + 'stays as it is.</p>',
  },
  {
    type: 'public_face_otp',
    name: 'Public Face verification code',
    trigger: 'An applicant verifies their email for a Public Face application',
    sender: 'lib/server/public-face-emails',
    variables: ['otp', 'firstName'],
    required: true,
    defaultSubject: 'Verify your email — Public Face application',
    defaultHtml:
      '<p>Hi {{firstName}},</p>'
      + '<p>Your code to verify your Public Face application:</p>'
      + '<p style="font-size: 32px; font-weight: bold; letter-spacing: 0.15em;">{{otp}}</p>'
      + '<p>It is valid for a short time. If you did not apply, you can ignore this email.</p>',
  },
  {
    type: 'account_deactivated',
    name: 'Account deactivated',
    trigger: 'A user deactivates their account',
    sender: 'lib/server/account-emails',
    /* `deadline` is a formatted string the sender computes — including the
       word it uses when there is no deadline. The BRANCH stays in code; only
       its wording is editable. */
    variables: ['firstName', 'deadline'],
    required: false,
    defaultSubject: 'Your Docrud account has been deactivated',
    defaultHtml:
      '<p>Hi {{firstName}},</p>'
      + '<p>Your Docrud account is now deactivated. You can reactivate it by signing in again '
      + 'before {{deadline}}.</p>',
  },
  {
    type: 'account_deletion_warning',
    name: 'Account deletion warning',
    trigger: 'Seven days before a deactivated account is deleted',
    sender: 'lib/server/account-emails',
    variables: ['firstName', 'deadline'],
    required: false,
    defaultSubject: 'Your Docrud account will be deleted in 7 days',
    defaultHtml:
      '<p>Hi {{firstName}},</p>'
      + '<p>Your deactivated Docrud account is scheduled for permanent deletion on {{deadline}}. '
      + 'Sign in before then to keep it.</p>',
  },
  {
    type: 'account_deleted',
    name: 'Account deleted',
    trigger: 'An account is permanently deleted',
    sender: 'lib/server/account-emails',
    variables: ['firstName'],
    required: false,
    defaultSubject: 'Your Docrud account has been deleted',
    defaultHtml:
      '<p>Hi {{firstName}},</p><p>Your Docrud account and its data have been permanently '
      + 'deleted. Thank you for using Docrud.</p>',
  },
  {
    type: 'account_reactivated',
    name: 'Account reactivated',
    trigger: 'A deactivated account is reactivated',
    sender: 'lib/server/account-emails',
    variables: ['firstName'],
    required: false,
    defaultSubject: 'Your Docrud account is back',
    defaultHtml: '<p>Hi {{firstName}},</p><p>Welcome back — your Docrud account is active again.</p>',
  },
  {
    type: 'business_verification_submitted',
    name: 'Business verification received',
    trigger: 'A business submits a verification request',
    sender: 'lib/server/business-verification-emails',
    variables: ['firstName', 'businessName'],
    required: false,
    defaultSubject: 'Business verification request received',
    defaultHtml:
      '<p>Hi {{firstName}},</p><p>We have received the verification request for '
      + '{{businessName}} and will review it shortly.</p>',
  },
  {
    type: 'business_verification_approved',
    name: 'Business verification approved',
    trigger: 'An admin approves a business verification',
    sender: 'lib/server/business-verification-emails',
    variables: ['firstName', 'businessName'],
    required: false,
    defaultSubject: '{{businessName}} is now verified on Docrud',
    defaultHtml:
      '<p>Hi {{firstName}},</p><p>{{businessName}} is now verified on Docrud. The verified '
      + 'badge is live on your business page.</p>',
  },
  {
    type: 'business_verification_rejected',
    name: 'Business verification not approved',
    trigger: 'An admin rejects a business verification',
    sender: 'lib/server/business-verification-emails',
    /* `reason` is the admin's note, passed through by the sender. */
    variables: ['firstName', 'businessName', 'reason'],
    required: false,
    defaultSubject: 'Action required: verification update for {{businessName}}',
    defaultHtml:
      '<p>Hi {{firstName}},</p><p>We could not verify {{businessName}} yet.</p>'
      + '<p>{{reason}}</p><p>You can update the details and submit again.</p>',
  },
  {
    type: 'public_face_received',
    name: 'Public Face application received',
    trigger: 'A Public Face application is submitted',
    sender: 'lib/server/public-face-emails',
    variables: ['firstName', 'category'],
    required: false,
    defaultSubject: 'Your Public Face application has been received',
    defaultHtml:
      '<p>Hi {{firstName}},</p><p>We have received your {{category}} application and will '
      + 'review it shortly.</p>',
  },
  {
    type: 'public_face_approved',
    name: 'Public Face approved',
    trigger: 'An admin approves a Public Face application',
    sender: 'lib/server/public-face-emails',
    variables: ['firstName', 'category'],
    required: false,
    defaultSubject: 'Congratulations — you are now a Public Face',
    defaultHtml:
      '<p>Hi {{firstName}},</p><p>Your {{category}} application has been approved. Your Public '
      + 'Face profile is now live.</p>',
  },
  {
    type: 'public_face_rejected',
    name: 'Public Face not approved',
    trigger: 'An admin rejects a Public Face application',
    sender: 'lib/server/public-face-emails',
    variables: ['firstName', 'category', 'reason'],
    required: false,
    defaultSubject: 'Update on your Public Face application',
    defaultHtml:
      '<p>Hi {{firstName}},</p><p>Your {{category}} application was not approved this time.</p>'
      + '<p>{{reason}}</p>',
  },
];

/* Sample data comes from ONE place. Thirteen hand-maintained maps were
   thirteen chances for a preview to invent a value the contract never had. */
export const SYSTEM_EMAILS: SystemEmailDefinition[] = DEFINITIONS.map((d) => ({
  ...d,
  sampleValues: sampleValuesFor(d.variables),
}));


export function getSystemEmailDefinition(type: string): SystemEmailDefinition | null {
  return SYSTEM_EMAILS.find((e) => e.type === type) ?? null;
}

export interface SystemEmailConfig {
  type: SystemEmailType;
  /** What an admin is editing. Never read by a sender. */
  draftSubject: string;
  draftHtml: string;
  /** What senders actually use. Absent until first publish. */
  publishedSubject?: string;
  publishedHtml?: string;
  publishedText?: string;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  publishedBy?: string;
  publishedAt?: string;
}

interface State { configs: SystemEmailConfig[] }
const fallback: State = { configs: [] };
const LOCK = 'system-emails';

export class SystemEmailConflictError extends Error {
  readonly current: SystemEmailConfig;
  constructor(current: SystemEmailConfig) {
    super('This system email was changed by another administrator.');
    this.name = 'SystemEmailConflictError';
    this.current = current;
  }
}

/* ── Variables ─────────────────────────────────────────────────────────────
   Per-email, not global: `{{otp}}` is meaningful in a verification code and
   meaningless anywhere else, and offering it everywhere would invite an
   unresolvable placeholder into production. */

/* The pattern, the extractor and the substitution used to live here as a
   private copy. They are the canonical renderer's now, so a system email and a
   campaign cannot disagree about what `{{ name }}` means. */

/** Variables used by the content that this email does not support. */
export function unsupportedVariables(content: string, def: SystemEmailDefinition): string[] {
  return unsupportedEmailVariables(content, def.variables);
}

/** Substitute values. Anything unsupported is left intact so it is visible. */
export function renderSystemEmail(content: string, values: Record<string, string>): string {
  return resolveEmailVariables(content, values, { escape: false });
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

export async function getSystemEmailConfig(type: SystemEmailType): Promise<SystemEmailConfig | null> {
  const state = await readJsonFile<State>(systemEmailsPath, fallback).catch(() => fallback);
  const configs = Array.isArray(state?.configs) ? state.configs : [];
  return configs.find((c) => c.type === type) ?? null;
}

export async function getAllSystemEmailConfigs(): Promise<SystemEmailConfig[]> {
  const state = await readJsonFile<State>(systemEmailsPath, fallback).catch(() => fallback);
  return Array.isArray(state?.configs) ? state.configs : [];
}

async function write(next: SystemEmailConfig): Promise<SystemEmailConfig> {
  return withStorageLock(LOCK, async () => {
    const state = await readJsonFile<State>(systemEmailsPath, fallback).catch(() => fallback);
    const configs = Array.isArray(state?.configs) ? state.configs : [];
    const updated = configs.some((c) => c.type === next.type)
      ? configs.map((c) => (c.type === next.type ? next : c))
      : [...configs, next];
    await writeJsonFile(systemEmailsPath, { configs: updated });
    return next;
  });
}

export interface SaveSystemEmailInput {
  type: SystemEmailType;
  subject: string;
  html: string;
  baseRevision?: number;
  actor: string;
}

/** Save the DRAFT. Production is untouched until publish. */
export async function saveSystemEmailDraft(input: SaveSystemEmailInput): Promise<SystemEmailConfig> {
  const def = getSystemEmailDefinition(input.type);
  if (!def) throw new Error('Unknown system email type.');

  const existing = await getSystemEmailConfig(input.type);
  if (existing && typeof input.baseRevision === 'number'
      && input.baseRevision !== existing.revision) {
    throw new SystemEmailConflictError(existing);
  }

  return write({
    type: input.type,
    draftSubject: String(input.subject ?? '').trim().slice(0, 300),
    draftHtml: sanitizeEmailHtml(input.html),
    publishedSubject: existing?.publishedSubject,
    publishedHtml: existing?.publishedHtml,
    publishedText: existing?.publishedText,
    revision: (existing?.revision ?? 0) + 1,
    updatedBy: input.actor,
    updatedAt: new Date().toISOString(),
    publishedBy: existing?.publishedBy,
    publishedAt: existing?.publishedAt,
  });
}

/**
 * Promote the draft to production.
 *
 * Validation happens BEFORE the write: an unsupported variable would reach a
 * recipient as a literal `{{something}}`, so publishing is refused rather than
 * letting it through. If the write fails, the previous published version stays
 * active — there is no partially published state.
 */
export async function publishSystemEmail(
  type: SystemEmailType, actor: string,
): Promise<{ config: SystemEmailConfig } | { error: string; unsupported: string[] }> {
  const def = getSystemEmailDefinition(type);
  if (!def) return { error: 'Unknown system email type.', unsupported: [] };

  const existing = await getSystemEmailConfig(type);
  if (!existing) return { error: 'Nothing to publish yet.', unsupported: [] };

  const subject = existing.draftSubject.trim();
  if (!subject) return { error: 'A subject is required before publishing.', unsupported: [] };

  const html = sanitizeEmailHtml(existing.draftHtml);
  if (!html.trim()) return { error: 'The email body is empty.', unsupported: [] };

  const unsupported = unsupportedVariables(`${subject} ${html}`, def);
  if (unsupported.length) {
    return {
      error: 'This email uses variables it does not support. Remove them before publishing.',
      unsupported,
    };
  }

  const now = new Date().toISOString();
  const config = await write({
    ...existing,
    publishedSubject: subject,
    publishedHtml: html,
    publishedText: emailHtmlToText(html),
    revision: existing.revision + 1,
    updatedBy: actor,
    updatedAt: now,
    publishedBy: actor,
    publishedAt: now,
  });
  invalidateSystemEmailCache();
  return { config };
}

/** Restore the built-in content as a DRAFT. Does not publish. */
export async function resetSystemEmailToDefault(
  type: SystemEmailType, actor: string,
): Promise<SystemEmailConfig | null> {
  const def = getSystemEmailDefinition(type);
  if (!def) return null;
  const existing = await getSystemEmailConfig(type);
  return saveSystemEmailDraft({
    type,
    subject: def.defaultSubject,
    html: def.defaultHtml,
    baseRevision: existing?.revision,
    actor,
  });
}

/* ── The read path senders use ─────────────────────────────────────────────
   Cached briefly: a transactional send should not pay a storage read every
   time, and publishing clears it explicitly. */

let cache: { at: number; configs: SystemEmailConfig[] } | null = null;
const CACHE_MS = 30_000;

export function invalidateSystemEmailCache(): void { cache = null; }

/**
 * The subject/body a sender should use, with variables resolved.
 *
 * Returns null whenever anything is wrong — no published version, storage
 * unavailable, corrupt content, unresolved variables — so the caller falls
 * back to its built-in template. A login code must never fail to arrive
 * because of an editing mistake.
 */
export async function resolveSystemEmail(
  type: SystemEmailType, values: Record<string, string>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const def = getSystemEmailDefinition(type);
  if (!def) return null;

  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      cache = { at: Date.now(), configs: await getAllSystemEmailConfigs() };
    }
    const config = cache.configs.find((c) => c.type === type);
    if (!config?.publishedSubject || !config.publishedHtml) return null;

    /* The SAME renderer the preview and the test send use. A production
       transactional email is not a special case; it is the case the other two
       exist to rehearse. Text is derived from the final html rather than read
       from `publishedText`, so a stored text alternative can never drift away
       from the html it is supposed to mirror. */
    const rendered = renderEmail({
      subject: config.publishedSubject,
      html: config.publishedHtml,
      supported: def.variables,
      values,
    });

    /* A literal "{{otp}}" reaching a user is worse than the built-in email. */
    if (rendered.unsupported.length) return null;
    if (extractEmailVariables(`${rendered.subject} ${rendered.html}`).length) return null;

    return { subject: rendered.subject, html: rendered.html, text: rendered.text };
  } catch (error) {
    /* Logged for an operator; never surfaced to a recipient. */
    console.error(`[system-emails] falling back to the built-in template for ${type}`, error);
    return null;
  }
}
