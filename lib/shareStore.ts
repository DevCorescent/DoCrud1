/**
 * ShareStore — token-based file/folder share registry.
 *
 * Every share has:
 *  • a unique token embedded in a shareable URL  (/share/<token>)
 *  • a permission level (read | comment | edit | admin)
 *  • optional expiry and password
 *  • the original file/folder metadata (so recipients can preview it)
 *
 * Persistence: localStorage key  "docrud_shares"
 * In-memory cache keeps the current session fast.
 */

const LS_KEY = 'docrud_shares';

/* ─── Enums / Types ──────────────────────────────────────────────────────── */

export type SharePermission = 'read' | 'comment' | 'edit' | 'admin';
export type ShareableKind   = 'file' | 'folder';

export interface ShareRecord {
  token:       string;
  kind:        ShareableKind;
  itemId:      string;
  itemName:    string;
  /** Detected file type label (pdf, image, sheet …) */
  fileKind?:   string;
  permission:  SharePermission;
  createdAt:   number;
  expiresAt?:  number;       // unix ms — undefined = never
  password?:   string;       // plain-text demo hash (not for production)
  /** small files only — base64 data-url so the share page can preview inline */
  previewDataUrl?: string;
  /** How many times the share link has been accessed */
  accessCount: number;
  /** IDs of users / tokens that have added this to their drive */
  addedBy:     string[];
  /** Collab session IDs currently live */
  collabSessions: string[];
  /** Owner display name */
  ownerName: string;
  /** Revoked? */
  revoked: boolean;
}

export interface ShareCreateOptions {
  permission:  SharePermission;
  expiresIn?:  number;   // ms from now — undefined = never
  password?:   string;
  previewDataUrl?: string;
  ownerName?:  string;
}

/* ─── Token generation ───────────────────────────────────────────────────── */

export function generateShareToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  // base62-like: letters + digits, url-safe
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

/* ─── Persistence helpers ────────────────────────────────────────────────── */

let _cache: Map<string, ShareRecord> | null = null;

function loadCache(): Map<string, ShareRecord> {
  if (_cache) return _cache;
  _cache = new Map();
  if (typeof window === 'undefined') return _cache;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const arr: ShareRecord[] = JSON.parse(raw);
      arr.forEach(r => _cache!.set(r.token, r));
    }
  } catch {}
  return _cache;
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(loadCache().values());
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {}
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

export function createShare(
  kind: ShareableKind,
  itemId: string,
  itemName: string,
  fileKind: string | undefined,
  options: ShareCreateOptions,
): ShareRecord {
  const cache = loadCache();
  const token = generateShareToken();
  const record: ShareRecord = {
    token,
    kind,
    itemId,
    itemName,
    fileKind,
    permission:  options.permission,
    createdAt:   Date.now(),
    expiresAt:   options.expiresIn ? Date.now() + options.expiresIn : undefined,
    password:    options.password?.trim() || undefined,
    previewDataUrl: options.previewDataUrl,
    accessCount: 0,
    addedBy:     [],
    collabSessions: [],
    ownerName:   options.ownerName ?? 'You',
    revoked:     false,
  };
  cache.set(token, record);
  persist();
  return record;
}

export function getShare(token: string): ShareRecord | null {
  const record = loadCache().get(token) ?? null;
  if (!record) return null;
  if (record.revoked) return null;
  if (record.expiresAt && Date.now() > record.expiresAt) return null;
  return record;
}

export function recordAccess(token: string): void {
  const cache = loadCache();
  const r = cache.get(token);
  if (!r) return;
  r.accessCount += 1;
  persist();
}

export function markAddedToScan(token: string, userId: string): void {
  const cache = loadCache();
  const r = cache.get(token);
  if (!r || r.addedBy.includes(userId)) return;
  r.addedBy.push(userId);
  persist();
}

export function revokeShare(token: string): void {
  const cache = loadCache();
  const r = cache.get(token);
  if (!r) return;
  r.revoked = true;
  persist();
}

export function listSharesForItem(itemId: string): ShareRecord[] {
  return Array.from(loadCache().values()).filter(r => r.itemId === itemId && !r.revoked);
}

export function addCollabSession(token: string, sessionId: string): void {
  const cache = loadCache();
  const r = cache.get(token);
  if (!r || r.collabSessions.includes(sessionId)) return;
  r.collabSessions.push(sessionId);
  persist();
}

export function removeCollabSession(token: string, sessionId: string): void {
  const cache = loadCache();
  const r = cache.get(token);
  if (!r) return;
  r.collabSessions = r.collabSessions.filter(s => s !== sessionId);
  persist();
}

/** Human-readable expiry string */
export function formatExpiry(record: ShareRecord): string {
  if (!record.expiresAt) return 'Never expires';
  const diff = record.expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.ceil(diff / 60_000)} min remaining`;
  if (h < 24) return `${h}h remaining`;
  return `${Math.floor(h / 24)}d remaining`;
}

export const PERMISSION_LABELS: Record<SharePermission, string> = {
  read:    'Read Only',
  comment: 'Comment',
  edit:    'Edit',
  admin:   'Admin',
};

export const PERMISSION_DESCRIPTIONS: Record<SharePermission, string> = {
  read:    'Can view and preview the file. Cannot make changes.',
  comment: 'Can view and leave comments. Cannot edit content.',
  edit:    'Can view, comment and collaboratively edit in real time.',
  admin:   'Full access — can edit, re-share and change permissions.',
};

export const PERMISSION_COLOR: Record<SharePermission, string> = {
  read:    '#94a3b8',
  comment: '#fbbf24',
  edit:    '#34d399',
  admin:   '#f87171',
};
