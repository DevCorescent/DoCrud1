'use client';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recent {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  type: 'image' | 'video' | 'text';
  mediaUrl?: string | null;
  caption?: string | null;
  bgColor?: string;
  bgGradient?: string;
  textColor?: string;
  fontStyle?: string;
  fontSize?: number;
  ctaLabel?: string;
  ctaUrl?: string;
  expiryHours?: number;
  category: string;
  visibility: 'public' | 'private';
  viewCount: number;
  viewedBy: string[];
  likedBy: string[];
  createdAt: string;
  expiresAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORY_MS   = 6000;
const CATEGORIES = ['General','Work','Product','Design','Tech','Finance','Legal','Marketing','Career','Announcement','Update','Insight'];

const BG_PRESETS = [
  { id:'void',    label:'Void',     value:'linear-gradient(160deg,#000000 0%,#0d0d0f 100%)',             text:'#f0f0f0' },
  { id:'ash',     label:'Ash',      value:'linear-gradient(160deg,#0c0c0e 0%,#1c1c20 100%)',             text:'#e8e8ea' },
  { id:'ember',   label:'Ember',    value:'linear-gradient(160deg,#110306 0%,#2d0a14 55%,#160508 100%)', text:'#fde8ec' },
  { id:'ocean',   label:'Ocean',    value:'linear-gradient(160deg,#040a12 0%,#0a2040 55%,#040c20 100%)', text:'#d8eeff' },
  { id:'forest',  label:'Forest',   value:'linear-gradient(160deg,#020d05 0%,#092418 55%,#030f07 100%)', text:'#ceebd8' },
  { id:'dusk',    label:'Dusk',     value:'linear-gradient(160deg,#100808 0%,#201008 55%,#100c04 100%)', text:'#f5e8cc' },
  { id:'slate',   label:'Slate',    value:'linear-gradient(160deg,#07090e 0%,#141826 55%,#090c16 100%)', text:'#dce4f5' },
  { id:'noir',    label:'Noir',     value:'linear-gradient(160deg,#080808 0%,#141414 100%)',             text:'#ffffff' },
  { id:'violet',  label:'Violet',   value:'linear-gradient(160deg,#08040e 0%,#1a0a2e 55%,#0e0418 100%)', text:'#e8d8ff' },
  { id:'copper',  label:'Copper',   value:'linear-gradient(160deg,#0c0800 0%,#1e1200 55%,#100c00 100%)', text:'#f5dfa0' },
  { id:'rose',    label:'Rose',     value:'linear-gradient(160deg,#0e040a 0%,#24081a 55%,#120408 100%)', text:'#ffd8e8' },
  { id:'arctic',  label:'Arctic',   value:'linear-gradient(160deg,#040c10 0%,#08202c 55%,#040e16 100%)', text:'#c8f0ff' },
];

const FONT_STYLES = [
  { id:'sans',    label:'Clean',    style:{ fontFamily:'system-ui,sans-serif', fontWeight:600 } },
  { id:'display', label:'Bold',     style:{ fontFamily:'system-ui,sans-serif', fontWeight:800, letterSpacing:'-0.03em' } },
  { id:'serif',   label:'Classic',  style:{ fontFamily:"Georgia,'Times New Roman',serif", fontWeight:400 } },
  { id:'mono',    label:'Code',     style:{ fontFamily:"'Courier New',Courier,monospace", fontWeight:600 } },
  { id:'light',   label:'Light',    style:{ fontFamily:'system-ui,sans-serif', fontWeight:300, letterSpacing:'0.04em' } },
  { id:'wide',    label:'Wide',     style:{ fontFamily:'system-ui,sans-serif', fontWeight:700, letterSpacing:'0.10em' } },
];

const PRESETS = [
  {
    id:'announcement', label:'Announcement',
    bg:'linear-gradient(160deg,#06080e 0%,#0e1828 55%,#080e1a 100%)',
    text:'#ffffff', font:'display', size:26, align:'center' as const, position:'center' as const,
    sample:'Big news is here',
  },
  {
    id:'quote', label:'Quote',
    bg:'linear-gradient(160deg,#080808 0%,#161616 100%)',
    text:'rgba(255,255,255,0.88)', font:'serif', size:22, align:'center' as const, position:'center' as const,
    sample:'"The best time to start was yesterday."',
  },
  {
    id:'launch', label:'Launch',
    bg:'linear-gradient(160deg,#0c0600 0%,#1e0e00 50%,#0e0800 100%)',
    text:'#f5e0b0', font:'display', size:28, align:'center' as const, position:'center' as const,
    sample:'We shipped it 🚀',
  },
  {
    id:'achievement', label:'Win',
    bg:'linear-gradient(160deg,#080a04 0%,#141e06 55%,#090c04 100%)',
    text:'#d8f0b8', font:'display', size:24, align:'center' as const, position:'center' as const,
    sample:'Milestone reached ✦',
  },
  {
    id:'insight', label:'Insight',
    bg:'linear-gradient(160deg,#04080c 0%,#081420 55%,#040c14 100%)',
    text:'#b8dcf0', font:'mono', size:18, align:'left' as const, position:'center' as const,
    sample:"Here's what I learned...",
  },
  {
    id:'minimal', label:'Minimal',
    bg:'linear-gradient(160deg,#080808 0%,#101010 100%)',
    text:'rgba(255,255,255,0.55)', font:'light', size:20, align:'center' as const, position:'center' as const,
    sample:'Less is more.',
  },
  {
    id:'bold', label:'Impact',
    bg:'#000000',
    text:'#ffffff', font:'wide', size:30, align:'center' as const, position:'center' as const,
    sample:'READ THIS',
  },
  {
    id:'warm', label:'Warm',
    bg:'linear-gradient(160deg,#100800 0%,#201400 55%,#120c00 100%)',
    text:'#f5d898', font:'sans', size:22, align:'center' as const, position:'bottom' as const,
    sample:'Good things take time.',
  },
  {
    id:'update', label:'Update',
    bg:'linear-gradient(160deg,#060a0e 0%,#0c1620 55%,#080c14 100%)',
    text:'rgba(200,220,255,0.90)', font:'sans', size:18, align:'left' as const, position:'top' as const,
    sample:'Quick update from the team...',
  },
  {
    id:'breaking', label:'Breaking',
    bg:'linear-gradient(160deg,#0e0404 0%,#200808 55%,#120404 100%)',
    text:'#ffd0cc', font:'display', size:24, align:'center' as const, position:'center' as const,
    sample:'BREAKING',
  },
];

type TextAlign    = 'left' | 'center' | 'right';
type TextPosition = 'top' | 'center' | 'bottom';
type ImageFilter  = 'none' | 'mono' | 'warm' | 'cool' | 'fade' | 'vivid';

const IMAGE_FILTERS: { id: ImageFilter; label: string; css: string }[] = [
  { id:'none',  label:'Original', css:'' },
  { id:'mono',  label:'Mono',     css:'grayscale(100%) contrast(1.05)' },
  { id:'warm',  label:'Warm',     css:'sepia(40%) saturate(1.3) brightness(1.05)' },
  { id:'cool',  label:'Cool',     css:'hue-rotate(195deg) saturate(1.2)' },
  { id:'fade',  label:'Fade',     css:'brightness(1.1) contrast(0.82) saturate(0.72)' },
  { id:'vivid', label:'Vivid',    css:'saturate(1.6) contrast(1.08)' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h` : `${m}m`;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function getFontStyle(fontStyle?: string) {
  return FONT_STYLES.find((f) => f.id === fontStyle)?.style ?? FONT_STYLES[0].style;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Av({ src, name, size = 28 }: { src?: string | null; name?: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? ''} onError={() => setErr(true)}
      style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', display:'block', flexShrink:0 }} />
  );
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', flexShrink:0, background:'rgba(255,255,255,0.10)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.38, fontWeight:700, color:'rgba(255,255,255,0.65)' }}>
      {(name ?? '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Bracket Corners ──────────────────────────────────────────────────────────

function Brackets({ color = 'rgba(255,255,255,0.22)', size = 10, thick = 1.5 }: { color?: string; size?: number; thick?: number }) {
  const b: React.CSSProperties = { position:'absolute' };
  const l = (overrides: React.CSSProperties): React.CSSProperties => ({ position:'absolute', background:color, borderRadius:thick });
  return (
    <>
      <div style={{ ...b, top:6, left:6, width:size, height:size }}>
        <div style={{ ...l({}), top:0, left:0, width:thick, height:size }} />
        <div style={{ ...l({}), top:0, left:0, width:size,  height:thick }} />
      </div>
      <div style={{ ...b, top:6, right:6, width:size, height:size }}>
        <div style={{ ...l({}), top:0, right:0, width:thick, height:size }} />
        <div style={{ ...l({}), top:0, right:0, width:size,  height:thick }} />
      </div>
      <div style={{ ...b, bottom:6, left:6, width:size, height:size }}>
        <div style={{ ...l({}), bottom:0, left:0, width:thick, height:size }} />
        <div style={{ ...l({}), bottom:0, left:0, width:size,  height:thick }} />
      </div>
      <div style={{ ...b, bottom:6, right:6, width:size, height:size }}>
        <div style={{ ...l({}), bottom:0, right:0, width:thick, height:size }} />
        <div style={{ ...l({}), bottom:0, right:0, width:size,  height:thick }} />
      </div>
    </>
  );
}

// ─── Story thumb ──────────────────────────────────────────────────────────────

/* ── Category badge colour + short label map ──────────────────────────────── */
const CAT_BADGE: Record<string, { bg: string; border: string; text: string; short: string }> = {
  General:      { bg:'rgba(148,163,184,0.28)', border:'rgba(148,163,184,0.45)', text:'rgba(226,232,240,0.95)', short:'General'  },
  Work:         { bg:'rgba(99,102,241,0.28)',  border:'rgba(99,102,241,0.50)',  text:'rgba(199,210,254,0.97)', short:'Work'     },
  Product:      { bg:'rgba(52,211,153,0.26)',  border:'rgba(52,211,153,0.45)',  text:'rgba(167,243,208,0.97)', short:'Product'  },
  Design:       { bg:'rgba(236,72,153,0.26)',  border:'rgba(236,72,153,0.44)',  text:'rgba(251,207,232,0.97)', short:'Design'   },
  Tech:         { bg:'rgba(34,211,238,0.26)',  border:'rgba(34,211,238,0.44)',  text:'rgba(165,243,252,0.97)', short:'Tech'     },
  Finance:      { bg:'rgba(251,191,36,0.26)',  border:'rgba(251,191,36,0.44)',  text:'rgba(254,240,138,0.97)', short:'Finance'  },
  Legal:        { bg:'rgba(239,68,68,0.26)',   border:'rgba(239,68,68,0.44)',   text:'rgba(254,202,202,0.97)', short:'Legal'    },
  Marketing:    { bg:'rgba(251,146,60,0.26)',  border:'rgba(251,146,60,0.44)',  text:'rgba(254,215,170,0.97)', short:'Mktg'     },
  Career:       { bg:'rgba(167,139,250,0.28)', border:'rgba(167,139,250,0.48)', text:'rgba(221,214,254,0.97)', short:'Career'   },
  Announcement: { bg:'rgba(250,204,21,0.26)',  border:'rgba(250,204,21,0.44)',  text:'rgba(254,240,138,0.97)', short:'Announce' },
  Update:       { bg:'rgba(74,222,128,0.26)',  border:'rgba(74,222,128,0.44)',  text:'rgba(187,247,208,0.97)', short:'Update'   },
  Insight:      { bg:'rgba(192,132,252,0.26)', border:'rgba(192,132,252,0.44)', text:'rgba(233,213,255,0.97)', short:'Insight'  },
};
const DEFAULT_BADGE = { bg:'rgba(255,255,255,0.20)', border:'rgba(255,255,255,0.32)', text:'rgba(255,255,255,0.92)', short:'—' };

function Thumb({ r, seen, onClick }: { r: Recent; seen: boolean; onClick(): void }) {
  const badge = CAT_BADGE[r.category] ?? DEFAULT_BADGE;
  return (
    <button type="button" onClick={onClick} className="rc-card"
      style={{ flexShrink:0, overflow:'hidden', position:'relative', cursor:'pointer', border:`1.5px solid ${seen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.50)'}`, background:'#08080b', outline:'none', transition:'transform 160ms cubic-bezier(0.34,1.56,0.64,1), border-color 150ms ease', display:'block' }}
      onMouseEnter={(e)=>(e.currentTarget as HTMLElement).style.transform='scale(1.04)'}
      onMouseLeave={(e)=>(e.currentTarget as HTMLElement).style.transform='none'}
    >
      {/* Media */}
      {r.type === 'video' && r.mediaUrl
        ? <video src={r.mediaUrl} muted playsInline style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover' }} />
        : r.type === 'image' && r.mediaUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={r.mediaUrl} alt="" style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover' }} />
        : <div style={{ position:'absolute',inset:0, background: r.bgGradient ?? BG_PRESETS[0].value }} />
      }
      {/* Subtle glass blur — lets colour show through while giving frosted depth */}
      <div style={{
        position:'absolute', inset:0,
        backdropFilter:'blur(3px) saturate(1.4)',
        WebkitBackdropFilter:'blur(3px) saturate(1.4)',
        background:'rgba(0,0,0,0.08)',
        zIndex:1,
      }} />
      {/* Bottom scrim */}
      <div style={{ position:'absolute',inset:0,zIndex:2, background:'linear-gradient(to top,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.04) 48%,transparent 100%)' }} />
      {/* Top scrim for badge readability */}
      <div style={{ position:'absolute',top:0,left:0,right:0,height:'45%',zIndex:2, background:'linear-gradient(to bottom,rgba(0,0,0,0.38) 0%,transparent 100%)', pointerEvents:'none' }} />
      {/* Seen overlay */}
      {seen && <div style={{ position:'absolute',inset:0,zIndex:3, background:'rgba(0,0,0,0.32)' }} />}

      {/* ── Category badge (top-centre) ── */}
      <div style={{
        position:'absolute', top:8, left:0, right:0,
        display:'flex', justifyContent:'center',
        zIndex:12, pointerEvents:'none',
      }}>
        <span style={{
          display:'inline-block',
          padding:'3.5px 8px',
          borderRadius:99,
          background: badge.bg,
          border:`1px solid ${badge.border}`,
          backdropFilter:'blur(16px)',
          WebkitBackdropFilter:'blur(16px)',
          fontSize:8.5, fontWeight:800,
          letterSpacing:'0.10em',
          textTransform:'uppercase' as const,
          color: badge.text,
          whiteSpace:'nowrap',
          lineHeight:1.4,
          boxShadow:`0 2px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)`,
          maxWidth:'calc(100% - 12px)',
          overflow:'hidden',
          textOverflow:'ellipsis',
        }}>{badge.short}</span>
      </div>

      {/* Lock badge (top-right) */}
      {r.visibility === 'private' && (
        <div style={{ position:'absolute',top:6,right:6, width:16,height:16, borderRadius:5, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', display:'flex',alignItems:'center',justifyContent:'center', zIndex:2 }}>
          <svg width="7" height="9" viewBox="0 0 7 9" fill="none"><rect x="1" y="4" width="5" height="4.5" rx="1" fill="rgba(255,255,255,0.65)"/><path d="M1.5 4V2.5a2 2 0 0 1 4 0V4" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" fill="none"/></svg>
        </div>
      )}

      {/* Video play */}
      {r.type === 'video' && (
        <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)', width:24,height:24, borderRadius:'50%', background:'rgba(255,255,255,0.14)', backdropFilter:'blur(4px)', display:'flex',alignItems:'center',justifyContent:'center' }}>
          <svg width="8" height="10" viewBox="0 0 8 10" fill="white"><path d="M1 1l6 4-6 4V1z"/></svg>
        </div>
      )}

      {/* Bottom avatar */}
      <div style={{ position:'absolute',bottom:6,left:0,right:0,display:'flex',justifyContent:'center' }}>
        <span className="rc-av" style={{ display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',borderRadius:'50%' }}>
          <Av src={r.userAvatar} name={r.userName} size={20} />
        </span>
      </div>
    </button>
  );
}

// ─── Full-screen viewer ───────────────────────────────────────────────────────

function Viewer({ recents, startIdx, uid, onClose, onDelete }: {
  recents: Recent[]; startIdx: number; uid?: string;
  onClose(): void; onDelete(id: string): void;
}) {
  const [idx,    setIdx]    = useState(startIdx);
  const [prog,   setProg]   = useState(0);
  const [paused, setPaused] = useState(false);
  const [ui,     setUi]     = useState(true);   // header/footer visibility
  const [liked,  setLiked]  = useState(false);
  const [likeFlash, setLikeFlash] = useState(false);
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
    fetch(`/api/recents/${cur.id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ action:'view' }) }).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, uid]); // depend on the story ID only — not the object ref, which changes on every recents state update

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
      if (e.key === 'ArrowRight' || e.key === 'l') next();
      if (e.key === 'ArrowLeft'  || e.key === 'j') prev();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Swipe
  const touchX = useRef(0);
  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0].clientX; setPaused(true); }
  function onTouchEnd(e: React.TouchEvent) {
    setPaused(false);
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
  }

  async function handleLike() {
    if (!uid || !cur) return;
    setLiked(l => !l); setLikeFlash(true); setTimeout(() => setLikeFlash(false), 700);
    await fetch(`/api/recents/${cur.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'like' }) });
  }

  async function handleDelete() {
    if (!cur || !isOwn) return;
    if (!confirm('Delete this recent?')) return;
    await fetch(`/api/recents/${cur.id}`, { method:'DELETE' });
    onDelete(cur.id);
    if (recents.length <= 1) onClose();
    else if (idx >= recents.length - 1) setIdx(recents.length - 2);
  }

  if (!cur) return null;
  const font = getFontStyle(cur.fontStyle);

  return createPortal(
    <div
      style={{ position:'fixed', inset:0, zIndex:99999, background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}
      onMouseMove={showUi} onClick={showUi}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
    >
      <style>{`
        @keyframes rcVIn { from{opacity:0} to{opacity:1} }
        @keyframes rcHeart { 0%{transform:scale(1)} 35%{transform:scale(1.6)} 70%{transform:scale(0.9)} 100%{transform:scale(1)} }
        @keyframes rcDoubleTap { 0%{opacity:0;transform:scale(0.5)} 20%{opacity:1;transform:scale(1.2)} 60%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0.8)} }
      `}</style>

      {/* Media fill */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'rcVIn 0.25s ease both' }}>
        {cur.type === 'video' && cur.mediaUrl
          ? <video src={cur.mediaUrl} autoPlay loop playsInline style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          : cur.type === 'image' && cur.mediaUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cur.mediaUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          : <div style={{ position:'absolute', inset:0, background: cur.bgGradient ?? BG_PRESETS[0].value }} />
        }
        {/* Vignette for media */}
        {cur.type !== 'text' && cur.mediaUrl && (
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
        )}
      </div>

      {/* Caption */}
      {cur.caption && (
        <div style={{ position:'absolute', bottom: cur.ctaUrl ? 120 : 80, left:24, right:24, zIndex:5, textAlign:'center', pointerEvents:'none' }}>
          <p style={{ margin:0, fontSize: cur.fontSize ?? 22, lineHeight:1.35, color: cur.textColor ?? '#fff', textShadow: cur.type !== 'text' ? '0 2px 20px rgba(0,0,0,0.70)' : 'none', wordBreak:'break-word', ...font }}>
            {cur.caption}
          </p>
        </div>
      )}

      {/* CTA button — above all tap zones */}
      {cur.ctaUrl && cur.ctaLabel && (() => {
        // Normalise URL: prepend https:// if no protocol present
        const raw = cur.ctaUrl.trim();
        const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        return (
          <div style={{ position:'absolute', bottom:72, left:0, right:0, zIndex:20, display:'flex', justifyContent:'center', transition:'opacity 300ms ease', opacity: ui ? 1 : 0, pointerEvents: ui ? 'auto' : 'none' }}>
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); window.open(href, '_blank', 'noopener,noreferrer'); }}
              style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'11px 24px', borderRadius:99, background:'rgba(255,255,255,0.94)', color:'#000', fontSize:13.5, fontWeight:700, border:'none', cursor:'pointer', backdropFilter:'blur(10px)', boxShadow:'0 6px 28px rgba(0,0,0,0.45)', letterSpacing:'-0.01em' }}>
              {cur.ctaLabel}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H4M10 2v6" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        );
      })()}

      {/* Bracket corners on viewer */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:4 }}>
        <Brackets color="rgba(255,255,255,0.12)" size={16} thick={1.5} />
      </div>

      {/* TOP UI */}
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10, transition:'opacity 350ms ease', opacity: ui ? 1 : 0 }}>
        {/* Progress bars */}
        <div style={{ display:'flex', gap:3, padding:'12px 14px 0' }}>
          {recents.map((_,i) => (
            <div key={i} style={{ flex:1, height:2, borderRadius:99, background:'rgba(255,255,255,0.20)', overflow:'hidden' }}>
              <div style={{ height:'100%', background:'#fff', borderRadius:99, width: i < idx ? '100%' : i === idx ? `${prog}%` : '0%', transition: i === idx ? 'none' : undefined }} />
            </div>
          ))}
        </div>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px 0' }}>
          {/* Avatar + name — tappable, goes to poster's profile */}
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); window.location.href = `/u/${cur.userId}`; }}
            style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0, background:'none', border:'none', cursor:'pointer', textAlign:'left', padding:0 }}
          >
            <div style={{ flexShrink:0, borderRadius:'50%', overflow:'hidden', width:34, height:34 }}>
              <Av src={cur.userAvatar} name={cur.userName} size={34} />
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:'#fff', letterSpacing:'-0.01em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cur.userName}</p>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:1 }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:500 }}>{timeAgo(cur.createdAt)}</span>
                <span style={{ width:2, height:2, borderRadius:'50%', background:'rgba(255,255,255,0.25)', flexShrink:0 }} />
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.40)', fontWeight:500, textTransform:'capitalize' }}>{cur.category}</span>
                <span style={{ width:2, height:2, borderRadius:'50%', background:'rgba(255,255,255,0.25)', flexShrink:0 }} />
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.35)', fontWeight:500 }}>{timeLeft(cur.expiresAt)} left</span>
                {cur.visibility === 'private' && (
                  <svg width="9" height="11" viewBox="0 0 9 11" fill="none" style={{ flexShrink:0 }}><rect x="1.5" y="5" width="6" height="5.5" rx="1.2" fill="rgba(255,255,255,0.45)"/><path d="M2 5V3a2.5 2.5 0 0 1 5 0v2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" fill="none"/></svg>
                )}
              </div>
            </div>
          </button>
          {isOwn && (
            <button type="button" onClick={handleDelete} style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
              <svg width="13" height="15" viewBox="0 0 13 15" fill="none"><path d="M1 3.5h11M4.5 3.5V2h4v1.5M2.5 3.5l.8 9h6.4l.8-9" stroke="rgba(255,68,68,0.75)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          <button type="button" onClick={onClose} style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1 1 11" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* Tap zones (invisible) */}
      <div style={{ position:'absolute', inset:0, zIndex:6, display:'flex' }}>
        <div style={{ flex:1 }} onPointerDown={() => setPaused(true)} onPointerUp={() => { setPaused(false); prev(); }} />
        <div style={{ flex:1 }} onPointerDown={() => setPaused(true)} onPointerUp={() => { setPaused(false); next(); }} />
      </div>

      {/* BOTTOM UI */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:10, transition:'opacity 350ms ease', opacity: ui ? 1 : 0, padding:'0 16px 28px', background:'linear-gradient(to top,rgba(0,0,0,0.45) 0%,transparent 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="9" viewBox="0 0 12 9" fill="none"><path d="M1 4.5C2.5 2 4.5 1 6 1s3.5 1 5 3.5C9.5 7 7.5 8 6 8S2.5 7 1 4.5z" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" fill="none"/><circle cx="6" cy="4.5" r="1.5" fill="rgba(255,255,255,0.45)"/></svg>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.40)', fontVariantNumeric:'tabular-nums' }}>{cur.viewCount}</span>
          </div>
          <div style={{ flex:1 }} />
          {uid && (
            <button type="button" onClick={handleLike} style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', padding:6 }}>
              <svg width="18" height="17" viewBox="0 0 18 17" fill="none" style={{ animation: likeFlash ? 'rcHeart 0.6s ease both' : 'none' }}>
                <path d="M9 15.5S1.5 11 1.5 5.5a4 4 0 0 1 7.5-2A4 4 0 0 1 16.5 5.5C16.5 11 9 15.5 9 15.5z"
                  fill={liked ? '#ff3b5c' : 'none'} stroke={liked ? '#ff3b5c' : 'rgba(255,255,255,0.55)'} strokeWidth="1.4"/>
              </svg>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontVariantNumeric:'tabular-nums' }}>{cur.likedBy.length}</span>
            </button>
          )}
          {/* Index dots */}
          <div style={{ display:'flex', gap:4 }}>
            {recents.map((_,i) => (
              <div key={i} style={{ width: i===idx?16:5, height:5, borderRadius:99, background: i===idx?'rgba(255,255,255,0.80)':'rgba(255,255,255,0.22)', transition:'all 250ms ease' }} />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Creator ──────────────────────────────────────────────────────────────────

function Creator({ onClose, onCreated }: { onClose(): void; onCreated(r: Recent): void }) {
  type Step      = 'design' | 'publish';
  type MediaMode = 'text' | 'image' | 'video';

  const [step,        setStep]       = useState<Step>('design');
  const [mediaMode,   setMediaMode]  = useState<MediaMode>('text');
  const [mediaUrl,    setMediaUrl]   = useState<string|null>(null);
  const [localBlob,   setLocalBlob]  = useState<string|null>(null);
  const [caption,     setCaption]    = useState('');
  const [subtitle,    setSubtitle]   = useState('');
  const [bg,          setBg]         = useState(BG_PRESETS[0]);
  const [fontId,      setFontId]     = useState('sans');
  const [fontSize,    setFontSize]   = useState(24);
  const [textColor,   setTextColor]  = useState('#ffffff');
  const [textAlign,   setTextAlign]  = useState<TextAlign>('center');
  const [textPos,     setTextPos]    = useState<TextPosition>('center');
  const [imgFilter,   setImgFilter]  = useState<ImageFilter>('none');
  const [vignette,    setVignette]   = useState(false);
  const [grain,       setGrain]      = useState(false);
  const [innerBorder, setInnerBorder]= useState(false);
  const [category,    setCategory]   = useState('General');
  const [visibility,  setVisibility] = useState<'public'|'private'>('public');
  const [ctaLabel,    setCtaLabel]   = useState('');
  const [ctaUrl,      setCtaUrl]     = useState('');
  const [expiry,      setExpiry]     = useState(24);
  const [uploading,   setUploading]  = useState(false);
  const [uploadErr,   setUploadErr]  = useState('');
  const [submitting,  setSubmitting] = useState(false);
  const [dragOver,    setDragOver]   = useState(false);
  const [panel,       setPanel]      = useState<'presets'|'style'|'text'|'effects'>('presets');
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setUploadErr('');
    const isVid = file.type.startsWith('video/');
    setMediaMode(isVid ? 'video' : 'image');
    const blob = URL.createObjectURL(file);
    setLocalBlob(blob); setMediaUrl(null); setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/recents/upload', { method:'POST', body:fd });
      if (!res.ok) throw new Error('Upload failed');
      const d = await res.json() as { url?: string; type?: string; error?: string };
      if (d.url) { setMediaUrl(d.url); setLocalBlob(null); URL.revokeObjectURL(blob); }
      else throw new Error(d.error ?? 'Upload failed');
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed');
      setLocalBlob(null); setMediaUrl(null); URL.revokeObjectURL(blob);
    } finally { setUploading(false); }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '';
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) uploadFile(f);
  }
  function applyPreset(p: typeof PRESETS[0]) {
    setBg({ id:p.id, label:p.label, value:p.bg, text:p.text });
    setTextColor(p.text); setFontId(p.font); setFontSize(p.size);
    setTextAlign(p.align); setTextPos(p.position);
    if (!caption) setCaption(p.sample);
    setMediaMode('text'); setPanel('text');
  }
  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/recents', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          type: mediaMode, mediaUrl: mediaUrl ?? null,
          caption: caption||null,
          bgGradient: mediaMode==='text' ? bg.value : undefined,
          textColor, fontStyle:fontId, fontSize,
          ctaLabel: ctaLabel||undefined, ctaUrl: ctaUrl||undefined,
          category, visibility, expiryHours: expiry,
        }),
      });
      const d = await res.json() as { recent?: Recent };
      if (d.recent) onCreated(d.recent);
    } finally { setSubmitting(false); }
  }

  const canPublish  = mediaMode==='text' ? caption.trim().length>0 : !!(mediaUrl||localBlob);
  const previewSrc  = localBlob ?? mediaUrl;
  const font        = FONT_STYLES.find(f=>f.id===fontId) ?? FONT_STYLES[0];
  const filterCss   = IMAGE_FILTERS.find(f=>f.id===imgFilter)?.css ?? '';
  const textPosStyle: React.CSSProperties =
    textPos==='top'    ? {top:'14%',bottom:'auto'} :
    textPos==='bottom' ? {bottom:'14%',top:'auto'} :
                         {top:'50%',transform:'translateY(-50%)'};

  const inB = (a:boolean) => `1px solid ${a ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.08)'}`;
  const inBg = (a:boolean) => a ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)';
  const inp: React.CSSProperties = {
    width:'100%', padding:'10px 13px', borderRadius:11,
    border:'1px solid rgba(255,255,255,0.09)', background:'rgba(255,255,255,0.04)',
    color:'rgba(255,255,255,0.85)', fontSize:13.5, fontFamily:'inherit',
    boxSizing:'border-box', outline:'none',
  };

  const LivePreview = () => (
    <div style={{position:'relative',width:'100%',aspectRatio:'9/16',borderRadius:16,overflow:'hidden',
      background:mediaMode==='text'?bg.value:'#060608',
      border:'1px solid rgba(255,255,255,0.12)',
      boxShadow:'0 16px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 0 rgba(255,255,255,0.10) inset'}}>
      {mediaMode==='image'&&previewSrc&&
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewSrc} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:filterCss||undefined}}/>}
      {mediaMode==='video'&&previewSrc&&
        <video src={previewSrc} autoPlay muted loop playsInline style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',filter:filterCss||undefined}}/>}
      {(vignette||(mediaMode!=='text'&&previewSrc))&&
        <div style={{position:'absolute',inset:0,background:vignette?'radial-gradient(ellipse at center,transparent 35%,rgba(0,0,0,0.75) 100%)':'linear-gradient(to top,rgba(0,0,0,0.70) 0%,transparent 55%)'}}/>}
      {grain&&<div style={{position:'absolute',inset:0,opacity:0.16,
        backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize:'180px',mixBlendMode:'overlay'}}/>}
      {(caption||subtitle)&&(
        <div style={{position:'absolute',left:12,right:12,textAlign:textAlign,zIndex:2,...textPosStyle}}>
          {caption&&<p style={{margin:0,fontSize:Math.round(fontSize*0.44),color:textColor,lineHeight:1.3,wordBreak:'break-word',
            textShadow:mediaMode!=='text'&&previewSrc?'0 1px 10px rgba(0,0,0,0.60)':'none',...font.style}}>{caption}</p>}
          {subtitle&&<p style={{margin:'3px 0 0',fontSize:Math.round(fontSize*0.28),color:textColor,opacity:0.60,lineHeight:1.4,wordBreak:'break-word',fontFamily:'system-ui',fontWeight:400}}>{subtitle}</p>}
        </div>
      )}
      {innerBorder&&<div style={{position:'absolute',inset:8,borderRadius:12,border:'1px solid rgba(255,255,255,0.18)',pointerEvents:'none',zIndex:3}}/>}
      {uploading&&(
        <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,zIndex:10,backdropFilter:'blur(8px)'}}>
          <div style={{width:28,height:28,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,0.15)',borderTopColor:'rgba(255,255,255,0.80)',animation:'rcSpin 0.75s linear infinite'}}/>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.60)',fontWeight:600,letterSpacing:'0.04em'}}>Uploading…</span>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div style={{position:'fixed',inset:0,zIndex:99998,
        background:'rgba(4,3,12,0.72)',
        backdropFilter:'blur(28px) saturate(160%)',
        WebkitBackdropFilter:'blur(28px) saturate(160%)',
        display:'flex',alignItems:'flex-end',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <style>{`
        @keyframes rcSheet{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rcFadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
        @keyframes rcSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes rcGlow{0%,100%{opacity:0.45}50%{opacity:1}}
        @keyframes rcPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
        .rc-ta::placeholder,.rc-inp::placeholder{color:rgba(255,255,255,0.18)}
        .rc-ta:focus,.rc-inp:focus{outline:none!important;border-color:rgba(139,92,246,0.45)!important;background:rgba(139,92,246,0.06)!important;box-shadow:0 0 0 3px rgba(139,92,246,0.08)!important}
        .rc-scrl::-webkit-scrollbar{display:none}
        .rc-scrl{scrollbar-width:none}
        input[type=range]{accent-color:#a78bfa;cursor:pointer;width:100%}
        .rc-preset-card{transition:transform 180ms cubic-bezier(0.34,1.56,0.64,1),box-shadow 180ms ease,border-color 180ms ease,opacity 180ms ease}
        .rc-preset-card:active{transform:scale(0.96)!important;opacity:0.85}
        @media(hover:hover){.rc-preset-card:hover{transform:translateY(-3px) scale(1.03)!important;box-shadow:0 16px 40px rgba(0,0,0,0.65)!important}}
        .rc-mode-btn{transition:all 150ms ease;-webkit-tap-highlight-color:transparent}
        .rc-tab-btn{transition:color 140ms ease,border-color 140ms ease;-webkit-tap-highlight-color:transparent}
        .rc-opt-btn{transition:all 150ms ease;-webkit-tap-highlight-color:transparent}
        .rc-opt-btn:active{transform:scale(0.97)!important}
        .rc-cat-chip{-webkit-tap-highlight-color:transparent;transition:all 150ms ease}
        .rc-toggle{-webkit-tap-highlight-color:transparent}
        /* ── Desktop: centred card ── */
        @media(min-width:640px){
          .rc-root{align-items:center!important;padding:16px!important}
          .rc-modal{border-radius:26px!important;max-height:91svh!important;max-width:700px!important;width:100%!important;align-self:center!important}
          .rc-body{flex-direction:row!important}
          .rc-preview-col{width:204px!important;flex-shrink:0!important;padding:18px 14px!important;
            border-right:1px solid rgba(255,255,255,0.07)!important;border-bottom:none!important}
          .rc-preview-wrap{aspect-ratio:9/16!important;width:100%!important;height:auto!important}
          .rc-controls{flex:1!important;min-width:0!important;overflow:hidden!important;display:flex!important;flex-direction:column!important}
          .rc-tpl-grid{grid-template-columns:repeat(3,1fr)!important}
        }
        /* ── Mobile: bottom sheet, preview always visible ── */
        @media(max-width:639px){
          .rc-root{align-items:flex-end!important;padding:0!important}
          .rc-modal{width:100%!important;border-radius:28px 28px 0 0!important;max-height:93svh!important}
          .rc-body{flex-direction:row!important;overflow:hidden!important;flex:1!important;min-height:0!important}
          .rc-preview-col{width:126px!important;flex-shrink:0!important;padding:12px 10px 12px 12px!important;
            border-right:1px solid rgba(255,255,255,0.06)!important;border-bottom:none!important;gap:8px!important}
          .rc-preview-wrap{aspect-ratio:9/16!important;width:100%!important;height:auto!important}
          .rc-controls{flex:1!important;min-width:0!important;min-height:0!important;overflow:hidden!important;display:flex!important;flex-direction:column!important}
          .rc-panel-content{padding:12px 12px 16px!important}
          .rc-tpl-grid{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
          .rc-pub-step{padding:16px 14px!important}
          .rc-footer{padding:10px 12px!important;padding-bottom:max(10px,env(safe-area-inset-bottom))!important}
        }
      `}</style>

      <div className="rc-root" onClick={e=>e.stopPropagation()} style={{
        width:'100%',display:'flex',flexDirection:'column',alignItems:'flex-end',justifyContent:'flex-end',
      }}>
      <div className="rc-modal" onClick={e=>e.stopPropagation()} style={{
        width:'100%',
        display:'flex', flexDirection:'column',
        background:'#0D0D0F',
        border:'1px solid rgba(255,255,255,0.09)',
        boxShadow:'0 -24px 60px rgba(0,0,0,0.5), 0 40px 100px rgba(0,0,0,0.90)',
        animation:'rcSheet 0.32s cubic-bezier(0.22,1,0.36,1) both',
        overflow:'hidden',
      }}>

        {/* ══ MOBILE DRAG HANDLE ══ */}
        <div style={{display:'flex',justifyContent:'center',paddingTop:10,flexShrink:0}}>
          <div style={{width:38,height:4,borderRadius:99,background:'rgba(255,255,255,0.16)'}}/>
        </div>
        <style>{`@media(min-width:640px){.rc-modal>.rc-handle-wrap{display:none!important}}`}</style>

        {/* ══ HEADER ══ */}
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px 12px',
          borderBottom:'1px solid rgba(255,255,255,0.07)',flexShrink:0}}>
          {step==='publish'&&(
            <button type="button" onClick={()=>setStep('design')}
              style={{width:32,height:32,borderRadius:10,border:'1px solid rgba(255,255,255,0.08)',
                background:'rgba(255,255,255,0.04)',display:'flex',alignItems:'center',justifyContent:'center',
                cursor:'pointer',color:'rgba(255,255,255,0.48)',flexShrink:0,transition:'all 140ms ease'}}>
              <svg width="12" height="11" viewBox="0 0 14 12" fill="none"><path d="M9 2L4 6l5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <p style={{margin:0,fontSize:14.5,fontWeight:700,color:'rgba(255,255,255,0.90)',letterSpacing:'-0.02em'}}>
                {step==='design' ? 'New Recent' : 'Publish Settings'}
              </p>
              {/* Live dot */}
              <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:99,
                background:'rgba(16,185,129,0.12)',border:'1px solid rgba(16,185,129,0.20)'}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:'#10b981',animation:'rcGlow 2s ease infinite'}}/>
                <span style={{fontSize:9,fontWeight:700,color:'#6ee7b7',letterSpacing:'0.06em'}}>LIVE</span>
              </span>
            </div>
            <p style={{margin:'1px 0 0',fontSize:10.5,color:'rgba(255,255,255,0.28)',fontWeight:400}}>
              {step==='design' ? 'Design your card — template, media or text' : 'Set audience, expiry & call-to-action'}
            </p>
          </div>
          {/* Step progress pills */}
          <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
            {['design','publish'].map((s,i)=>(
              <div key={s} style={{
                height:3, borderRadius:99,
                width: step===s ? 20 : 6,
                background: step===s ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.14)',
                transition:'all 280ms cubic-bezier(0.22,1,0.36,1)',
              }}/>
            ))}
          </div>
          <button type="button" onClick={onClose}
            style={{width:32,height:32,borderRadius:10,border:'1px solid rgba(255,255,255,0.08)',
              background:'rgba(255,255,255,0.03)',display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',color:'rgba(255,255,255,0.38)',flexShrink:0,transition:'all 140ms ease'}}>
            <svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M1 1l9 9M10 1 1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* ══ DESIGN STEP ══ */}
        {step==='design'&&(
          <div className="rc-body" style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>

            {/* ── LEFT: preview column ── */}
            <div className="rc-preview-col" style={{
              flexShrink:0, display:'flex', flexDirection:'column', gap:12,
            }}>
              <div className="rc-preview-wrap">
                <LivePreview/>
              </div>

              {/* Media type toggle */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                {([
                  {m:'text'  as MediaMode, label:'Text',  color:'#a78bfa',
                   icon:<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M2 7h6M2 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>},
                  {m:'image' as MediaMode, label:'Photo', color:'#60a5fa',
                   icon:<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="5" cy="5" r="1.2" fill="currentColor"/><path d="M1.5 9.5l3-3 2.5 2.5 1.5-1.5L12 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>},
                  {m:'video' as MediaMode, label:'Video', color:'#f87171',
                   icon:<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="8" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 5.5l3-1.5v5l-3-1.5v-2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>},
                ] as const).map(({m,label,icon,color})=>{
                  const active = mediaMode===m;
                  return (
                  <button key={m} type="button" className="rc-mode-btn"
                    onClick={()=>{ setMediaMode(m); if(m!=='text') setTimeout(()=>fileRef.current?.click(),50); }}
                    style={{
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                      padding:'9px 4px', borderRadius:11,
                      border: active ? `1px solid ${color}44` : '1px solid rgba(255,255,255,0.07)',
                      background: active ? `rgba(${color === '#a78bfa' ? '167,139,250' : color === '#60a5fa' ? '96,165,250' : '248,113,113'},0.10)` : 'rgba(255,255,255,0.03)',
                      cursor:'pointer',
                      color: active ? color : 'rgba(255,255,255,0.32)',
                      boxShadow: active ? `0 0 14px ${color}18, inset 0 1px 0 rgba(255,255,255,0.06)` : 'none',
                    }}>
                    {icon}
                    <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.04em'}}>{label}</span>
                  </button>
                )})}
              </div>
              <input ref={fileRef} type="file" accept="image/*,video/*" style={{display:'none'}} onChange={onFile}/>
              {uploadErr&&<p style={{margin:0,fontSize:10,color:'#f87171',textAlign:'center',lineHeight:1.4}}>{uploadErr}</p>}
            </div>

            {/* ── RIGHT: tabs + panel ── */}
            <div className="rc-controls" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

              {/* Horizontal tabs */}
              <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0,
                padding:'0 4px',background:'rgba(255,255,255,0.015)',gap:2}}>
                {([
                  {id:'presets' as const, label:'Presets', emoji:'✦'},
                  {id:'style'   as const, label:'Style',   emoji:'◈'},
                  {id:'text'    as const, label:'Text',    emoji:'Aa'},
                  {id:'effects' as const, label:'Effects', emoji:'✺'},
                ]).map(t=>{
                  const active = panel===t.id;
                  return (
                  <button key={t.id} type="button" className="rc-tab-btn"
                    onClick={()=>setPanel(t.id)}
                    style={{
                      flex:1, padding:'10px 4px 9px', fontSize:11.5, fontWeight:active?700:500,
                      border:'none', background:'none', cursor:'pointer',
                      color:active?'rgba(255,255,255,0.92)':'rgba(255,255,255,0.35)',
                      borderBottom:`2px solid ${active?'rgba(255,255,255,0.70)':'transparent'}`,
                      transition:'all 140ms ease',
                      letterSpacing: active ? '-0.01em' : '0',
                    }}>
                    {t.label}
                  </button>
                )})}
              </div>

              {/* Panel content */}
              <div className="rc-scrl rc-panel-content" key={panel}
                style={{flex:1,overflowY:'auto',padding:'16px 18px',scrollbarWidth:'none',animation:'rcFadeIn 0.16s ease both'}}>

                {/* ══ PRESETS ══ */}
                {panel==='presets'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>

                    {/* Upload zone */}
                    <div
                      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                      onDragLeave={()=>setDragOver(false)}
                      onDrop={onDrop}
                      onClick={()=>!uploading&&fileRef.current?.click()}
                      style={{
                        borderRadius:16, padding:'14px 16px', cursor:'pointer',
                        border:`1.5px dashed ${dragOver?'rgba(96,165,250,0.55)':'rgba(255,255,255,0.10)'}`,
                        background: dragOver
                          ? 'rgba(96,165,250,0.07)'
                          : previewSrc ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
                        display:'flex', alignItems:'center', gap:12,
                        transition:'all 180ms ease',
                        boxShadow: dragOver ? '0 0 0 4px rgba(96,165,250,0.08)' : 'none',
                      }}>
                      <div style={{
                        width:40, height:40, borderRadius:12, flexShrink:0,
                        background: previewSrc ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${previewSrc ? 'rgba(16,185,129,0.20)' : 'rgba(255,255,255,0.09)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        {uploading
                          ? <div style={{width:16,height:16,borderRadius:'50%',border:'2px solid rgba(255,255,255,0.12)',borderTopColor:'rgba(255,255,255,0.80)',animation:'rcSpin 0.75s linear infinite'}}/>
                          : previewSrc
                            ? <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M2 12l4-4 3 3 3-3 4 4" stroke="rgba(52,211,153,0.80)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="6" r="1.5" fill="rgba(52,211,153,0.60)"/></svg>
                            : <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M9 3v9M5 7l4-4 4 4" stroke="rgba(255,255,255,0.52)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 15h12" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                      </div>
                      <div style={{minWidth:0,flex:1}}>
                        <p style={{margin:0,fontSize:12.5,fontWeight:600,
                          color: previewSrc ? 'rgba(52,211,153,0.85)' : 'rgba(255,255,255,0.65)'}}>
                          {uploading ? 'Uploading…' : previewSrc ? 'Media ready · tap to replace' : 'Upload photo or video'}
                        </p>
                        <p style={{margin:'2px 0 0',fontSize:10,color:'rgba(255,255,255,0.25)'}}>
                          {previewSrc ? 'JPG · PNG · MP4 · MOV' : 'Drag & drop or click · up to 50 MB'}
                        </p>
                      </div>
                      {previewSrc && !uploading && (
                        <div style={{width:6,height:6,borderRadius:'50%',background:'#10b981',flexShrink:0}}/>
                      )}
                    </div>

                    {/* Divider */}
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/>
                      <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.10em',color:'rgba(255,255,255,0.22)',textTransform:'uppercase' as const}}>or pick a template</span>
                      <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/>
                    </div>

                    {/* Template grid — 3 cols desktop, 2 cols mobile */}
                    <div className="rc-tpl-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                      {PRESETS.map(p=>(
                        <button key={p.id} type="button" className="rc-preset-card" onClick={()=>applyPreset(p)}
                          style={{
                            position:'relative', aspectRatio:'3/4', borderRadius:13, overflow:'hidden',
                            background:p.bg, cursor:'pointer',
                            border:`1.5px solid ${bg.id===p.id?'rgba(255,255,255,0.65)':'rgba(255,255,255,0.07)'}`,
                            display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center',
                            padding:'10px 8px',
                            boxShadow:bg.id===p.id?'0 0 0 2px rgba(255,255,255,0.12)':'none',
                          }}>
                          {/* Sample text */}
                          <p style={{
                            margin:0, textAlign:'center',
                            fontSize: Math.round(p.size * 0.32),
                            color:p.text, lineHeight:1.25,
                            fontWeight:p.font==='display'||p.font==='bold'?800:p.font==='light'?300:600,
                            fontFamily:p.font==='serif'?"Georgia,serif":p.font==='mono'?"'Courier New',monospace":'system-ui',
                            textShadow:'0 1px 4px rgba(0,0,0,0.40)',
                            wordBreak:'break-word',
                          }}>
                            {p.sample.slice(0,22)}
                          </p>
                          {/* Label */}
                          <div style={{
                            position:'absolute', bottom:0, left:0, right:0,
                            padding:'12px 6px 5px',
                            background:'linear-gradient(to top,rgba(0,0,0,0.72),transparent)',
                          }}>
                            <p style={{margin:0,fontSize:8.5,fontWeight:700,textAlign:'center',
                              color:'rgba(255,255,255,0.60)',letterSpacing:'0.08em',textTransform:'uppercase' as const}}>
                              {p.label}
                            </p>
                          </div>
                          {/* Selected check */}
                          {bg.id===p.id&&(
                            <div style={{position:'absolute',top:6,right:6,width:16,height:16,borderRadius:'50%',background:'rgba(255,255,255,0.92)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="#000" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ══ STYLE ══ */}
                {panel==='style'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:20}}>
                    {mediaMode==='text'&&(
                      <div>
                        <p style={{margin:'0 0 10px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Background</p>
                        <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                          {BG_PRESETS.map(g=>(
                            <button key={g.id} type="button" onClick={()=>{setBg(g);setTextColor(g.text);}}
                              style={{width:36,height:36,borderRadius:10,background:g.value,
                                border:inB(bg.id===g.id),
                                cursor:'pointer',position:'relative',flexShrink:0,transition:'border-color 140ms, transform 130ms',
                                transform:bg.id===g.id?'scale(1.08)':'none'}}>
                              {bg.id===g.id&&<svg style={{position:'absolute',inset:0,margin:'auto'}} width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 3L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {mediaMode==='text'&&(
                      <div>
                        <p style={{margin:'0 0 10px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Text colour</p>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{position:'relative',width:38,height:38}}>
                            <div style={{width:38,height:38,borderRadius:10,background:textColor,border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer',boxShadow:'inset 0 0 0 1px rgba(0,0,0,0.20)'}}
                              onClick={()=>(document.getElementById('rc-clr') as HTMLInputElement)?.click()}/>
                            <input id="rc-clr" type="color" value={textColor} onChange={e=>setTextColor(e.target.value)} style={{position:'absolute',opacity:0,inset:0,cursor:'pointer'}}/>
                          </div>
                          <input className="rc-inp" value={textColor} onChange={e=>setTextColor(e.target.value)} maxLength={9}
                            style={{...inp,width:100,fontFamily:'ui-monospace,monospace',fontSize:12.5}}/>
                        </div>
                      </div>
                    )}
                    {mediaMode!=='text'&&(
                      <div>
                        <p style={{margin:'0 0 10px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Media</p>
                        <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}
                          onClick={()=>!uploading&&fileRef.current?.click()}
                          style={{borderRadius:13,padding:'18px',border:`1.5px dashed ${dragOver?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.11)'}`,
                            background:dragOver?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.02)',cursor:'pointer',
                            display:'flex',flexDirection:'column',alignItems:'center',gap:9,transition:'all 160ms ease'}}>
                          {uploading
                            ? <><div style={{width:22,height:22,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,0.12)',borderTopColor:'rgba(255,255,255,0.75)',animation:'rcSpin 0.75s linear infinite'}}/><p style={{margin:0,fontSize:12,color:'rgba(255,255,255,0.45)'}}>Uploading…</p></>
                            : <><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 4v10M7 9l4-5 4 5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 18h14" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6" strokeLinecap="round"/></svg>
                              <p style={{margin:0,fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.55)',textAlign:'center'}}>{previewSrc?'Replace media':'Drop or click to upload'}</p>
                              <p style={{margin:0,fontSize:10.5,color:'rgba(255,255,255,0.28)'}}>Photo or video · up to 50MB</p></>}
                        </div>
                        {uploadErr&&<p style={{margin:'8px 0 0',fontSize:11,color:'#f87171'}}>{uploadErr}</p>}
                      </div>
                    )}
                    {mediaMode!=='text'&&previewSrc&&(
                      <div>
                        <p style={{margin:'0 0 10px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Filter</p>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {IMAGE_FILTERS.map(f=>(
                            <button key={f.id} type="button" className="rc-opt-btn" onClick={()=>setImgFilter(f.id)}
                              style={{borderRadius:9,padding:'6px 12px',fontSize:12,fontWeight:imgFilter===f.id?700:500,
                                border:inB(imgFilter===f.id),background:inBg(imgFilter===f.id),
                                color:imgFilter===f.id?'rgba(255,255,255,0.90)':'rgba(255,255,255,0.42)',cursor:'pointer'}}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ TEXT ══ */}
                {panel==='text'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:20}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
                        <p style={{margin:0,fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Main text</p>
                        <span style={{fontSize:10,color:'rgba(255,255,255,0.25)'}}>{caption.length}/220</span>
                      </div>
                      <textarea className="rc-ta" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={220} rows={3}
                        placeholder="What's on your mind?"
                        style={{...inp,resize:'none',lineHeight:1.6,fontSize:14}}/>
                    </div>
                    <div>
                      <p style={{margin:'0 0 9px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Subtitle <span style={{textTransform:'none',fontSize:9,letterSpacing:'normal',color:'rgba(255,255,255,0.20)',fontWeight:400}}>optional</span></p>
                      <input className="rc-inp" value={subtitle} onChange={e=>setSubtitle(e.target.value)} maxLength={100}
                        placeholder="A supporting line…" style={inp}/>
                    </div>
                    <div>
                      <p style={{margin:'0 0 9px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Font</p>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                        {FONT_STYLES.map(f=>(
                          <button key={f.id} type="button" className="rc-opt-btn" onClick={()=>setFontId(f.id)}
                            style={{padding:'10px 6px',borderRadius:10,border:inB(fontId===f.id),background:inBg(fontId===f.id),cursor:'pointer',textAlign:'center'}}>
                            <p style={{margin:0,fontSize:16,...f.style,color:fontId===f.id?'rgba(255,255,255,0.92)':'rgba(255,255,255,0.40)'}}>Aa</p>
                            <p style={{margin:'3px 0 0',fontSize:8.5,color:'rgba(255,255,255,0.30)',fontFamily:'system-ui'}}>{f.label}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:9}}>
                        <p style={{margin:0,fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Size</p>
                        <span style={{fontSize:10.5,fontWeight:600,color:'rgba(255,255,255,0.35)'}}>{fontSize}px</span>
                      </div>
                      <input type="range" min={12} max={52} value={fontSize} onChange={e=>setFontSize(+e.target.value)}/>
                    </div>
                    <div>
                      <p style={{margin:'0 0 9px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Alignment &amp; position</p>
                      <div style={{display:'flex',gap:5,marginBottom:7}}>
                        {([
                          {id:'left' as const,icon:<svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2h12M1 6h8M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
                          {id:'center' as const,icon:<svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2h12M3 6h8M2 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
                          {id:'right' as const,icon:<svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2h12M5 6h8M3 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
                        ]).map(({id,icon})=>(
                          <button key={id} type="button" className="rc-opt-btn" onClick={()=>setTextAlign(id)}
                            style={{flex:1,padding:'9px',borderRadius:9,border:inB(textAlign===id),background:inBg(textAlign===id),
                              cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                              color:textAlign===id?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.32)'}}>
                            {icon}
                          </button>
                        ))}
                      </div>
                      <div style={{display:'flex',gap:5}}>
                        {([{id:'top' as const,l:'Top'},{id:'center' as const,l:'Middle'},{id:'bottom' as const,l:'Bottom'}]).map(({id,l})=>(
                          <button key={id} type="button" className="rc-opt-btn" onClick={()=>setTextPos(id)}
                            style={{flex:1,padding:'8px',borderRadius:9,fontSize:12,fontWeight:textPos===id?700:500,
                              border:inB(textPos===id),background:inBg(textPos===id),
                              cursor:'pointer',color:textPos===id?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.38)'}}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ EFFECTS ══ */}
                {panel==='effects'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    <p style={{margin:'0 0 4px',fontSize:9.5,fontWeight:700,textTransform:'uppercase' as const,
                      letterSpacing:'0.14em',color:'rgba(255,255,255,0.26)'}}>Overlays &amp; Finish</p>
                    {([
                      {label:'Vignette',    sub:'Dark gradient around edges',      val:vignette,    set:setVignette,    accent:'#a78bfa'},
                      {label:'Film Grain',  sub:'Cinematic noise overlay',          val:grain,       set:setGrain,       accent:'#fb923c'},
                      {label:'Inner Frame', sub:'Inset border for editorial look',  val:innerBorder, set:setInnerBorder, accent:'#60a5fa'},
                    ] as const).map(t=>(
                      <div key={t.label} style={{
                        display:'flex', alignItems:'center', gap:12,
                        padding:'13px 14px', borderRadius:13,
                        background: t.val ? `rgba(${t.accent==='#a78bfa'?'167,139,250':t.accent==='#fb923c'?'251,146,60':'96,165,250'},0.07)` : 'rgba(255,255,255,0.025)',
                        border: `1px solid ${t.val ? `rgba(${t.accent==='#a78bfa'?'167,139,250':t.accent==='#fb923c'?'251,146,60':'96,165,250'},0.20)` : 'rgba(255,255,255,0.06)'}`,
                        transition:'all 200ms ease',
                      }}>
                        <div style={{flex:1}}>
                          <p style={{margin:0,fontSize:13,fontWeight:600,color: t.val ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.72)'}}>{t.label}</p>
                          <p style={{margin:'2px 0 0',fontSize:10.5,color:'rgba(255,255,255,0.30)'}}>{t.sub}</p>
                        </div>
                        <button type="button" className="rc-toggle" onClick={()=>t.set(!t.val)}
                          style={{width:42,height:24,borderRadius:99,border:'none',cursor:'pointer',flexShrink:0,
                            background:t.val?t.accent:'rgba(255,255,255,0.10)',
                            position:'relative',transition:'background 220ms ease',
                            boxShadow: t.val ? `0 0 10px ${t.accent}44` : 'none'}}>
                          <div style={{
                            position:'absolute', top:4, width:16, height:16, borderRadius:'50%',
                            left: t.val ? 22 : 4,
                            background:t.val?'#fff':'rgba(255,255,255,0.55)',
                            transition:'left 220ms cubic-bezier(0.22,1,0.36,1)',
                            boxShadow:'0 1px 4px rgba(0,0,0,0.35)',
                          }}/>
                        </button>
                      </div>
                    ))}

                    {/* Overlay opacity (image/video only) */}
                    {mediaMode!=='text'&&previewSrc&&(
                      <div style={{marginTop:4,padding:'13px 14px',borderRadius:13,
                        background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                          <p style={{margin:0,fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.72)'}}>Scrim darkness</p>
                          <span style={{fontSize:10.5,fontWeight:600,color:'rgba(255,255,255,0.35)'}}>for text legibility</span>
                        </div>
                        <input type="range" min={0} max={80} defaultValue={40}
                          style={{width:'100%',accentColor:'rgba(255,255,255,0.65)'}}/>
                      </div>
                    )}

                    {/* Backdrop blur (text mode) */}
                    {mediaMode==='text'&&(
                      <div style={{marginTop:4,padding:'13px 14px',borderRadius:13,
                        background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)'}}>
                        <p style={{margin:'0 0 10px',fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.72)'}}>Background intensity</p>
                        <input type="range" min={50} max={100} defaultValue={100}
                          style={{width:'100%',accentColor:'rgba(255,255,255,0.65)'}}/>
                        <p style={{margin:'6px 0 0',fontSize:10,color:'rgba(255,255,255,0.22)'}}>Adjust gradient vibrancy</p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        {/* ══ PUBLISH STEP ══ */}
        {step==='publish'&&(
          <div className="rc-scrl rc-pub-step" style={{flex:1,overflowY:'auto',padding:'18px 18px',scrollbarWidth:'none',display:'flex',flexDirection:'column',gap:20}}>

            <div>
              <p style={{margin:'0 0 11px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Category</p>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {CATEGORIES.map(c=>{
                  const badge=CAT_BADGE[c]??DEFAULT_BADGE;
                  return (
                    <button key={c} type="button" className="rc-cat-chip" onClick={()=>setCategory(c)}
                      style={{
                        borderRadius:99, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer',
                        transition:'all 140ms ease',
                        border:`1px solid ${category===c?badge.border:'rgba(255,255,255,0.08)'}`,
                        background:category===c?badge.bg:'rgba(255,255,255,0.02)',
                        color:category===c?badge.text:'rgba(255,255,255,0.42)',
                      }}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p style={{margin:'0 0 11px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Visibility</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {([
                  {id:'public'  as const,icon:<svg width="15" height="14" viewBox="0 0 16 14" fill="none"><circle cx="8" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1C8 1 6 3.5 6 7s2 6 2 6M8 1c0 0 2 2.5 2 6s-2 6-2 6M2 7h12" stroke="currentColor" strokeWidth="1.3"/></svg>,label:'Public',sub:'Visible to everyone'},
                  {id:'private' as const,icon:<svg width="13" height="15" viewBox="0 0 12 15" fill="none"><rect x="1.5" y="6" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 6V4a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>,label:'Only me',sub:'Stays private'},
                ]).map(({id,icon,label,sub})=>(
                  <button key={id} type="button" className="rc-opt-btn" onClick={()=>setVisibility(id)}
                    style={{
                      borderRadius:14, padding:'16px',
                      border:inB(visibility===id), background:inBg(visibility===id),
                      cursor:'pointer', display:'flex', flexDirection:'column', gap:9, textAlign:'left',
                    }}>
                    <span style={{color:visibility===id?'rgba(255,255,255,0.80)':'rgba(255,255,255,0.30)'}}>{icon}</span>
                    <p style={{margin:0,fontSize:13.5,fontWeight:700,color:visibility===id?'rgba(255,255,255,0.92)':'rgba(255,255,255,0.48)'}}>{label}</p>
                    <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,0.28)'}}>{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{margin:'0 0 11px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>Expires after</p>
              <div style={{display:'flex',gap:8}}>
                {[6,12,24,48].map(h=>(
                  <button key={h} type="button" className="rc-opt-btn" onClick={()=>setExpiry(h)}
                    style={{
                      flex:1, padding:'11px', borderRadius:12,
                      border:inB(expiry===h), background:inBg(expiry===h),
                      cursor:'pointer', fontSize:13.5, fontWeight:700,
                      color:expiry===h?'rgba(255,255,255,0.92)':'rgba(255,255,255,0.40)',
                    }}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{margin:'0 0 11px',fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.12em',color:'rgba(255,255,255,0.30)'}}>
                Call-to-action <span style={{textTransform:'none',fontSize:9,letterSpacing:'normal',color:'rgba(255,255,255,0.22)',fontWeight:400,marginLeft:4}}>optional</span>
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <input className="rc-inp" value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)} placeholder="Button label — e.g. Read more" maxLength={50} style={inp}/>
                <input className="rc-inp" type="url" value={ctaUrl} onChange={e=>setCtaUrl(e.target.value)} placeholder="https://…" style={inp}/>
                {ctaLabel&&ctaUrl&&(
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:11,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.32)'}}>Preview</span>
                    <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 13px',borderRadius:99,background:'rgba(255,255,255,0.90)',color:'#000',fontSize:12,fontWeight:700}}>
                      {ctaLabel}<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H3.5M8 2v4.5" stroke="#000" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ══ FOOTER ══ */}
        <div className="rc-footer" style={{
          display:'flex', gap:8, padding:'12px 16px',
          borderTop:'1px solid rgba(255,255,255,0.07)',
          flexShrink:0,
          background:'rgba(0,0,0,0.10)',
          paddingBottom:'max(12px, env(safe-area-inset-bottom))',
        }}>
          <button type="button" onClick={step==='design'?onClose:()=>setStep('design')}
            style={{width:44,height:44,borderRadius:12,border:'1px solid rgba(255,255,255,0.08)',
              background:'rgba(255,255,255,0.04)',cursor:'pointer',display:'flex',alignItems:'center',
              justifyContent:'center',color:'rgba(255,255,255,0.42)',flexShrink:0,transition:'all 140ms ease'}}>
            {step==='design'
              ? <svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M1 1l9 9M10 1 1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              : <svg width="12" height="11" viewBox="0 0 14 12" fill="none"><path d="M9 2L4 6l5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
          {step==='design'?(
            <button type="button" onClick={()=>setStep('publish')} disabled={!canPublish}
              style={{
                flex:1, height:44, borderRadius:12, border:'none',
                cursor:canPublish?'pointer':'not-allowed',
                background:canPublish
                  ? 'linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,240,255,0.88))'
                  : 'rgba(255,255,255,0.05)',
                fontSize:13.5, fontWeight:700, letterSpacing:'-0.01em',
                color:canPublish?'#060608':'rgba(255,255,255,0.20)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                transition:'all 180ms ease',
                boxShadow:canPublish?'0 4px 24px rgba(255,255,255,0.14), 0 1px 0 rgba(255,255,255,0.15) inset':'none',
              }}>
              {canPublish ? <>Continue <svg width="12" height="11" viewBox="0 0 14 12" fill="none"><path d="M5 2l5 4-5 4" stroke="#060608" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></> : 'Add content to continue'}
            </button>
          ):(
            <button type="button" onClick={submit} disabled={submitting||uploading}
              style={{
                flex:1, height:44, borderRadius:12, border:'none',
                cursor:submitting||uploading?'not-allowed':'pointer',
                background:submitting||uploading
                  ? 'rgba(255,255,255,0.06)'
                  : 'linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,240,255,0.88))',
                fontSize:13.5, fontWeight:700, letterSpacing:'-0.01em',
                color:submitting||uploading?'rgba(255,255,255,0.25)':'#060608',
                display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                transition:'all 180ms ease',
                boxShadow:(!submitting&&!uploading)?'0 4px 24px rgba(255,255,255,0.14), 0 1px 0 rgba(255,255,255,0.15) inset':'none',
              }}>
              {uploading
                ? <><div style={{width:13,height:13,borderRadius:'50%',border:'2px solid rgba(0,0,0,0.15)',borderTopColor:'#000',animation:'rcSpin 0.8s linear infinite'}}/>Uploading…</>
                : submitting
                  ? <><div style={{width:13,height:13,borderRadius:'50%',border:'2px solid rgba(0,0,0,0.15)',borderTopColor:'#000',animation:'rcSpin 0.8s linear infinite'}}/>Publishing…</>
                  : <>Publish <svg width="13" height="12" viewBox="0 0 14 12" fill="none"><path d="M2 6h10M8 2l4 4-4 4" stroke="#060608" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></>}
            </button>
          )}
        </div>{/* footer */}
      </div>{/* rc-modal */}
      </div>{/* rc-root */}
    </div>,
    document.body
  );
}


// ─── Recents Bar ──────────────────────────────────────────────────────────────

export default function RecentsBar() {
  const { data: session, status } = useSession();
  const uid    = (session?.user as { id?: string })?.id ?? null;
  const isAuth = status === 'authenticated';

  const [recents,    setRecents]    = useState<Recent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [viewerIdx,  setViewerIdx]  = useState<number|null>(null);
  const [creating,   setCreating]   = useState(false);
  const [isMounted,  setIsMounted]  = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/recents');
      if (!res.ok) return;
      const d   = await res.json() as { recents?: Recent[] };
      if (Array.isArray(d.recents)) setRecents(d.recents);
    } catch { /* non-fatal */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleDelete(id: string) { setRecents(p => p.filter(r => r.id !== id)); setViewerIdx(null); }
  function handleCreated(r: Recent) { setRecents(p => [r, ...p]); setCreating(false); setTimeout(() => setViewerIdx(0), 180); }

  if (loading) return (
    <>
      <style>{`
        @keyframes rcSk{0%,100%{opacity:.6}50%{opacity:.2}}
        .rc-card{width:96px;height:142px;border-radius:14px}
        @media(min-width:768px){.rc-card{width:100px!important;height:148px!important;border-radius:15px!important}}
        @media(min-width:1280px){.rc-card{width:116px!important;height:170px!important;border-radius:16px!important}}
      `}</style>
      <div style={{ display:'flex',gap:10,paddingBottom:4,overflowX:'auto',scrollbarWidth:'none' }}>
        {[...Array(6)].map((_,i) => (
          <div key={i} className="rc-card" style={{ background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)',flexShrink:0,animation:`rcSk 1.4s ${i*.12}s ease-in-out infinite` }} />
        ))}
      </div>
    </>
  );

  if (!loading && recents.length === 0 && !isAuth) return null;

  return (
    <>
      <style>{`
        @keyframes rcBarIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
        .rc-scr::-webkit-scrollbar{display:none}
        .rc-card{width:96px;height:142px;border-radius:14px}
        .rc-add {width:96px;height:142px;border-radius:14px}
        .rc-av  {width:22px;height:22px}
        .rc-cat {font-size:8px}
        @media(min-width:768px){
          .rc-card{width:100px!important;height:148px!important;border-radius:15px!important}
          .rc-add {width:100px!important;height:148px!important;border-radius:15px!important}
          .rc-av  {width:26px!important;height:26px!important}
          .rc-cat {font-size:9px!important}
          .rc-add-icon{width:36px!important;height:36px!important}
          .rc-add-plus{width:15px!important;height:15px!important}
          .rc-add-label{font-size:10.5px!important}
        }
        @media(min-width:1280px){
          .rc-card{width:116px!important;height:170px!important;border-radius:16px!important}
          .rc-add {width:116px!important;height:170px!important;border-radius:16px!important}
          .rc-av  {width:28px!important;height:28px!important}
          .rc-cat {font-size:9.5px!important}
          .rc-add-icon{width:40px!important;height:40px!important}
          .rc-add-label{font-size:11px!important}
        }
      `}</style>
      <div style={{ width:'100%',animation:'rcBarIn 0.30s cubic-bezier(0.22,1,0.36,1) both' }}>
        {/* Label row */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
          <div style={{ display:'flex',alignItems:'center',gap:7 }}>
            <div style={{ width:1.5,height:12,borderRadius:99,background:'rgba(255,255,255,0.30)' }} />
            <span style={{ fontSize:11,fontWeight:500,color:'rgba(255,255,255,0.32)',letterSpacing:'0.01em' }}>recents</span>
          </div>
          <a href="/recents" style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.32)',textDecoration:'none',padding:'3px 8px',borderRadius:7,border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)',transition:'all 140ms ease' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.60)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.14)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.32)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.07)';}}>
            View all
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H3.5M8 2v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>

        {/* Scroll row */}
        <div ref={scrollRef} className="rc-scr" style={{ display:'flex',gap:10,overflowX:'auto',paddingBottom:4,scrollbarWidth:'none',WebkitOverflowScrolling:'touch' }}>

          {/* Add button */}
          {isAuth && (
            <button type="button" onClick={()=>setCreating(true)}
              className="rc-add"
              style={{ flexShrink:0,border:'1px dashed rgba(255,255,255,0.18)',background:'rgba(255,255,255,0.02)',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,transition:'all 150ms ease',position:'relative' }}
              onMouseEnter={(e)=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.30)';}}
              onMouseLeave={(e)=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.02)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.18)';}}
            >
              <div className="rc-add-icon" style={{ width:28,height:28,borderRadius:'50%',background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <svg className="rc-add-plus" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="rgba(255,255,255,0.60)" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </div>
              <span className="rc-add-label" style={{ fontSize:9.5,fontWeight:600,color:'rgba(255,255,255,0.30)',letterSpacing:'0.04em' }}>Add</span>
            </button>
          )}

          {recents.map((r, i) => (
            <Thumb key={r.id} r={r} seen={uid ? r.viewedBy.includes(uid) : false} onClick={() => setViewerIdx(i)} />
          ))}
        </div>
      </div>

      {isMounted && viewerIdx !== null && (
        <Viewer recents={recents} startIdx={viewerIdx} uid={uid ?? undefined} onClose={() => setViewerIdx(null)} onDelete={handleDelete} />
      )}
      {isMounted && creating && (
        <Creator onClose={() => setCreating(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
