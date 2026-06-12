/**
 * CollabSession — real-time collaborative editing engine.
 *
 * Transport: BroadcastChannel (same-browser, cross-tab).
 * For cross-device collab the platform would swap this for a WebSocket;
 * the hook interface remains identical.
 *
 * Events broadcast:
 *   presence  — user joined / left
 *   cursor    — user cursor position
 *   edit      — content diff/patch
 *   ping      — heartbeat to keep presence alive
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { generateShareToken } from './shareStore';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type CollabEventKind = 'presence' | 'cursor' | 'edit' | 'ping' | 'typing';

export interface CollabUser {
  sessionId: string;
  name:      string;
  color:     string;
  joinedAt:  number;
  lastSeen:  number;
  cursor?:   { line: number; col: number };
  typing?:   boolean;
}

export interface CollabEvent {
  kind:      CollabEventKind;
  token:     string;
  sessionId: string;
  user:      CollabUser;
  payload?:  unknown;
}

export interface EditPayload {
  /** Unified-diff-style string, or full replacement for small files */
  delta:    string;
  /** Full content snapshot for small docs */
  snapshot?: string;
  ts:       number;
}

/* ─── Colour palette for participants ───────────────────────────────────── */

const COLLAB_COLORS = [
  '#a78bfa', '#34d399', '#fb923c', '#f472b6',
  '#60a5fa', '#fbbf24', '#4ade80', '#e879f9',
];
let _colorIdx = 0;
function nextColor() { return COLLAB_COLORS[_colorIdx++ % COLLAB_COLORS.length]; }

/* ─── Channel name helper ────────────────────────────────────────────────── */

function channelName(token: string) { return `docrud_collab_${token}`; }

/* ─── useCollabSession hook ─────────────────────────────────────────────── */

export interface CollabSessionState {
  /** Local user's session id */
  sessionId:   string;
  /** All currently online participants (including self) */
  users:       CollabUser[];
  /** Latest content snapshot broadcast by any peer */
  remoteContent: string | null;
  /** True if a peer is actively typing */
  anyTyping:   boolean;
  /** Emit a content edit to all peers */
  broadcastEdit:   (snapshot: string) => void;
  /** Emit a cursor position */
  broadcastCursor: (line: number, col: number) => void;
  /** Emit a typing indicator */
  broadcastTyping: (typing: boolean) => void;
  /** Whether the channel is active */
  connected: boolean;
}

export function useCollabSession(
  token: string | null,
  userName: string = 'Anonymous',
): CollabSessionState {
  const sessionIdRef = useRef<string>(generateShareToken());
  const sessionId    = sessionIdRef.current;
  const myColor      = useRef<string>(nextColor()).current;

  const [users,         setUsers]         = useState<CollabUser[]>([]);
  const [remoteContent, setRemoteContent] = useState<string | null>(null);
  const [anyTyping,     setAnyTyping]     = useState(false);
  const [connected,     setConnected]     = useState(false);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const myUser = useCallback((): CollabUser => ({
    sessionId,
    name:     userName,
    color:    myColor,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  }), [sessionId, userName, myColor]);

  const broadcast = useCallback((event: CollabEvent) => {
    channelRef.current?.postMessage(event);
  }, []);

  /* Join / maintain presence */
  useEffect(() => {
    if (!token || typeof window === 'undefined') return;
    if (!('BroadcastChannel' in window)) return;

    const ch = new BroadcastChannel(channelName(token));
    channelRef.current = ch;
    setConnected(true);

    /* Announce join */
    const joinEvent: CollabEvent = { kind: 'presence', token, sessionId, user: { ...myUser(), lastSeen: Date.now() }, payload: 'join' };
    ch.postMessage(joinEvent);

    /* Add self to local users */
    setUsers([{ ...myUser(), lastSeen: Date.now() }]);

    /* Heartbeat every 4 s */
    pingRef.current = setInterval(() => {
      const ping: CollabEvent = { kind: 'ping', token, sessionId, user: { ...myUser(), lastSeen: Date.now() } };
      ch.postMessage(ping);
      /* Prune stale participants (>12 s without ping) */
      setUsers(prev => prev.filter(u => u.sessionId === sessionId || Date.now() - u.lastSeen < 12_000));
    }, 4_000);

    /* Handle incoming messages */
    ch.onmessage = (ev: MessageEvent<CollabEvent>) => {
      const e = ev.data;
      if (e.token !== token) return;

      setUsers(prev => {
        const idx = prev.findIndex(u => u.sessionId === e.sessionId);
        if (e.payload === 'leave') return prev.filter(u => u.sessionId !== e.sessionId);
        const updated: CollabUser = { ...e.user, lastSeen: Date.now() };
        if (idx >= 0) {
          const next = [...prev]; next[idx] = updated; return next;
        }
        return [...prev, updated];
      });

      if (e.kind === 'edit') {
        const p = e.payload as EditPayload;
        if (p?.snapshot !== undefined && e.sessionId !== sessionId) {
          setRemoteContent(p.snapshot);
        }
      }

      if (e.kind === 'typing' && e.sessionId !== sessionId) {
        setAnyTyping(!!(e.payload as { typing: boolean })?.typing);
      }
    };

    return () => {
      const leave: CollabEvent = { kind: 'presence', token, sessionId, user: myUser(), payload: 'leave' };
      try { ch.postMessage(leave); } catch {}
      ch.close();
      channelRef.current = null;
      if (pingRef.current) clearInterval(pingRef.current);
      setConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const broadcastEdit = useCallback((snapshot: string) => {
    if (!token) return;
    const e: CollabEvent = {
      kind: 'edit', token, sessionId, user: { ...myUser(), lastSeen: Date.now() },
      payload: { snapshot, delta: snapshot, ts: Date.now() } satisfies EditPayload,
    };
    broadcast(e);
  }, [token, sessionId, myUser, broadcast]);

  const broadcastCursor = useCallback((line: number, col: number) => {
    if (!token) return;
    const e: CollabEvent = {
      kind: 'cursor', token, sessionId,
      user: { ...myUser(), lastSeen: Date.now(), cursor: { line, col } },
    };
    broadcast(e);
  }, [token, sessionId, myUser, broadcast]);

  const broadcastTyping = useCallback((typing: boolean) => {
    if (!token) return;
    const e: CollabEvent = {
      kind: 'typing', token, sessionId, user: { ...myUser(), lastSeen: Date.now() },
      payload: { typing },
    };
    broadcast(e);
  }, [token, sessionId, myUser, broadcast]);

  return { sessionId, users, remoteContent, anyTyping, broadcastEdit, broadcastCursor, broadcastTyping, connected };
}

/* ─── Presence badge helper (for collab indicator UI) ───────────────────── */

export function avatarInitials(name: string): string {
  return name.split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');
}
