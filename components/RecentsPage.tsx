'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchTracker, SEARCH_CONTEXTS } from '@/lib/search-tracking';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recent {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  type: 'image' | 'video' | 'text';
  mediaUrl?: string | null;
  caption?: string | null;
  bgGradient?: string;
  textColor?: string;
  fontStyle?: string;
  fontSize?: number;
  ctaLabel?: string;
  ctaUrl?: string;
  category: string;
  visibility: 'public' | 'private';
  viewCount: number;
  viewedBy: string[];
  likedBy: string[];
  createdAt: string;
  expiresAt: string;
}

type SortKey    = 'newest' | 'liked' | 'viewed' | 'expiring';
type TypeFilter = 'all' | 'text' | 'image' | 'video';

const CATEGORIES = [
  'All','General','Work','Product','Design','Tech','Finance',
  'Legal','Marketing','Career','Announcement','Update','Insight',
];

const SORT_OPTIONS: { id: SortKey; label: string; icon: string }[] = [
  { id: 'newest',   label: 'Newest',       icon: '✦' },
  { id: 'liked',    label: 'Most Liked',   icon: '♥' },
  { id: 'viewed',   label: 'Most Viewed',  icon: '◉' },
  { id: 'expiring', label: 'Expiring Soon',icon: '◷' },
];

const TYPE_OPTIONS: { id: TypeFilter; label: string }[] = [
  { id: 'all',   label: 'All' },
  { id: 'text',  label: 'Text' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msLeft(expiresAt: string) { return Math.max(0, new Date(expiresAt).getTime() - Date.now()); }

function fmtLeft(expiresAt: string) {
  const ms = msLeft(expiresAt);
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getFontStyle(fontStyle?: string): React.CSSProperties {
  if (fontStyle === 'serif')   return { fontFamily: "'Georgia','Times New Roman',serif", fontWeight: 400 };
  if (fontStyle === 'mono')    return { fontFamily: "'JetBrains Mono','Fira Code',monospace", fontWeight: 500 };
  if (fontStyle === 'display') return { fontFamily: 'system-ui,sans-serif', fontWeight: 800, letterSpacing: '-0.03em' };
  return { fontFamily: 'system-ui,sans-serif', fontWeight: 600 };
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Av({ src, name, size = 24 }: { src?: string | null; name?: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? ''} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block', border: '1px solid rgba(255,255,255,0.10)' }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
      {(name ?? '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function Card({ r, seen, rank, onClick }: { r: Recent; seen: boolean; rank?: number; onClick(): void }) {
  const [hovered, setHovered] = useState(false);
  const pct = (msLeft(r.expiresAt) / (24 * 3600 * 1000)) * 100;
  const urgency = pct < 15;

  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rp-card"
      style={{
        position: 'relative', width: '100%', aspectRatio: '2/3',
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer', display: 'block',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.20)' : seen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'}`,
        background: '#080810',
        transition: 'transform 200ms cubic-bezier(0.22,1,0.36,1), border-color 160ms ease, box-shadow 200ms ease',
        transform: hovered ? 'translateY(-4px) scale(1.015)' : 'none',
        boxShadow: hovered ? '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)' : '0 2px 12px rgba(0,0,0,0.25)',
        outline: 'none',
      }}
    >
      {/* Expiry bar top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.05)', zIndex: 2 }}>
        <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: urgency ? 'linear-gradient(90deg,#ff4444,#ff6b6b)' : 'linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.45))', borderRadius: 99 }} />
      </div>

      {/* Background */}
      {r.type === 'image' && r.mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.mediaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 350ms ease', transform: hovered ? 'scale(1.06)' : 'none' }} />
      )}
      {r.type === 'video' && r.mediaUrl && (
        <video src={r.mediaUrl} muted autoPlay={hovered} loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {r.type === 'text' && (
        <div style={{ position: 'absolute', inset: 0, background: r.bgGradient ?? 'linear-gradient(160deg,#0e0e14,#1a1a24)' }} />
      )}

      {/* Gradient scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.08) 50%, transparent 100%)', opacity: hovered ? 1 : 0.75, transition: 'opacity 200ms ease' }} />

      {/* Seen overlay */}
      {seen && !hovered && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', zIndex: 1 }} />}

      {/* Rank badge */}
      {rank !== undefined && rank <= 2 && (
        <div style={{ position: 'absolute', top: 9, left: 9, zIndex: 5, padding: '3px 7px', borderRadius: 7, background: rank === 0 ? 'rgba(255,220,60,0.92)' : 'rgba(180,180,180,0.18)', backdropFilter: 'blur(6px)', border: `1px solid ${rank === 0 ? 'rgba(255,220,60,0.40)' : 'rgba(255,255,255,0.15)'}` }}>
          <span style={{ fontSize: 8.5, fontWeight: 800, color: rank === 0 ? '#000' : 'rgba(255,255,255,0.75)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{rank === 0 ? '#1' : '#2'}</span>
        </div>
      )}

      {/* Lock */}
      {r.visibility === 'private' && (
        <div style={{ position: 'absolute', top: 9, right: 9, zIndex: 5, width: 20, height: 20, borderRadius: 6, background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="8" height="10" viewBox="0 0 8 10" fill="none"><rect x="1" y="4.5" width="6" height="5" rx="1" fill="rgba(255,255,255,0.50)"/><path d="M1.5 4.5V3a2.5 2.5 0 0 1 5 0v1.5" stroke="rgba(255,255,255,0.50)" strokeWidth="1.2" fill="none"/></svg>
        </div>
      )}

      {/* Video play */}
      {r.type === 'video' && (
        <div style={{ position: 'absolute', top: '42%', left: '50%', zIndex: 4, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hovered ? 1 : 0.65, transition: 'all 200ms ease', transform: `translate(-50%,-50%) scale(${hovered ? 1.1 : 1})` }}>
          <svg width="10" height="12" viewBox="0 0 10 12" fill="white"><path d="M1.5 1.5l7 4.5-7 4.5V1.5z"/></svg>
        </div>
      )}

      {/* Caption (text type) */}
      {r.type === 'text' && r.caption && (
        <div style={{ position: 'absolute', top: '50%', left: 12, right: 12, transform: 'translateY(-50%)', textAlign: 'center', zIndex: 3 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: r.textColor ?? '#fff', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', ...getFontStyle(r.fontStyle) }}>
            {r.caption}
          </p>
        </div>
      )}

      {/* Bottom info (always visible) */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5, padding: '8px 9px 9px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: hovered ? 1 : 0.70, transition: 'opacity 180ms ease' }}>
          <Av src={r.userAvatar} name={r.userName} size={17} />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.70)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.userName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, opacity: hovered ? 1 : 0, transition: 'opacity 200ms ease' }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.42)', background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 5px' }}>{r.category}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', flex: 1 }}>{fmtAgo(r.createdAt)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
            <svg width="8" height="7" viewBox="0 0 12 9" fill="none"><path d="M6 8S1 5.5 1 3a2.5 2.5 0 0 1 5 0A2.5 2.5 0 0 1 11 3c0 2.5-5 5-5 5z" fill="rgba(255,100,100,0.75)"/></svg>
            <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.38)', fontVariantNumeric: 'tabular-nums' }}>{r.likedBy.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
            <svg width="8" height="6.5" viewBox="0 0 12 9" fill="none"><path d="M1 4.5C2.5 2 4.2 1 6 1s3.5 1 5 3.5C9.5 7 7.8 8 6 8S2.5 7 1 4.5z" stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" fill="none"/><circle cx="6" cy="4.5" r="1.5" fill="rgba(255,255,255,0.38)"/></svg>
            <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.38)', fontVariantNumeric: 'tabular-nums' }}>{r.viewCount}</span>
          </div>
        </div>
        {r.caption && r.type !== 'text' && hovered && (
          <p style={{ margin: '5px 0 0', fontSize: 10.5, color: 'rgba(255,255,255,0.50)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.caption}</p>
        )}
      </div>

      {/* Expiry chip */}
      {urgency && (
        <div style={{ position: 'absolute', bottom: 9, right: 9, zIndex: 6, padding: '2px 6px', borderRadius: 5, background: 'rgba(255,50,50,0.12)', border: '1px solid rgba(255,80,80,0.22)', backdropFilter: 'blur(4px)' }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,120,120,0.90)', letterSpacing: '0.05em' }}>{fmtLeft(r.expiresAt)}</span>
        </div>
      )}
    </button>
  );
}

// ─── Viewer ───────────────────────────────────────────────────────────────────

const STORY_MS = 6000;

function Viewer({ recents, startIdx, uid, onClose, onDelete }: {
  recents: Recent[]; startIdx: number; uid?: string;
  onClose(): void; onDelete(id: string): void;
}) {
  const [idx, setIdx]       = useState(startIdx);
  const [prog, setProg]     = useState(0);
  const [paused, setPaused] = useState(false);
  const [ui, setUi]         = useState(true);
  const [liked, setLiked]   = useState(false);
  const [flash, setFlash]   = useState(false);
  const rafRef  = useRef<number>(0);
  const startTs = useRef(0);
  const elapsed = useRef(0);
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cur   = recents[idx];
  const isOwn = cur?.userId === uid;

  function showUi() {
    setUi(true);
    if (uiTimer.current) clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => setUi(false), 3500);
  }
  useEffect(() => { showUi(); return () => { if (uiTimer.current) clearTimeout(uiTimer.current); }; }, [idx]);
  useEffect(() => {
    if (!cur || !uid) return;
    setLiked(cur.likedBy.includes(uid));
    fetch(`/api/recents/${cur.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'view' }) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, uid]);

  useEffect(() => {
    if (!cur) return;
    elapsed.current = 0; setProg(0); startTs.current = 0;
    const tick = (ts: number) => {
      if (!startTs.current) startTs.current = ts;
      if (!paused) {
        elapsed.current = ts - startTs.current;
        const p = Math.min((elapsed.current / STORY_MS) * 100, 100);
        setProg(p);
        if (p >= 100) { next(); return; }
      } else { startTs.current = ts - elapsed.current; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, paused, cur]);

  function next() { if (idx < recents.length - 1) setIdx(i => i + 1); else onClose(); }
  function prev() { if (idx > 0) setIdx(i => i - 1); }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'Escape')     onClose();
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const touchX = useRef(0);
  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0].clientX; setPaused(true); }
  function onTouchEnd(e: React.TouchEvent) {
    setPaused(false);
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
  }

  async function handleLike() {
    if (!uid || !cur) return;
    setLiked(l => !l); setFlash(true); setTimeout(() => setFlash(false), 700);
    await fetch(`/api/recents/${cur.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'like' }) });
  }

  async function handleDelete() {
    if (!cur || !isOwn || !confirm('Delete this recent?')) return;
    await fetch(`/api/recents/${cur.id}`, { method: 'DELETE' });
    onDelete(cur.id);
    if (recents.length <= 1) onClose(); else if (idx >= recents.length - 1) setIdx(recents.length - 2);
  }

  if (!cur) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseMove={showUi} onClick={showUi} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <style>{`@keyframes rcHrt{0%{transform:scale(1)}35%{transform:scale(1.6)}70%{transform:scale(0.9)}100%{transform:scale(1)}} @keyframes rcIn{from{opacity:0}to{opacity:1}}`}</style>

      <div style={{ position: 'absolute', inset: 0, animation: 'rcIn 0.22s ease both' }}>
        {cur.type === 'video' && cur.mediaUrl
          ? <video src={cur.mediaUrl} autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : cur.type === 'image' && cur.mediaUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cur.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <div style={{ position: 'absolute', inset: 0, background: cur.bgGradient ?? '#0a0a0a' }} />
        }
        {cur.type !== 'text' && cur.mediaUrl && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.50) 100%)' }} />}
      </div>

      {cur.caption && (
        <div style={{ position: 'absolute', bottom: cur.ctaUrl ? 116 : 72, left: 24, right: 24, zIndex: 5, textAlign: 'center', pointerEvents: 'none' }}>
          <p style={{ margin: 0, fontSize: cur.fontSize ?? 22, lineHeight: 1.35, color: cur.textColor ?? '#fff', textShadow: cur.type !== 'text' ? '0 2px 20px rgba(0,0,0,0.70)' : 'none', wordBreak: 'break-word', ...getFontStyle(cur.fontStyle) }}>
            {cur.caption}
          </p>
        </div>
      )}

      {cur.ctaUrl && cur.ctaLabel && (
        <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', opacity: ui ? 1 : 0, transition: 'opacity 300ms ease' }}>
          <a href={cur.ctaUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 99, background: 'rgba(255,255,255,0.92)', color: '#000', fontSize: 13, fontWeight: 700, textDecoration: 'none', letterSpacing: '-0.01em' }}>
            {cur.ctaLabel}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H4M10 2v6" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      )}

      {/* Top UI */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, opacity: ui ? 1 : 0, transition: 'opacity 350ms ease' }}>
        <div style={{ display: 'flex', gap: 3, padding: '12px 14px 0' }}>
          {recents.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 2.5, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#fff', borderRadius: 99, width: i < idx ? '100%' : i === idx ? `${prog}%` : '0%', transition: i === idx ? 'none' : 'none' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 0' }}>
          <Av src={cur.userAvatar} name={cur.userName} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{cur.userName}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>{fmtAgo(cur.createdAt)}</span>
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'rgba(255,255,255,0.20)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', textTransform: 'capitalize' }}>{cur.category}</span>
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'rgba(255,255,255,0.20)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>{fmtLeft(cur.expiresAt)} left</span>
            </div>
          </div>
          {isOwn && (
            <button type="button" onClick={handleDelete} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="12" height="14" viewBox="0 0 13 15" fill="none"><path d="M1 3.5h11M4.5 3.5V2h4v1.5M2.5 3.5l.8 9h6.4l.8-9" stroke="rgba(255,80,80,0.70)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1 1 11" stroke="rgba(255,255,255,0.60)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* Tap zones */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 6, display: 'flex' }}>
        <div style={{ flex: 1 }} onPointerDown={() => setPaused(true)} onPointerUp={() => { setPaused(false); prev(); }} />
        <div style={{ flex: 1 }} onPointerDown={() => setPaused(true)} onPointerUp={() => { setPaused(false); next(); }} />
      </div>

      {/* Bottom UI */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, opacity: ui ? 1 : 0, transition: 'opacity 350ms ease', padding: '0 18px 32px', background: 'linear-gradient(to top,rgba(0,0,0,0.55),transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="9" viewBox="0 0 12 9" fill="none"><path d="M1 4.5C2.5 2 4.2 1 6 1s3.5 1 5 3.5C9.5 7 7.8 8 6 8S2.5 7 1 4.5z" stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" fill="none"/><circle cx="6" cy="4.5" r="1.5" fill="rgba(255,255,255,0.38)"/></svg>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontVariantNumeric: 'tabular-nums' }}>{cur.viewCount}</span>
          </div>
          <div style={{ flex: 1 }} />
          {uid && (
            <button type="button" onClick={handleLike} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <svg width="20" height="18" viewBox="0 0 18 17" fill="none" style={{ animation: flash ? 'rcHrt 0.6s ease both' : 'none' }}>
                <path d="M9 15.5S1.5 11 1.5 5.5a4 4 0 0 1 7.5-2A4 4 0 0 1 16.5 5.5C16.5 11 9 15.5 9 15.5z" fill={liked ? '#ff3b5c' : 'none'} stroke={liked ? '#ff3b5c' : 'rgba(255,255,255,0.55)'} strokeWidth="1.4"/>
              </svg>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', fontVariantNumeric: 'tabular-nums' }}>{cur.likedBy.length}</span>
            </button>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            {recents.map((_, i) => (
              <div key={i} style={{ width: i === idx ? 18 : 5, height: 5, borderRadius: 99, background: i === idx ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.18)', transition: 'all 250ms ease' }} />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Active filter chip ────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove(): void }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px 4px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap' }}>{label}</span>
      <button type="button" onClick={onRemove} style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1 1 7" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RecentsPage() {
  const { data: session } = useSession();
  const uid = (session?.user as { id?: string })?.id ?? null;

  const [recents,     setRecents]     = useState<Recent[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [sort,        setSort]        = useState<SortKey>('newest');
  const [typeF,       setTypeF]       = useState<TypeFilter>('all');
  const [catF,        setCatF]        = useState('All');
  const [visF,        setVisF]        = useState<'all' | 'public' | 'private'>('all');
  const [search,      setSearch]      = useState('');
  const trackSearch = useSearchTracker(SEARCH_CONTEXTS.RECENTS);
  const [viewIdx,     setViewIdx]     = useState<number | null>(null);
  const [isMounted,   setIsMounted]   = useState(false);
  const [filterOpen,  setFilterOpen]  = useState(false);
  const catScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recents');
      const d   = await res.json() as { recents?: Recent[] };
      if (Array.isArray(d.recents)) setRecents(d.recents);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let list = [...recents];
    if (typeF !== 'all')   list = list.filter(r => r.type === typeF);
    if (catF  !== 'All')   list = list.filter(r => r.category === catF);
    if (visF  !== 'all')   list = list.filter(r => r.visibility === visF);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.userName.toLowerCase().includes(q) ||
        (r.caption ?? '').toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case 'liked':    list.sort((a, b) => b.likedBy.length  - a.likedBy.length); break;
      case 'viewed':   list.sort((a, b) => b.viewCount       - a.viewCount);       break;
      case 'expiring': list.sort((a, b) => msLeft(a.expiresAt) - msLeft(b.expiresAt)); break;
      default:         list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
    }
    return list;
  }, [recents, typeF, catF, visF, search, sort]);

  useEffect(() => {
    if (search.trim()) trackSearch(search, filtered.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtered.length]);

  const filteredToOriginal = useMemo(() =>
    filtered.map(fr => recents.findIndex(r => r.id === fr.id)),
  [filtered, recents]);

  const totalLikes   = useMemo(() => recents.reduce((s, r) => s + r.likedBy.length, 0), [recents]);
  const totalViews   = useMemo(() => recents.reduce((s, r) => s + r.viewCount, 0), [recents]);
  const expiringSoon = useMemo(() => recents.filter(r => msLeft(r.expiresAt) < 3 * 3600 * 1000).length, [recents]);

  const activeFilterCount = [typeF !== 'all', catF !== 'All', visF !== 'all', !!search.trim()].filter(Boolean).length;

  function handleDelete(id: string) {
    setRecents(p => p.filter(r => r.id !== id));
    setViewIdx(null);
  }

  const openFiltered = (filtIdx: number) => setViewIdx(filteredToOriginal[filtIdx]);

  function clearAll() { setTypeF('all'); setCatF('All'); setVisF('all'); setSearch(''); }

  return (
    <div style={{ minHeight: '100svh', background: '#05050a', color: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <style>{`
        @keyframes rpIn  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes rpCard{ from{opacity:0;transform:translateY(6px) scale(0.97)} to{opacity:1;transform:none} }
        @keyframes rpSlide{ from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        @keyframes rpPulse{ 0%,100%{opacity:.3} 50%{opacity:.6} }
        .rp-sc::-webkit-scrollbar { display:none }
        .rp-inp::placeholder { color:rgba(255,255,255,0.20) }
        .rp-inp:focus { outline:none; border-color:rgba(255,255,255,0.18) !important; background:rgba(255,255,255,0.05) !important }
        .rp-chip-btn { transition: all 140ms ease }
        .rp-chip-btn:hover { border-color:rgba(255,255,255,0.20) !important; color:rgba(255,255,255,0.75) !important; background:rgba(255,255,255,0.06) !important }
        .rp-card { -webkit-tap-highlight-color: transparent }
        .rp-sort-btn { transition: all 130ms ease }
        .rp-sort-btn:hover { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.16) !important; color: rgba(255,255,255,0.65) !important }

        /* Responsive grid */
        .rp-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
        }
        @media (max-width: 1280px) { .rp-grid { grid-template-columns: repeat(5, 1fr); } }
        @media (max-width: 1024px) { .rp-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 768px)  { .rp-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; } }
        @media (max-width: 480px)  { .rp-grid { grid-template-columns: repeat(2, 1fr); gap: 7px; } }

        /* Responsive controls strip */
        .rp-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        @media (max-width: 640px) { .rp-controls { gap: 6px; } }

        /* Nav search hide on mobile */
        .rp-nav-search { display: flex; }
        @media (max-width: 600px) { .rp-nav-search { display: none; } }

        /* Nav stats hide on small */
        .rp-nav-stats { display: flex; }
        @media (max-width: 480px) { .rp-nav-stats { display: none; } }

        /* Mobile search row */
        .rp-mobile-search { display: none; }
        @media (max-width: 600px) { .rp-mobile-search { display: flex; } }

        /* Filter panel open */
        .rp-filter-panel { animation: rpSlide 0.20s cubic-bezier(0.22,1,0.36,1) both; }

        /* Spotlight grid */
        .rp-spotlight {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        @media (max-width: 600px) { .rp-spotlight { grid-template-columns: 1fr; } }

        /* Content padding */
        .rp-content { padding: 24px 24px 72px; }
        @media (max-width: 640px) { .rp-content { padding: 16px 14px 80px; } }

        /* Nav padding */
        .rp-nav-inner { padding: 0 24px; }
        @media (max-width: 640px) { .rp-nav-inner { padding: 0 14px; } }
      `}</style>

      {/* ── Sticky nav ─────────────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,5,10,0.88)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }}>
        <div className="rp-nav-inner" style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>

          {/* Back + title */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', flexShrink: 0, padding: '4px 0' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="rgba(255,255,255,0.40)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </Link>

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>Recents</span>
            {!loading && recents.length > 0 && (
              <span className="rp-nav-stats" style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 500, letterSpacing: '-0.01em', alignItems: 'center', gap: 5 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{recents.length}</span> stories
                <span style={{ margin: '0 2px', color: 'rgba(255,255,255,0.14)' }}>·</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalLikes}</span> likes
                <span style={{ margin: '0 2px', color: 'rgba(255,255,255,0.14)' }}>·</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalViews}</span> views
                {expiringSoon > 0 && <>
                  <span style={{ margin: '0 2px', color: 'rgba(255,255,255,0.14)' }}>·</span>
                  <span style={{ color: 'rgba(255,160,60,0.80)', fontWeight: 600 }}>{expiringSoon} expiring</span>
                </>}
              </span>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search — hidden on mobile */}
          <div className="rp-nav-search" style={{ position: 'relative', alignItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="6" cy="6" r="4.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.3"/>
              <path d="M10 10l3 3" stroke="rgba(255,255,255,0.25)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input className="rp-inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recents…"
              style={{ width: 200, height: 34, paddingLeft: 28, paddingRight: 12, borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.80)', fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box', transition: 'all 150ms ease' }} />
          </div>

          {/* Filter toggle */}
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            style={{ height: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${filterOpen || activeFilterCount > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'}`, background: filterOpen || activeFilterCount > 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: filterOpen || activeFilterCount > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, transition: 'all 150ms ease' }}>
            <svg width="12" height="10" viewBox="0 0 14 12" fill="none"><path d="M1 2h12M3 6h8M5 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.90)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#000' }}>{activeFilterCount}</span>
              </div>
            )}
          </button>

          {/* Refresh */}
          <button type="button" onClick={load}
            style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 150ms ease', color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M7 1v3.5l2.5-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {/* Mobile search row */}
        <div className="rp-mobile-search rp-nav-inner" style={{ paddingBottom: 10, alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="6" cy="6" r="4.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.3"/>
              <path d="M10 10l3 3" stroke="rgba(255,255,255,0.25)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input className="rp-inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recents…"
              style={{ width: '100%', height: 36, paddingLeft: 28, paddingRight: 12, borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.80)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* ── Filter panel ─────────────────────────────────────────────────────── */}
        {filterOpen && (
          <div className="rp-filter-panel" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,5,10,0.95)', backdropFilter: 'blur(20px)' }}>
            <div className="rp-nav-inner" style={{ paddingTop: 14, paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Row 1: Sort */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.22)' }}>Sort by</span>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {SORT_OPTIONS.map(s => (
                    <button key={s.id} type="button" onClick={() => setSort(s.id)} className="rp-sort-btn"
                      style={{ borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: sort === s.id ? 700 : 500, border: `1px solid ${sort === s.id ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.07)'}`, background: sort === s.id ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.02)', color: sort === s.id ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.38)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{s.icon}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Type + Visibility */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.22)' }}>Type</span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {TYPE_OPTIONS.map(t => (
                      <button key={t.id} type="button" onClick={() => setTypeF(t.id)} className="rp-sort-btn"
                        style={{ borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: typeF === t.id ? 700 : 500, border: `1px solid ${typeF === t.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)'}`, background: typeF === t.id ? 'rgba(255,255,255,0.07)' : 'transparent', color: typeF === t.id ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.32)', cursor: 'pointer' }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {uid && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.22)' }}>Visibility</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['all', 'public', 'private'] as const).map(v => (
                        <button key={v} type="button" onClick={() => setVisF(v)} className="rp-sort-btn"
                          style={{ borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: visF === v ? 700 : 500, border: `1px solid ${visF === v ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)'}`, background: visF === v ? 'rgba(255,255,255,0.07)' : 'transparent', color: visF === v ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.32)', cursor: 'pointer', textTransform: 'capitalize' }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Row 3: Category scroll */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.22)' }}>Category</span>
                <div ref={catScrollRef} className="rp-sc" style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
                  {CATEGORIES.map(c => (
                    <button key={c} type="button" onClick={() => setCatF(c)} className="rp-chip-btn"
                      style={{ flexShrink: 0, borderRadius: 20, padding: '5px 13px', fontSize: 11.5, fontWeight: catF === c ? 700 : 500, border: `1px solid ${catF === c ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.06)'}`, background: catF === c ? 'rgba(255,255,255,0.08)' : 'transparent', color: catF === c ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.30)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 4: Active chips + clear */}
              {activeFilterCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', fontWeight: 500, flexShrink: 0 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                  <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
                  {typeF !== 'all'     && <FilterChip label={`Type: ${typeF}`}    onRemove={() => setTypeF('all')} />}
                  {catF  !== 'All'     && <FilterChip label={`Cat: ${catF}`}      onRemove={() => setCatF('All')} />}
                  {visF  !== 'all'     && <FilterChip label={`Vis: ${visF}`}      onRemove={() => setVisF('all')} />}
                  {search.trim()       && <FilterChip label={`"${search}"`}       onRemove={() => setSearch('')} />}
                  <button type="button" onClick={clearAll}
                    style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.35)', background: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', transition: 'all 130ms ease', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.60)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────────────────── */}
      <div className="rp-content" style={{ animation: 'rpIn 0.35s cubic-bezier(0.22,1,0.36,1) both' }}>

        {/* ── Loading skeleton ──────────────────────────────────────────────────── */}
        {loading && (
          <div className="rp-grid">
            {[...Array(18)].map((_, i) => (
              <div key={i} style={{ aspectRatio: '2/3', borderRadius: 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', animation: `rpPulse 1.8s ${i * 0.04}s ease-in-out infinite` }} />
            ))}
          </div>
        )}

        {/* ── Empty ─────────────────────────────────────────────────────────────── */}
        {!loading && filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="7" height="9" rx="2" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4"/><rect x="12" y="3" width="7" height="6" rx="2" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4"/><rect x="12" y="11" width="7" height="8" rx="2" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4"/><rect x="3" y="14" width="7" height="5" rx="2" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4"/></svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.42)', letterSpacing: '-0.01em' }}>
                {recents.length === 0 ? 'No recents yet' : 'No results match your filters'}
              </p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255,255,255,0.20)', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                {recents.length === 0
                  ? 'Be the first to post. Stories expire after 24 hours.'
                  : 'Try adjusting or clearing your filters.'}
              </p>
            </div>
            {recents.length > 0 && (
              <button type="button" onClick={clearAll}
                style={{ marginTop: 6, padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.50)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 140ms ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.70)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.50)'; }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* ── Grid ─────────────────────────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div className="rp-grid">
            {filtered.map((r, i) => {
              const likedRank = [...recents].sort((a, b) => b.likedBy.length - a.likedBy.length).findIndex(x => x.id === r.id);
              return (
                <div key={r.id} style={{ animation: `rpCard 0.28s ${Math.min(i, 18) * 0.025}s cubic-bezier(0.22,1,0.36,1) both` }}>
                  <Card r={r} seen={uid ? r.viewedBy.includes(uid) : false} rank={likedRank <= 2 && sort === 'liked' ? likedRank : undefined} onClick={() => openFiltered(i)} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Viewer ─────────────────────────────────────────────────────────────── */}
      {isMounted && viewIdx !== null && (
        <Viewer recents={recents} startIdx={viewIdx} uid={uid ?? undefined} onClose={() => setViewIdx(null)} onDelete={handleDelete} />
      )}
    </div>
  );
}
