/**
 * Recipient resolution for Super Admin mail.
 *
 * One rule shapes this whole module: THE BROWSER NEVER DECIDES WHO GETS EMAIL.
 * The client sends a segment description — "active individuals created in the
 * last 30 days" — and the server resolves it against the real user store at
 * send time. A client that posts an array of 8,000 addresses cannot make this
 * app mail them, and a stale browser tab cannot mail a list that has since
 * changed.
 *
 * Filters use only fields that actually exist on the user record (see
 * `types/document.ts`). Location filters are deliberately absent: there is no
 * city or country on a user, so offering those would be a filter that silently
 * matched nobody.
 *
 * Counting is explicit about attrition — selected, then excluded (inactive or
 * no address), then invalid, then final. An admin about to mail thousands of
 * people should see exactly where the number went, not a single total.
 */
import { getStoredUsers } from '@/lib/server/auth';
import { isValidEmail } from '@/lib/server/security';

import { AUDIENCE_VARIABLES, type AudienceVariable } from '@/lib/email/variable-contracts';
import {
  extractEmailVariables, unsupportedEmailVariables, resolveEmailVariables,
} from '@/lib/email/render-email';
import { filterSuppressed } from '@/lib/server/mail-suppression';
export type MailAudienceMode =
  | 'all'
  | 'individuals'
  | 'businesses'
  | 'filtered'
  | 'selected'
  | 'manual';

export interface MailSegment {
  mode: MailAudienceMode;
  /** `selected`: explicit user ids. Resolved to addresses server-side. */
  userIds?: string[];
  /** `manual`: addresses typed by the admin. */
  emails?: string[];
  /** `filtered`: all conditions are ANDed. */
  filters?: {
    accountType?: 'business' | 'individual';
    status?: 'active' | 'inactive';
    role?: string;
    /** Registered within the last N days. */
    createdWithinDays?: number;
    /** 'yes' = has logged in at least once, 'no' = never. */
    hasLoggedIn?: 'yes' | 'no';
    /** Matches name, email or organisation. */
    search?: string;
  };
}

export interface RecipientUser {
  id: string;
  email: string;
  name: string;
  role: string;
  accountType: 'business' | 'individual' | 'unknown';
  organizationName?: string;
  isActive: boolean;
  createdAt: string;
}

export interface RecipientResolution {
  /** Matched the segment before any filtering for deliverability. */
  selected: number;
  /** Dropped: inactive, no address, or a duplicate of another row. */
  excluded: number;
  /** Present but not a valid address. */
  invalid: number;
  /**
   * Unsubscribed or administratively suppressed.
   *
   * Reported separately from `excluded` because it is the one category an
   * admin must not treat as a fixable data problem - it is a person's stated
   * choice, and the send path enforces it again regardless of this figure.
   */
  suppressed: number;
  /** What would actually be mailed. */
  final: number;
  /** The deliverable addresses, lower-cased and de-duplicated. */
  emails: string[];
  /** A few real examples, for the confirmation screen. */
  sample: RecipientUser[];
  /** Invalid addresses, so the admin can fix them rather than guess. */
  invalidSamples: string[];
}

const MAX_RECIPIENTS = 25_000;

function toRecipient(u: Record<string, unknown>): RecipientUser {
  const accountType = u.accountType === 'business' || u.accountType === 'individual'
    ? u.accountType : 'unknown';
  return {
    id: String(u.id ?? ''),
    email: String(u.email ?? '').trim().toLowerCase(),
    name: String(u.name ?? ''),
    role: String(u.role ?? ''),
    accountType,
    organizationName: u.organizationName ? String(u.organizationName) : undefined,
    isActive: u.isActive !== false,
    createdAt: String(u.createdAt ?? ''),
  };
}

/** Does one user match the segment? Pure, so it is directly testable. */
export function matchesSegment(user: RecipientUser, segment: MailSegment): boolean {
  switch (segment.mode) {
    case 'all':
      return true;
    case 'individuals':
      return user.accountType === 'individual';
    case 'businesses':
      return user.accountType === 'business';
    case 'selected':
      return (segment.userIds ?? []).includes(user.id);
    case 'manual':
      return false; // manual addresses are not drawn from the user store
    case 'filtered': {
      const f = segment.filters ?? {};
      if (f.accountType && user.accountType !== f.accountType) return false;
      if (f.status === 'active' && !user.isActive) return false;
      if (f.status === 'inactive' && user.isActive) return false;
      if (f.role && user.role.toLowerCase() !== f.role.toLowerCase()) return false;
      if (typeof f.createdWithinDays === 'number' && f.createdWithinDays > 0) {
        const created = new Date(user.createdAt).getTime();
        if (!Number.isFinite(created)) return false;
        if (Date.now() - created > f.createdWithinDays * 86_400_000) return false;
      }
      if (f.search) {
        const q = f.search.trim().toLowerCase();
        const hay = `${user.name} ${user.email} ${user.organizationName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

/**
 * `hasLoggedIn` needs a field `RecipientUser` does not carry, so it is applied
 * against the raw record before projection.
 */
function matchesLoginFilter(raw: Record<string, unknown>, segment: MailSegment): boolean {
  const want = segment.mode === 'filtered' ? segment.filters?.hasLoggedIn : undefined;
  if (!want) return true;
  const logged = Boolean(raw.lastLogin);
  return want === 'yes' ? logged : !logged;
}

async function loadUsers(): Promise<Array<{ raw: Record<string, unknown>; user: RecipientUser }>> {
  const users = (await getStoredUsers()) as unknown as Record<string, unknown>[];
  return (Array.isArray(users) ? users : []).map((raw) => ({ raw, user: toRecipient(raw) }));
}

/**
 * Resolve a segment into the addresses that would actually be mailed.
 *
 * Always call this on the server immediately before sending; never trust a
 * count the browser produced earlier.
 */
/** Why one candidate did or did not make the final list. */
export type RecipientOutcome = 'included' | 'excluded' | 'invalid' | 'suppressed';

export interface RecipientRow {
  name: string;
  email: string;
  organizationName?: string;
  role: string;
  isActive: boolean;
  outcome: RecipientOutcome;
  /** Plain-language reason, shown to the admin. */
  reason: string;
}

/**
 * The single pass that decides each candidate's fate.
 *
 * Both the counts and the per-recipient table are derived from this, so the
 * number on the confirmation screen and the rows behind "View recipients"
 * cannot drift apart — which they would if each were computed separately.
 */
function classifyRecipients(matched: RecipientUser[], mode: MailAudienceMode) {
  const seen = new Set<string>();
  const rows: RecipientRow[] = [];
  const emails: string[] = [];

  for (const u of matched) {
    let outcome: RecipientOutcome = 'included';
    let reason = 'Will receive this email';

    if (mode !== 'manual' && !u.isActive) {
      outcome = 'excluded'; reason = 'Account is inactive';
    } else if (!u.email) {
      outcome = 'excluded'; reason = 'No email address on the account';
    } else if (!isValidEmail(u.email)) {
      outcome = 'invalid'; reason = 'Not a valid email address';
    } else if (seen.has(u.email)) {
      outcome = 'excluded'; reason = 'Duplicate of another recipient';
    }

    if (outcome === 'included') {
      seen.add(u.email);
      if (emails.length < MAX_RECIPIENTS) emails.push(u.email);
      else { outcome = 'excluded'; reason = `Beyond the ${MAX_RECIPIENTS.toLocaleString()} recipient limit`; }
    }

    rows.push({
      name: u.name, email: u.email, organizationName: u.organizationName,
      role: u.role, isActive: u.isActive, outcome, reason,
    });
  }

  return { rows, emails };
}

/** The candidates a segment matches, before deliverability filtering. */
async function matchedFor(segment: MailSegment): Promise<RecipientUser[]> {
  if (segment.mode === 'manual') {
    return (segment.emails ?? []).map((e, i) => ({
      id: `manual-${i}`,
      email: String(e ?? '').trim().toLowerCase(),
      name: '', role: '', accountType: 'unknown' as const,
      isActive: true, createdAt: '',
    }));
  }
  const rows = await loadUsers();
  return rows
    .filter(({ raw, user }) => matchesSegment(user, segment) && matchesLoginFilter(raw, segment))
    .map(({ user }) => user);
}

/**
 * Resolve a segment into the addresses that would actually be mailed.
 *
 * Always call this on the server immediately before sending; never trust a
 * count the browser produced earlier.
 */
export async function resolveRecipients(segment: MailSegment): Promise<RecipientResolution> {
  const matched = await matchedFor(segment);
  const { rows, emails } = classifyRecipients(matched, segment.mode);

  /* Suppression is applied to the SAME pass that produced the rows, so the
     count an admin is shown and the addresses that would be mailed cannot
     drift apart. The send path checks again immediately before sending - this
     figure informs the admin, it does not authorise anything. */
  const { eligible, suppressed } = await filterSuppressed(emails);
  const suppressedSet = new Set(suppressed);
  for (const row of rows) {
    if (row.outcome === 'included' && suppressedSet.has(row.email)) {
      row.outcome = 'suppressed';
      row.reason = 'Unsubscribed or suppressed — will not be sent';
    }
  }

  return {
    selected: matched.length,
    excluded: rows.filter((r) => r.outcome === 'excluded').length,
    invalid: rows.filter((r) => r.outcome === 'invalid').length,
    suppressed: suppressed.length,
    final: eligible.length,
    emails: eligible,
    sample: matched.filter((u) => eligible.includes(u.email)).slice(0, 8),
    invalidSamples: rows.filter((r) => r.outcome === 'invalid').slice(0, 10).map((r) => r.email),
  };
}

/**
 * The per-recipient table behind "View recipients", paginated.
 *
 * Returns only display fields — never the whole user record.
 */
export async function previewRecipientRows(
  segment: MailSegment,
  opts: { page?: number; pageSize?: number; outcome?: RecipientOutcome } = {},
): Promise<{ rows: RecipientRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);

  const matched = await matchedFor(segment);
  const { rows } = classifyRecipients(matched, segment.mode);
  const filtered = opts.outcome ? rows.filter((r) => r.outcome === opts.outcome) : rows;

  const start = (page - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
  };
}

/**
 * A short human description of who a segment targets.
 *
 * Stored on the campaign and written to the audit log, so a record of "who was
 * this sent to" survives even though the recipient list itself is deliberately
 * not frozen.
 */
export function describeSegment(segment: MailSegment): string {
  switch (segment.mode) {
    case 'all': return 'Everyone';
    case 'individuals': return 'All individual accounts';
    case 'businesses': return 'All business accounts';
    case 'selected': return `${(segment.userIds ?? []).length} selected user(s)`;
    case 'manual': return `${(segment.emails ?? []).length} manually entered address(es)`;
    case 'filtered': {
      const f = segment.filters ?? {};
      const parts: string[] = [];
      if (f.accountType) parts.push(`account type = ${f.accountType}`);
      if (f.status) parts.push(`status = ${f.status}`);
      if (f.role) parts.push(`role = ${f.role}`);
      if (f.createdWithinDays) parts.push(`registered within ${f.createdWithinDays} days`);
      if (f.hasLoggedIn) parts.push(`has logged in = ${f.hasLoggedIn}`);
      if (f.search) parts.push(`matching "${f.search}"`);
      return parts.length ? `Filtered: ${parts.join(', ')}` : 'Filtered: no conditions';
    }
    default: return 'Unknown audience';
  }
}

/* ── Browsing users for the recipient picker ──────────────────────────────
   Paginated on the SERVER. The picker must never pull the whole user table
   into a browser, and "select all matching" sends the FILTER, not 2,481 ids. */

export interface UserPage {
  users: RecipientUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function searchRecipientUsers(opts: {
  segment: MailSegment;
  page?: number;
  pageSize?: number;
}): Promise<UserPage> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);

  const rows = await loadUsers();
  const matched = rows
    .filter(({ raw, user }) => matchesSegment(user, opts.segment) && matchesLoginFilter(raw, opts.segment))
    .map(({ user }) => user)
    /* Stable ordering, newest first, so pagination cannot show the same user
       on two pages. */
    .sort((a, b) => {
      const d = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return Number.isFinite(d) && d !== 0 ? d : a.id.localeCompare(b.id);
    });

  const total = matched.length;
  const start = (page - 1) * pageSize;

  return {
    users: matched.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ── Personalisation ──────────────────────────────────────────────────────
   Only variables backed by a real field are offered. A template referring to
   anything else is rejected before sending rather than mailing a literal
   "{{city}}" to thousands of people. */

export const SUPPORTED_VARIABLES = AUDIENCE_VARIABLES;
export type SupportedVariable = AudienceVariable;

/* The pattern, the extractor and the substitution all live in the canonical
   renderer now. This file used to carry its own copy of each — a second
   implementation that happened to agree with the others, which is not the same
   thing as being the same code. */

/** Every variable referenced by the content, in order of first appearance. */
export const extractVariables = extractEmailVariables;

/** Variables the app cannot resolve. A non-empty result must block sending. */
export function unknownVariables(content: string): string[] {
  return unsupportedEmailVariables(content, SUPPORTED_VARIABLES);
}

/**
 * The values a real recipient contributes.
 *
 * Exported because the campaign send loop needs exactly this map: the loop is
 * what makes `{{firstName}}` a promise the product actually keeps rather than
 * a placeholder mailed verbatim to an entire audience.
 */
export function recipientVariableValues(user: RecipientUser): Record<SupportedVariable, string> {
  const parts = (user.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'there',
    lastName: parts.slice(1).join(' ') || '',
    fullName: user.name || 'there',
    email: user.email,
    companyName: user.organizationName || '',
    role: user.role || '',
  };
}

export function renderVariables(content: string, user: RecipientUser): string {
  return resolveEmailVariables(content, recipientVariableValues(user), { escape: false });
}

/**
 * The matched users behind a segment, not just their addresses.
 *
 * Personalisation needs the person. `resolveRecipients` deliberately returns
 * only counts and addresses, because that is all the confirmation screen may
 * see; the send loop needs more, and asks for it explicitly.
 */
export async function resolveRecipientUsers(segment: MailSegment): Promise<RecipientUser[]> {
  const matched = await matchedFor(segment);
  const { emails } = classifyRecipients(matched, segment.mode);
  const deliverable = new Set(emails);
  const seen = new Set<string>();
  const out: RecipientUser[] = [];
  for (const u of matched) {
    if (!deliverable.has(u.email) || seen.has(u.email)) continue;
    seen.add(u.email);
    out.push(u);
  }
  return out;
}
