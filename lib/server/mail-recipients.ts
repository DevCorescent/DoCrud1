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
export async function resolveRecipients(segment: MailSegment): Promise<RecipientResolution> {
  const rows = await loadUsers();

  let matched: RecipientUser[] = [];
  if (segment.mode === 'manual') {
    matched = (segment.emails ?? []).map((e, i) => ({
      id: `manual-${i}`,
      email: String(e ?? '').trim().toLowerCase(),
      name: '', role: '', accountType: 'unknown' as const,
      isActive: true, createdAt: '',
    }));
  } else {
    matched = rows
      .filter(({ raw, user }) => matchesSegment(user, segment) && matchesLoginFilter(raw, segment))
      .map(({ user }) => user);
  }

  const selected = matched.length;
  const seen = new Set<string>();
  const emails: string[] = [];
  const sample: RecipientUser[] = [];
  const invalidSamples: string[] = [];
  let excluded = 0;
  let invalid = 0;

  for (const u of matched) {
    /* An inactive account is excluded from user-store sends, but a manually
       typed address is the admin's explicit choice and is kept. */
    if (segment.mode !== 'manual' && !u.isActive) { excluded += 1; continue; }
    if (!u.email) { excluded += 1; continue; }
    if (!isValidEmail(u.email)) {
      invalid += 1;
      if (invalidSamples.length < 10) invalidSamples.push(u.email);
      continue;
    }
    if (seen.has(u.email)) { excluded += 1; continue; } // duplicate
    seen.add(u.email);
    if (emails.length < MAX_RECIPIENTS) emails.push(u.email);
    if (sample.length < 8) sample.push(u);
  }

  return {
    selected,
    excluded,
    invalid,
    final: emails.length,
    emails,
    sample,
    invalidSamples,
  };
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

export const SUPPORTED_VARIABLES = [
  'firstName', 'lastName', 'fullName', 'email', 'companyName', 'role',
] as const;
export type SupportedVariable = typeof SUPPORTED_VARIABLES[number];

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Every variable referenced by the content, in order of first appearance. */
export function extractVariables(content: string): string[] {
  const found: string[] = [];
  /* exec-loop rather than matchAll: the project's compile target does not
     allow iterating the matchAll result. */
  const re = new RegExp(VARIABLE_PATTERN.source, 'g');
  let m: RegExpExecArray | null = re.exec(content);
  while (m !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
    m = re.exec(content);
  }
  return found;
}

/** Variables the app cannot resolve. A non-empty result must block sending. */
export function unknownVariables(content: string): string[] {
  return extractVariables(content).filter(
    (v) => !(SUPPORTED_VARIABLES as readonly string[]).includes(v),
  );
}

export function renderVariables(content: string, user: RecipientUser): string {
  const parts = (user.name || '').trim().split(/\s+/).filter(Boolean);
  const values: Record<SupportedVariable, string> = {
    firstName: parts[0] || 'there',
    lastName: parts.slice(1).join(' ') || '',
    fullName: user.name || 'there',
    email: user.email,
    companyName: user.organizationName || '',
    role: user.role || '',
  };
  return content.replace(VARIABLE_PATTERN, (whole, name: string) =>
    (SUPPORTED_VARIABLES as readonly string[]).includes(name)
      ? values[name as SupportedVariable]
      : whole);
}
