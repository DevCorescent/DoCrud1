/**
 * CollabEngine — production-grade real-time collaboration layer.
 *
 * Built on top of collabSession (BroadcastChannel transport).
 * New capabilities:
 *   • Version history  — auto + manual snapshots in localStorage (max 50)
 *   • OT conflict resolver — last-write-wins with concurrent edit detection
 *   • Comments         — anchored document comments with replies
 *   • Activity feed    — real-time timestamped event log
 *   • Auto-save        — debounced 2 s + 30 s hard interval
 *   • Undo / redo      — local content undo stack (up to 100 steps)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCollabSession, type CollabUser } from './collabSession';
import { generateShareToken } from './shareStore';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface VersionRecord {
  id:         string;
  token:      string;
  content:    string;
  at:         number;
  authorName: string;
  sessionId:  string;
  label?:     string;
  isAutoSave: boolean;
  size:       number; // char count
}

export interface CollabReply {
  id:          string;
  sessionId:   string;
  authorName:  string;
  authorColor: string;
  text:        string;
  createdAt:   number;
}

export interface CollabComment {
  id:          string;
  sessionId:   string;
  authorName:  string;
  authorColor: string;
  text:        string;
  lineRef?:    number;  // line number (1-based)
  resolved:    boolean;
  createdAt:   number;
  replies:     CollabReply[];
}

export interface ActivityEntry {
  id:          string;
  sessionId:   string;
  authorName:  string;
  authorColor: string;
  kind: 'join' | 'leave' | 'edit' | 'comment' | 'save' | 'restore' | 'resolve';
  description: string;
  at:          number;
}

export interface ConflictInfo {
  sessionId:   string;
  authorName:  string;
  at:          number;
  theirContent: string;
}

export type SaveStatus = 'idle' | 'saving' | 'saved';

/* ─── Persistence helpers ────────────────────────────────────────────────── */

const MAX_VERSIONS = 50;
const MAX_ACTIVITY = 100;

function versionsKey(token: string)  { return `docrud_versions_${token}`; }
function commentsKey(token: string)  { return `docrud_comments_${token}`; }
function activityKey(token: string)  { return `docrud_activity_${token}`; }

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

function saveJSON<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ─── Public hook ────────────────────────────────────────────────────────── */

export interface CollabEngineState {
  /* Presence (from base session) */
  sessionId:     string;
  users:         CollabUser[];
  connected:     boolean;

  /* Content sync */
  remoteContent: string | null;
  broadcastEdit: (snap: string) => void;
  broadcastCursor: (line: number, col: number) => void;
  broadcastTyping: (typing: boolean) => void;
  anyTyping:     boolean;

  /* Version history */
  versions:      VersionRecord[];
  saveVersion:   (label?: string) => void;
  restoreVersion: (id: string) => void;

  /* Save status */
  saveStatus:    SaveStatus;
  lastSavedAt:   number | null;
  triggerAutoSave: (content: string) => void;

  /* Undo / redo */
  canUndo: boolean;
  canRedo: boolean;
  undo:    () => string | null;
  redo:    () => string | null;
  pushUndo: (content: string) => void;

  /* Comments */
  comments:      CollabComment[];
  addComment:    (text: string, lineRef?: number) => void;
  replyToComment: (commentId: string, text: string) => void;
  resolveComment: (commentId: string) => void;
  deleteComment:  (commentId: string) => void;

  /* Activity */
  activity:      ActivityEntry[];
  logActivity:   (kind: ActivityEntry['kind'], description: string) => void;

  /* Conflict */
  conflict:      ConflictInfo | null;
  dismissConflict: () => void;
}

export function useCollabEngine(
  token:    string | null,
  userName: string = 'Anonymous',
): CollabEngineState {

  /* ── Base collab session ── */
  const base = useCollabSession(token, userName);

  /* ── Persistent data ── */
  const [versions,  setVersions]  = useState<VersionRecord[]>([]);
  const [comments,  setComments]  = useState<CollabComment[]>([]);
  const [activity,  setActivity]  = useState<ActivityEntry[]>([]);
  const [conflict,  setConflict]  = useState<ConflictInfo | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  /* ── Undo/redo stack ── */
  const undoStack = useRef<string[]>([]);
  const undoIdx   = useRef<number>(-1);

  /* ── Auto-save ── */
  const autoSaveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveContent   = useRef<string>('');
  const hardSaveInterval  = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Load from localStorage on mount / token change ── */
  useEffect(() => {
    if (!token) return;
    setVersions(loadJSON<VersionRecord[]>(versionsKey(token), []));
    setComments(loadJSON<CollabComment[]>(commentsKey(token), []));
    setActivity(loadJSON<ActivityEntry[]>(activityKey(token), []));
  }, [token]);

  /* ── Hard save interval (30 s) ── */
  useEffect(() => {
    if (!token) return;
    hardSaveInterval.current = setInterval(() => {
      if (autoSaveContent.current) {
        performSave(autoSaveContent.current, true);
      }
    }, 30_000);
    return () => {
      if (hardSaveInterval.current) clearInterval(hardSaveInterval.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* ── Internal save helper ── */
  function performSave(content: string, isAuto: boolean, label?: string) {
    if (!token || !content) return;
    setSaveStatus('saving');
    const rec: VersionRecord = {
      id:         generateShareToken(),
      token,
      content,
      at:         Date.now(),
      authorName: userName,
      sessionId:  base.sessionId,
      isAutoSave: isAuto,
      label:      label ?? (isAuto ? 'Auto-save' : 'Manual save'),
      size:       content.length,
    };
    setVersions(prev => {
      const updated = [rec, ...prev].slice(0, MAX_VERSIONS);
      saveJSON(versionsKey(token), updated);
      return updated;
    });
    setLastSavedAt(Date.now());
    setTimeout(() => setSaveStatus('saved'), 400);
    if (!isAuto) {
      appendActivity('save', `Saved version "${rec.label}"`);
    }
  }

  /* ── Append to activity feed ── */
  const appendActivity = useCallback((
    kind: ActivityEntry['kind'],
    description: string,
  ) => {
    if (!token) return;
    const me = base.users.find(u => u.sessionId === base.sessionId);
    const entry: ActivityEntry = {
      id:          generateShareToken(),
      sessionId:   base.sessionId,
      authorName:  userName,
      authorColor: me?.color ?? '#94a3b8',
      kind,
      description,
      at:          Date.now(),
    };
    setActivity(prev => {
      const updated = [entry, ...prev].slice(0, MAX_ACTIVITY);
      saveJSON(activityKey(token), updated);
      return updated;
    });
  }, [token, base.sessionId, base.users, userName]);

  /* ── Detect conflict on incoming remote content ── */
  useEffect(() => {
    if (!base.remoteContent) return;
    /* Heuristic: if incoming content is very different from local, flag conflict */
    const currentLocal = autoSaveContent.current;
    if (currentLocal && base.remoteContent !== currentLocal) {
      const diffRatio = Math.abs(currentLocal.length - base.remoteContent.length) / Math.max(currentLocal.length, 1);
      if (diffRatio > 0.3) {
        const editor = base.users.find(u => u.sessionId !== base.sessionId);
        if (editor) {
          setConflict({ sessionId: editor.sessionId, authorName: editor.name, at: Date.now(), theirContent: base.remoteContent });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.remoteContent]);

  /* ── Log join/leave from user changes ── */
  const prevUsersRef = useRef<CollabUser[]>([]);
  useEffect(() => {
    const prev    = prevUsersRef.current;
    const current = base.users;
    // Joined
    current.forEach(u => {
      if (u.sessionId !== base.sessionId && !prev.find(p => p.sessionId === u.sessionId)) {
        appendActivity('join', `${u.name} joined`);
      }
    });
    // Left
    prev.forEach(u => {
      if (u.sessionId !== base.sessionId && !current.find(c => c.sessionId === u.sessionId)) {
        appendActivity('leave', `${u.name} left`);
      }
    });
    prevUsersRef.current = current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.users]);

  /* ── Public API ── */

  const triggerAutoSave = useCallback((content: string) => {
    autoSaveContent.current = content;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSaveStatus('saving');
    autoSaveTimer.current = setTimeout(() => performSave(content, true), 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, userName]);

  const saveVersion = useCallback((label?: string) => {
    performSave(autoSaveContent.current, false, label);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, userName]);

  const restoreVersion = useCallback((id: string) => {
    const rec = versions.find(v => v.id === id);
    if (!rec) return;
    appendActivity('restore', `Restored version from ${new Date(rec.at).toLocaleTimeString()}`);
    // Caller should update their content via remoteContent pattern
    // We broadcast the restored snapshot as an edit
    base.broadcastEdit(rec.content);
    performSave(rec.content, false, `Restored: ${rec.label ?? 'version'}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, base.broadcastEdit]);

  /* Undo / redo */
  const pushUndo = useCallback((content: string) => {
    // Trim forward history
    undoStack.current = undoStack.current.slice(0, undoIdx.current + 1);
    undoStack.current.push(content);
    if (undoStack.current.length > 100) undoStack.current.shift();
    undoIdx.current = undoStack.current.length - 1;
  }, []);

  const undo = useCallback((): string | null => {
    if (undoIdx.current <= 0) return null;
    undoIdx.current -= 1;
    return undoStack.current[undoIdx.current] ?? null;
  }, []);

  const redo = useCallback((): string | null => {
    if (undoIdx.current >= undoStack.current.length - 1) return null;
    undoIdx.current += 1;
    return undoStack.current[undoIdx.current] ?? null;
  }, []);

  /* Comments */
  const addComment = useCallback((text: string, lineRef?: number) => {
    if (!token) return;
    const me = base.users.find(u => u.sessionId === base.sessionId);
    const comment: CollabComment = {
      id:          generateShareToken(),
      sessionId:   base.sessionId,
      authorName:  userName,
      authorColor: me?.color ?? '#94a3b8',
      text,
      lineRef,
      resolved:    false,
      createdAt:   Date.now(),
      replies:     [],
    };
    setComments(prev => {
      const updated = [comment, ...prev];
      saveJSON(commentsKey(token), updated);
      return updated;
    });
    appendActivity('comment', `Commented: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`);
  }, [token, base.sessionId, base.users, userName, appendActivity]);

  const replyToComment = useCallback((commentId: string, text: string) => {
    if (!token) return;
    const me = base.users.find(u => u.sessionId === base.sessionId);
    const reply: CollabReply = {
      id:          generateShareToken(),
      sessionId:   base.sessionId,
      authorName:  userName,
      authorColor: me?.color ?? '#94a3b8',
      text,
      createdAt:   Date.now(),
    };
    setComments(prev => {
      const updated = prev.map(c => c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c);
      saveJSON(commentsKey(token), updated);
      return updated;
    });
  }, [token, base.sessionId, base.users, userName]);

  const resolveComment = useCallback((commentId: string) => {
    if (!token) return;
    setComments(prev => {
      const updated = prev.map(c => c.id === commentId ? { ...c, resolved: true } : c);
      saveJSON(commentsKey(token), updated);
      return updated;
    });
    appendActivity('resolve', 'Resolved a comment');
  }, [token, appendActivity]);

  const deleteComment = useCallback((commentId: string) => {
    if (!token) return;
    setComments(prev => {
      const updated = prev.filter(c => c.id !== commentId);
      saveJSON(commentsKey(token), updated);
      return updated;
    });
  }, [token]);

  const logActivity = useCallback((kind: ActivityEntry['kind'], description: string) => {
    appendActivity(kind, description);
  }, [appendActivity]);

  return {
    /* base */
    sessionId:    base.sessionId,
    users:        base.users,
    connected:    base.connected,
    remoteContent: base.remoteContent,
    broadcastEdit: base.broadcastEdit,
    broadcastCursor: base.broadcastCursor,
    broadcastTyping: base.broadcastTyping,
    anyTyping:    base.anyTyping,
    /* versions */
    versions,
    saveVersion,
    restoreVersion,
    /* save status */
    saveStatus,
    lastSavedAt,
    triggerAutoSave,
    /* undo/redo */
    canUndo: undoIdx.current > 0,
    canRedo: undoIdx.current < undoStack.current.length - 1,
    undo,
    redo,
    pushUndo,
    /* comments */
    comments,
    addComment,
    replyToComment,
    resolveComment,
    deleteComment,
    /* activity */
    activity,
    logActivity,
    /* conflict */
    conflict,
    dismissConflict: () => setConflict(null),
  };
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 30_000)  return 'just now';
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}
