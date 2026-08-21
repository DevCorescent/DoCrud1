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
  /* The header avatar is one reused instance as the viewer moves between
     stories, so a failure on one owner's photo must not leave the next owner
     stuck on the initial fallback. */
  useEffect(() => { setErr(false); }, [src]);
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

// ─── Story-creator stylesheet ─────────────────────────────────────────────────
// Single source of truth for the creator's responsive rules. Layout is driven by
// three states only — compact (drawer), short-landscape (split) and wide (split)
// — so no two media queries fight over the same property.

// ─── Story frames ─────────────────────────────────────────────────────────────
// A frame is one complete draft. Frames live entirely in the creator; each one
// is published through the existing single-recent endpoint.

interface Frame {
  id: string;
  mediaMode: 'text' | 'image' | 'video';
  mediaUrl: string | null;
  localBlob: string | null;
  pendingFile: File | null;
  uploadErr: string;
  caption: string;
  subtitle: string;
  bg: typeof BG_PRESETS[0];
  fontId: string;
  fontSize: number;
  textColor: string;
  textAlign: TextAlign;
  textPos: TextPosition;
  imgFilter: ImageFilter;
  vignette: boolean;
  grain: boolean;
  innerBorder: boolean;
}

function blankFrame(id: string): Frame {
  return {
    id, mediaMode:'text', mediaUrl:null, localBlob:null, pendingFile:null, uploadErr:'',
    caption:'', subtitle:'', bg:BG_PRESETS[0], fontId:'sans', fontSize:24,
    textColor:'#ffffff', textAlign:'center', textPos:'center', imgFilter:'none',
    vignette:false, grain:false, innerBorder:false,
  };
}

function frameHasContent(f: Frame) {
  return f.mediaMode === 'text' ? f.caption.trim().length > 0 : !!(f.mediaUrl || f.localBlob);
}

const CREATOR_CSS = `
@keyframes rcSheet{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes rcFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes rcSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

/* ══ Shared primitives ══ */
.sc-root .rc-scrl::-webkit-scrollbar{display:none}
.sc-root .rc-scrl{scrollbar-width:none}
.sc-root .rc-ta::placeholder,.sc-root .rc-inp::placeholder{color:rgba(255,255,255,0.18)}
.sc-root .rc-ta:focus,.sc-root .rc-inp:focus{outline:none!important;border-color:rgba(139,92,246,0.45)!important;background:rgba(139,92,246,0.06)!important;box-shadow:0 0 0 3px rgba(139,92,246,0.08)!important}
.sc-root input[type=range]{accent-color:#a78bfa;cursor:pointer;width:100%}
.sc-root .rc-preset-card{transition:transform 180ms cubic-bezier(0.34,1.56,0.64,1),box-shadow 180ms ease,border-color 180ms ease,opacity 180ms ease}
.sc-root .rc-preset-card:active{transform:scale(0.96)!important;opacity:0.85}
@media(hover:hover){.rc-preset-card:hover{transform:translateY(-3px) scale(1.03)!important;box-shadow:0 16px 40px rgba(0,0,0,0.65)!important}}
.sc-root .rc-opt-btn,.sc-root .rc-cat-chip,.sc-root .rc-toggle{-webkit-tap-highlight-color:transparent;transition:all 150ms ease}
.sc-root .rc-opt-btn:active{transform:scale(0.97)}

/* ══ Shell ══ */
.sc-root{
  position:fixed;inset:0;z-index:99998;
  height:100svh;height:100dvh;
  display:flex;align-items:stretch;justify-content:center;
  background:rgba(4,3,12,0.82);
  -webkit-backdrop-filter:blur(24px) saturate(150%);backdrop-filter:blur(24px) saturate(150%);
  overscroll-behavior:contain;
  -webkit-tap-highlight-color:transparent;
}
.sc-root .sc-shell{
  --pad:clamp(8px,2.4vw,18px);
  --gap:clamp(6px,1.6vw,12px);
  position:relative;box-sizing:border-box;
  display:flex;flex-direction:column;
  width:100%;min-width:0;min-height:0;max-width:100%;
  background:#0b0b0e;color:#fff;overflow:hidden;
  font-family:inherit;
  padding-top:env(safe-area-inset-top);
  padding-left:env(safe-area-inset-left);
  padding-right:env(safe-area-inset-right);
  animation:rcSheet .3s cubic-bezier(.22,1,.36,1) both;
}
.sc-root .sc-main{position:relative;flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden}

/* ══ Header ══ */
.sc-root .sc-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;min-width:0;
  padding:clamp(7px,2vw,13px) var(--pad);border-bottom:1px solid rgba(255,255,255,.07)}
.sc-root .sc-headTitle{flex:1 1 auto;min-width:0;overflow:hidden}
.sc-root .sc-headT{margin:0;font-size:clamp(13px,3.4vw,15px);font-weight:700;letter-spacing:-.02em;
  color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-root .sc-headS{margin:1px 0 0;font-size:10.5px;color:rgba(255,255,255,.30);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none}
.sc-root .sc-headBtn{width:34px;height:34px;flex:0 0 auto;border-radius:10px;cursor:pointer;
  border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);
  color:rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;transition:all 140ms ease}
@media(hover:hover){.sc-headBtn:hover{background:rgba(255,255,255,.09);color:rgba(255,255,255,.85)}}
.sc-root .sc-steps{display:flex;align-items:center;gap:3px;flex:0 0 auto}
.sc-root .sc-steps span{height:3px;width:6px;border-radius:99px;background:rgba(255,255,255,.14);
  transition:all 280ms cubic-bezier(.22,1,.36,1)}
.sc-root .sc-steps span[data-active="true"]{width:20px;background:rgba(255,255,255,.8)}

/* ══ Stage column ══ */
.sc-root .sc-stagecol{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;
  gap:var(--gap);padding:var(--pad);box-sizing:border-box}
.sc-root .sc-stage{flex:1 1 auto;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;
  container-type:size}

/* 9:16, always — never distorted, never larger than the space it is given */
.sc-root .sc-canvas{
  position:relative;flex:0 0 auto;overflow:hidden;isolation:isolate;
  width:min(100cqw, calc(100cqh * 9 / 16), 460px);
  aspect-ratio:9/16;
  container-type:size;
  border-radius:clamp(12px,3cqw,24px);
  border:1px solid rgba(255,255,255,.12);
  box-shadow:0 18px 50px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.08);
}
@supports not (width:1cqw){
  .sc-root .sc-canvas{width:auto;height:100%;max-width:100%;border-radius:18px}
}

.sc-root .sc-prog{position:absolute;top:2.6cqw;left:2.6cqw;right:2.6cqw;z-index:20;display:flex;gap:.8cqw;pointer-events:none}
.sc-root .sc-prog span{flex:1;height:max(2px,.55cqw);border-radius:99px}
.sc-root .sc-cvTop{position:absolute;top:6.6cqw;left:2.6cqw;right:2.6cqw;z-index:20;display:flex;align-items:center;gap:1.4cqw}
.sc-root .sc-cvTools{display:flex;align-items:center;gap:1.4cqw;margin-left:auto;min-width:0}
.sc-root .sc-tool{
  width:clamp(20px,11cqw,44px);height:clamp(20px,11cqw,44px);flex:0 0 auto;box-sizing:border-box;
  padding:clamp(4px,2.6cqw,11px);border-radius:50%;cursor:pointer;color:#fff;
  display:flex;align-items:center;justify-content:center;
  border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.55);
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  transition:background 160ms ease,transform 160ms ease,border-color 160ms ease;
}
.sc-root .sc-tool[data-active="true"]{background:rgba(167,139,250,.38);border-color:rgba(167,139,250,.55)}
.sc-root .sc-tool:active{transform:scale(.93)}
@media(hover:hover){.sc-tool:hover{background:rgba(0,0,0,.78)}}
.sc-root .sc-toolTxt{font-size:clamp(11px,5cqw,20px);font-weight:700;line-height:1}

.sc-root .sc-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sc-root .sc-scrim{position:absolute;inset:0;z-index:1;pointer-events:none}
.sc-root .sc-grain{position:absolute;inset:0;z-index:1;opacity:.16;mix-blend-mode:overlay;pointer-events:none;
  background-size:180px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")}
.sc-root .sc-cap{position:absolute;left:5cqw;right:5cqw;z-index:3;pointer-events:none}
.sc-root .sc-inner{position:absolute;inset:2.4cqw;border-radius:3cqw;border:1px solid rgba(255,255,255,.18);z-index:4;pointer-events:none}

.sc-root .sc-empty{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:.35em;padding:0;background:none;border:none;cursor:pointer;text-align:center;
  color:rgba(255,255,255,.62)}
.sc-root .sc-emptyPlus{font-size:clamp(22px,9cqw,40px);line-height:1}
.sc-root .sc-emptyT{font-size:clamp(11px,3.6cqw,16px);font-weight:600}
.sc-root .sc-emptyS{font-size:clamp(9px,2.8cqw,13px);color:rgba(255,255,255,.30)}

.sc-root .sc-uploading{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:10px;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  font-size:11px;font-weight:600;letter-spacing:.04em;color:rgba(255,255,255,.62)}
.sc-root .sc-spin{display:inline-block;width:26px;height:26px;border-radius:50%;
  border:2.5px solid rgba(255,255,255,.15);border-top-color:rgba(255,255,255,.8);
  animation:rcSpin .75s linear infinite}
.sc-root .sc-spinSm{width:13px;height:13px;border-width:2px;border-color:rgba(0,0,0,.18);border-top-color:#000}

/* ══ Colour / filter strip ══ */
.sc-root .sc-strip{flex:0 0 auto;display:flex;align-items:center;gap:clamp(6px,1.8vw,10px);
  overflow-x:auto;overflow-y:hidden;padding:1px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.sc-root .sc-strip::-webkit-scrollbar{display:none}
.sc-root .sc-dot{flex:0 0 auto;width:clamp(24px,7vw,34px);height:clamp(24px,7vw,34px);border-radius:50%;padding:0;
  cursor:pointer;border:2px solid rgba(255,255,255,.22);transition:transform 160ms ease,border-color 160ms ease}
.sc-root .sc-dot[data-active="true"]{border-color:#fff;transform:scale(1.08)}
.sc-root .sc-dotSep{flex:0 0 auto;width:1px;height:20px;background:rgba(255,255,255,.12)}
.sc-root .sc-dotWrap{position:relative;display:inline-flex;flex:0 0 auto}
.sc-root .sc-dotPick{border-color:rgba(255,255,255,.55);box-shadow:0 0 0 2px rgba(255,255,255,.08)}
.sc-root .sc-colorInput{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:none;padding:0;cursor:pointer}
.sc-root .sc-chip{flex:0 0 auto;padding:7px 14px;border-radius:99px;cursor:pointer;font-size:12px;font-weight:600;
  border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:rgba(255,255,255,.45);
  transition:all 150ms ease;white-space:nowrap}
.sc-root .sc-chip[data-active="true"]{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.10);color:rgba(255,255,255,.92)}

/* ══ Frame rail ══ */
.sc-root .sc-rail{flex:0 0 auto;display:flex;align-items:center;gap:clamp(5px,1.6vw,10px);
  overflow-x:auto;overflow-y:hidden;padding:1px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.sc-root .sc-rail::-webkit-scrollbar{display:none}
.sc-root .sc-frame{position:relative;flex:0 0 auto;width:clamp(34px,9.5vw,50px);aspect-ratio:9/16;
  border-radius:9px;overflow:hidden;cursor:pointer;padding:3px;box-sizing:border-box;
  display:flex;align-items:center;justify-content:center;
  border:1.5px solid rgba(255,255,255,.12);transition:border-color 150ms ease,transform 150ms ease}
.sc-root .sc-frame[data-active="true"]{border-color:#fff;transform:translateY(-2px)}
.sc-root .sc-frameTxt{font-size:6.5px;line-height:1.15;text-align:center;overflow:hidden;max-height:76%}
.sc-root .sc-frameNo{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);
  width:13px;height:13px;border-radius:50%;background:rgba(0,0,0,.62);color:rgba(255,255,255,.8);
  font-size:7.5px;font-weight:700;display:flex;align-items:center;justify-content:center}
.sc-root .sc-frameAdd{background:rgba(255,255,255,.03);border-style:dashed;color:rgba(255,255,255,.45);
  font-size:17px;font-weight:300;line-height:1}
.sc-root .sc-frameWrap{position:relative;flex:0 0 auto;display:inline-flex}
.sc-root .sc-frameMedia{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sc-root .sc-frameBusy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.55)}
.sc-root .sc-spinTiny{width:14px;height:14px;border-width:2px}
.sc-root .sc-frameErr{position:absolute;top:3px;right:3px;width:7px;height:7px;border-radius:50%;
  background:#f87171;box-shadow:0 0 0 2px rgba(0,0,0,.5)}
.sc-root .sc-frameDel{position:absolute;top:2px;right:2px;z-index:2;width:16px;height:16px;padding:0;
  display:flex;align-items:center;justify-content:center;
  border-radius:50%;cursor:pointer;line-height:1;font-size:12px;
  border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.72);color:rgba(255,255,255,.75);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
@media(hover:hover){.sc-root .sc-frameDel:hover{background:#f87171;color:#fff;border-color:#f87171}}

.sc-root .sc-retry{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:6px;padding:8cqw;cursor:pointer;text-align:center;
  border:none;background:rgba(0,0,0,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  color:rgba(255,255,255,.9)}
.sc-root .sc-retryIcon{width:clamp(20px,9cqw,34px);height:clamp(20px,9cqw,34px);color:#f87171}
.sc-root .sc-retryT{font-size:clamp(10px,3.2cqw,14px);font-weight:700;color:#fca5a5;line-height:1.3}
.sc-root .sc-retryS{font-size:clamp(9px,2.6cqw,12px);color:rgba(255,255,255,.55)}
.sc-root .sc-stage[data-drag="true"] .sc-canvas{border-color:rgba(96,165,250,.6);
  box-shadow:0 0 0 3px rgba(96,165,250,.18),0 18px 50px rgba(0,0,0,.75)}
.sc-root .sc-noteErr{border-color:rgba(248,113,113,.35);color:#fca5a5}

/* ══ Bottom nav ══ */
.sc-root .sc-nav{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:clamp(2px,1.2vw,10px)}
.sc-root .sc-navBtn{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;padding:4px 2px;border:none;border-radius:10px;background:none;cursor:pointer;
  color:rgba(255,255,255,.55);transition:color 150ms ease,background 150ms ease}
@media(hover:hover){.sc-navBtn:hover{color:#fff;background:rgba(255,255,255,.06)}}
.sc-root .sc-navBtn:active{transform:scale(.96)}
.sc-root .sc-navIcon{display:block;width:clamp(16px,5vw,22px);height:clamp(16px,5vw,22px)}
.sc-root .sc-navLabel{max-width:100%;font-size:clamp(8px,2.4vw,11px);font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-root .sc-shutter{flex:0 0 auto;width:clamp(42px,13vw,58px);height:clamp(42px,13vw,58px);border-radius:50%;
  padding:0;cursor:pointer;background:transparent;border:3px solid rgba(255,255,255,.9);
  display:flex;align-items:center;justify-content:center;transition:transform 150ms ease}
.sc-root .sc-shutter span{width:78%;height:78%;border-radius:50%;background:rgba(255,255,255,.07)}
.sc-root .sc-shutter:active{transform:scale(.93)}

.sc-root .sc-err{flex:0 0 auto;margin:0;font-size:11px;line-height:1.4;color:#f87171;text-align:center}

/* ══ Tools / settings column — drawer by default ══ */
.sc-root .sc-scrimTap{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.5);opacity:0;
  pointer-events:none;transition:opacity 250ms ease}
.sc-root .sc-scrimTap[data-open="true"]{opacity:1;pointer-events:auto}
.sc-root .sc-side{
  position:absolute;left:0;right:0;bottom:0;z-index:40;
  display:flex;flex-direction:column;min-height:0;box-sizing:border-box;
  max-height:min(64svh,540px);
  background:#101014;border-top:1px solid rgba(255,255,255,.10);
  border-radius:20px 20px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.6);
  transform:translateY(102%);pointer-events:none;
  transition:transform 300ms cubic-bezier(.22,1,.36,1);
}
.sc-root .sc-side[data-open="true"]{transform:none;pointer-events:auto}
.sc-root .sc-side[data-full="true"]{top:0;max-height:none;border-radius:0}
.sc-root .sc-grab{flex:0 0 auto;display:flex;align-items:center;justify-content:center;
  padding:9px 0 7px;border:none;background:none;cursor:pointer;width:100%}
.sc-root .sc-grab span{width:38px;height:4px;border-radius:99px;background:rgba(255,255,255,.18)}
.sc-root .sc-tabs{flex:0 0 auto;display:flex;gap:2px;padding:0 6px;
  border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.015)}
.sc-root .sc-tab{flex:1 1 0;min-width:0;padding:11px 4px 10px;cursor:pointer;border:none;background:none;
  font-size:clamp(11px,3vw,12.5px);font-weight:500;color:rgba(255,255,255,.38);
  border-bottom:2px solid transparent;transition:color 140ms ease,border-color 140ms ease;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-root .sc-tab[data-active="true"]{color:rgba(255,255,255,.94);font-weight:700;border-bottom-color:rgba(255,255,255,.7)}
.sc-root .sc-panelBody{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;scrollbar-width:none;
  padding:clamp(12px,3vw,18px) clamp(12px,3.4vw,20px) max(20px,env(safe-area-inset-bottom));
  animation:rcFadeIn .16s ease both}
.sc-root .sc-panelBody::-webkit-scrollbar{display:none}
.sc-root .sc-lbl{margin:0 0 9px;font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.12em;color:rgba(255,255,255,.30)}
.sc-root .sc-modeRow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.sc-root .sc-modeBtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  min-width:0;padding:9px 4px;border-radius:11px;cursor:pointer;transition:all 150ms ease;
  font-size:9px;font-weight:700;letter-spacing:.04em}
.sc-root .sc-tplGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:clamp(7px,2vw,10px)}
.sc-root .sc-fontGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:6px}

/* ══ Footer ══ */
.sc-root .sc-foot{flex:0 0 auto;z-index:50;display:flex;align-items:center;gap:8px;
  padding:clamp(8px,2vw,12px) var(--pad);
  padding-bottom:max(clamp(8px,2vw,12px),env(safe-area-inset-bottom));
  border-top:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.20)}
.sc-root .sc-footBack{flex:0 0 auto;width:44px;height:44px;border-radius:12px;cursor:pointer;
  border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.45);
  display:flex;align-items:center;justify-content:center;transition:all 140ms ease}
@media(hover:hover){.sc-footBack:hover{background:rgba(255,255,255,.09);color:rgba(255,255,255,.85)}}
.sc-root .sc-cta{flex:1 1 auto;min-width:0;height:44px;border-radius:12px;border:none;
  display:flex;align-items:center;justify-content:center;gap:7px;
  font-size:clamp(12px,3.4vw,14px);font-weight:700;letter-spacing:-.01em;
  background:rgba(255,255,255,.05);color:rgba(255,255,255,.22);cursor:not-allowed;
  transition:all 180ms ease;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-root .sc-cta[data-on="true"]{cursor:pointer;color:#060608;
  background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(240,240,255,.88));
  box-shadow:0 4px 24px rgba(255,255,255,.14),inset 0 1px 0 rgba(255,255,255,.15)}

.sc-root .sc-note{position:absolute;left:50%;bottom:calc(var(--pad) + 76px);transform:translateX(-50%);z-index:60;
  max-width:min(92%,420px);padding:10px 14px;border-radius:12px;text-align:center;
  background:rgba(20,20,24,.95);border:1px solid rgba(255,255,255,.12);
  color:rgba(255,255,255,.78);font-size:12px;line-height:1.4;
  box-shadow:0 12px 40px rgba(0,0,0,.6);animation:rcFadeIn .2s ease both}

/* ══ Touch targets ══ */
@media(pointer:coarse){
  .sc-root .sc-tap{min-width:44px;min-height:44px}
  .sc-root .sc-navBtn{min-height:48px}
}

/* ══ Very small phones — trim spacing before the canvas ══ */
@media(max-width:360px){
  .sc-root .sc-shell{--pad:8px;--gap:5px}
  .sc-root .sc-headBtn{width:32px;height:32px}
  .sc-root .sc-frame{width:32px}
  .sc-root .sc-strip{gap:6px}
}
@media(max-height:640px) and (orientation:portrait){
  .sc-root .sc-head{padding-top:6px;padding-bottom:6px}
  .sc-root .sc-frame{width:clamp(30px,8vw,40px)}
}

/* ══ Tablet portrait — centred controls, wider drawer ══ */
@media(min-width:700px) and (max-width:899px){
  .sc-root .sc-shell{--pad:clamp(14px,2.4vw,22px)}
  .sc-root .sc-headS{display:block}
  .sc-root .sc-strip,.sc-root .sc-rail,.sc-root .sc-nav{width:100%;max-width:620px;margin-left:auto;margin-right:auto;justify-content:center}
  .sc-root .sc-nav{justify-content:space-between}
  .sc-root .sc-side{left:50%;right:auto;width:min(700px,100%);border-radius:24px 24px 0 0;
    max-height:min(58svh,560px);transform:translate(-50%,102%)}
  .sc-root .sc-side[data-open="true"]{transform:translate(-50%,0)}
}

/* ══ Short landscape (phones on their side) — split workspace ══ */
@media(orientation:landscape) and (max-height:560px){
  .sc-root .sc-shell{--pad:clamp(6px,1.4vw,12px);--gap:5px}
  .sc-root .sc-head{padding-top:5px;padding-bottom:5px}
  .sc-root .sc-headS{display:none}
  .sc-root .sc-main{flex-direction:row}
  .sc-root .sc-stagecol{flex:1 1 auto}
  .sc-root .sc-scrimTap{display:none}
  .sc-root .sc-side{position:static;flex:0 0 auto;width:min(52%,380px);max-height:none;
    transform:none;pointer-events:auto;border-radius:0;border-top:none;
    border-left:1px solid rgba(255,255,255,.10);box-shadow:none;background:rgba(255,255,255,.015)}
  .sc-root .sc-side[data-full="true"]{width:min(64%,460px)}
  .sc-root .sc-grab{display:none}
  .sc-root .sc-frame{width:clamp(24px,4.2vw,32px)}
  .sc-root .sc-navLabel{display:none}
  .sc-root .sc-shutter{width:38px;height:38px;border-width:2.5px}
  .sc-root .sc-foot{padding-top:6px;padding-bottom:max(6px,env(safe-area-inset-bottom))}
  .sc-root .sc-cta,.sc-root .sc-footBack{height:40px}
  .sc-root .sc-footBack{width:40px}
}

/* ══ Split layouts — controls stand beside the canvas so height goes to 9:16 ══ */
@media(min-width:900px),(orientation:landscape) and (max-height:560px){
  .sc-root .sc-stagecol{flex-direction:row;align-items:stretch}
  .sc-root .sc-strip,.sc-root .sc-rail{flex-direction:column;flex:0 0 auto;width:auto;
    overflow-x:hidden;overflow-y:auto;justify-content:flex-start}
  .sc-root .sc-nav{flex-direction:column;justify-content:center;flex:0 0 auto;width:auto;
    gap:clamp(4px,0.8vh,10px)}
  .sc-root .sc-navBtn{flex:0 0 auto;width:100%}
  .sc-root .sc-frame{width:clamp(30px,3.2vw,40px)}
  .sc-root .sc-err{writing-mode:vertical-rl}
}
/* A capture button only earns its place on devices with a camera */
@media(hover:hover) and (pointer:fine){
  .sc-root .sc-shutter{display:none}
}

/* ══ Laptop / desktop / ultra-wide — centred workspace ══ */
@media(min-width:900px){
  .sc-root{padding:clamp(16px,3vh,40px);align-items:center;justify-content:center}
  .sc-root .sc-shell{--pad:clamp(14px,1.6vw,24px);
    width:min(1180px,100%);height:min(100%,940px);
    border-radius:24px;border:1px solid rgba(255,255,255,.09);
    box-shadow:0 40px 120px rgba(0,0,0,.80)}
  .sc-root .sc-headS{display:block}
  .sc-root .sc-main{flex-direction:row}
  .sc-root .sc-stagecol{flex:1 1 auto}
  .sc-root .sc-scrimTap{display:none}
  .sc-root .sc-side{position:static;flex:0 0 auto;width:clamp(300px,32%,400px);max-height:none;
    transform:none;pointer-events:auto;border-radius:0;border-top:none;
    border-left:1px solid rgba(255,255,255,.09);box-shadow:none;background:rgba(255,255,255,.015)}
  .sc-root .sc-side[data-full="true"]{width:clamp(340px,36%,460px)}
  .sc-root .sc-grab{display:none}
  .sc-root .sc-note{bottom:calc(var(--pad) + 90px)}
}
`;

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
  const [uploadErr,   setUploadErr]  = useState('');
  const [publishErr,  setPublishErr] = useState('');
  const [submitting,  setSubmitting] = useState(false);
  const [dragOver,    setDragOver]   = useState(false);
  const [panel,       setPanel]      = useState<'presets'|'style'|'text'|'effects'>('presets');
  const [pendingFile, setPendingFile] = useState<File|null>(null);   // kept for retry
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Frames ────────────────────────────────────────────────────────────────
  // Every frame is a complete draft. The live state above is always the active
  // frame; `frames` stores the rest. Each frame publishes through the existing
  // single-recent API, so the backend contract is unchanged.
  const frameSeq  = useRef(1);
  const [frames,    setFrames]    = useState<Frame[]>(() => [blankFrame('f0')]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);

  const activeId    = frames[activeIdx]?.id ?? 'f0';
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const snapshot = useCallback((): Frame => ({
    id: activeId, mediaMode, mediaUrl, localBlob, pendingFile, uploadErr,
    caption, subtitle, bg, fontId, fontSize, textColor, textAlign, textPos,
    imgFilter, vignette, grain, innerBorder,
  }), [activeId, mediaMode, mediaUrl, localBlob, pendingFile, uploadErr, caption, subtitle,
       bg, fontId, fontSize, textColor, textAlign, textPos, imgFilter, vignette, grain, innerBorder]);

  function restore(f: Frame) {
    setMediaMode(f.mediaMode); setMediaUrl(f.mediaUrl); setLocalBlob(f.localBlob);
    setPendingFile(f.pendingFile); setUploadErr(f.uploadErr);
    setCaption(f.caption); setSubtitle(f.subtitle); setBg(f.bg);
    setFontId(f.fontId); setFontSize(f.fontSize); setTextColor(f.textColor);
    setTextAlign(f.textAlign); setTextPos(f.textPos); setImgFilter(f.imgFilter);
    setVignette(f.vignette); setGrain(f.grain); setInnerBorder(f.innerBorder);
  }

  /** All frames with the active one refreshed from live state. */
  const allFrames = frames.map((f, i) => (i === activeIdx ? snapshot() : f));

  function gotoFrame(i: number) {
    if (i === activeIdx || !frames[i]) return;
    const fs = allFrames;
    setFrames(fs); restore(fs[i]); setActiveIdx(i);
  }
  function addFrame() {
    const nf = blankFrame(`f${frameSeq.current++}`);
    setFrames([...allFrames, nf]); restore(nf); setActiveIdx(allFrames.length);
    setTimeout(() => fileRef.current?.click(), 40);
  }
  function removeFrame(i: number) {
    if (frames.length <= 1) return;
    const fs = allFrames.filter((_, j) => j !== i);
    const next = Math.min(activeIdx > i ? activeIdx - 1 : activeIdx, fs.length - 1);
    setFrames(fs); restore(fs[next]); setActiveIdx(next);
  }

  /** Media fields land on the active frame, or on its stored copy if the user moved on. */
  function patchFrame(id: string, p: Partial<Frame>) {
    if (id === activeIdRef.current) {
      if (p.mediaMode   !== undefined) setMediaMode(p.mediaMode);
      if (p.mediaUrl    !== undefined) setMediaUrl(p.mediaUrl);
      if (p.localBlob   !== undefined) setLocalBlob(p.localBlob);
      if (p.pendingFile !== undefined) setPendingFile(p.pendingFile);
      if (p.uploadErr   !== undefined) setUploadErr(p.uploadErr);
    } else {
      setFrames(fs => fs.map(f => (f.id === id ? { ...f, ...p } : f)));
    }
  }

  // ── Upload — one implementation for every entry point ──────────────────────
  async function uploadFile(file: File, targetId: string = activeIdRef.current) {
    if (uploadingIds.includes(targetId)) return;              // no duplicate uploads
    const isVid = file.type.startsWith('video/');
    const blob  = URL.createObjectURL(file);
    patchFrame(targetId, {
      mediaMode: isVid ? 'video' : 'image',
      localBlob: blob, mediaUrl: null, pendingFile: file, uploadErr: '',
    });
    setUploadingIds(ids => [...ids, targetId]);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/recents/upload', { method:'POST', body:fd });
      if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to upload media' : 'Upload failed');
      const d = await res.json() as { url?: string; type?: string; error?: string };
      if (!d.url) throw new Error(d.error ?? 'Upload failed');
      patchFrame(targetId, { mediaUrl: d.url, localBlob: null, pendingFile: null, uploadErr: '' });
      URL.revokeObjectURL(blob);
    } catch (e) {
      // Keep the local preview and the file so the user can retry without re-picking.
      patchFrame(targetId, { uploadErr: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setUploadingIds(ids => ids.filter(x => x !== targetId));
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '';
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) uploadFile(f);
  }
  function pickMedia() { if (!uploading) fileRef.current?.click(); }
  function retryUpload() { if (pendingFile) uploadFile(pendingFile, activeId); }
  function applyPreset(p: typeof PRESETS[0]) {
    setBg({ id:p.id, label:p.label, value:p.bg, text:p.text });
    setTextColor(p.text); setFontId(p.font); setFontSize(p.size);
    setTextAlign(p.align); setTextPos(p.position);
    if (!caption) setCaption(p.sample);
    setMediaMode('text'); setPanel('text');
  }
  async function submit() {
    // Publish oldest-last so frame 1 ends up newest — the feed sorts newest first,
    // which lands the sequence back in the order the user arranged it.
    const queue = allFrames.filter(frameHasContent).reverse();
    if (!queue.length) return;
    setSubmitting(true); setPublishErr('');
    const created: Recent[] = [];
    try {
      for (const f of queue) {
        const res = await fetch('/api/recents', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            type: f.mediaMode, mediaUrl: f.mediaUrl ?? null,
            caption: f.caption||null,
            bgGradient: f.mediaMode==='text' ? f.bg.value : undefined,
            textColor: f.textColor, fontStyle:f.fontId, fontSize:f.fontSize,
            ctaLabel: ctaLabel||undefined, ctaUrl: ctaUrl||undefined,
            category, visibility, expiryHours: expiry,
          }),
        });
        if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to publish' : 'Publish failed');
        const d = await res.json() as { recent?: Recent };
        if (d.recent) created.push(d.recent);
      }
    } catch (e) {
      setPublishErr(e instanceof Error ? e.message : 'Publish failed');
    } finally { setSubmitting(false); }
    created.forEach(onCreated);   // parent closes the creator once these land
  }

  const uploading    = uploadingIds.includes(activeId);
  const anyUploading = uploadingIds.length > 0;
  const canPublish   = allFrames.some(frameHasContent);
  const publishCount = allFrames.filter(frameHasContent).length;
  const previewSrc   = localBlob ?? mediaUrl;
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

  // ── Story-editor UI state (view-only; no backend impact) ───────────────────
  const camRef  = useRef<HTMLInputElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [note,      setNote]      = useState<string|null>(null);

  const openTool = useCallback((p: 'presets'|'style'|'text'|'effects') => {
    setPanel(p); setPanelOpen(true);
  }, []);

  function showNote(msg: string) {
    setNote(msg);
    setTimeout(() => setNote(n => (n === msg ? null : n)), 2600);
  }

  // Tool buttons rendered over the canvas (mirrors the story-composer chrome)
  const TOOL_BTNS = [
    { id:'text'    as const, label:'Text',     node:<span className="sc-toolTxt">Aa</span> },
    { id:'presets' as const, label:'Stickers', node:(
      <svg viewBox="0 0 18 18" fill="none" width="100%" height="100%">
        <rect x="2.2" y="2.2" width="13.6" height="13.6" rx="3" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="6.2" cy="6.2" r="1.3" fill="currentColor"/>
        <path d="M3 13l3.5-3.5 2.6 2.6 2-2 3.9 3.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>) },
    { id:'style'   as const, label:'Draw',     node:(
      <svg viewBox="0 0 18 18" fill="none" width="100%" height="100%">
        <path d="M3 13.8c2.2-3.1 4.4-1.2 5.6-4.7C9.5 6.3 11.4 3 14.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M3 13.8c.7.9 1.8 1.2 2.6.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>) },
    { id:'effects' as const, label:'Effects',  node:<span className="sc-toolTxt">✦</span> },
  ];

  // ── Canvas (9:16, always) ──────────────────────────────────────────────────
  function renderCanvas() {
    return (
      <div className="sc-canvas" style={{ background: mediaMode === 'text' ? bg.value : '#060608' }}>

        {/* progress segments */}
        <div className="sc-prog">
          {[0,1,2,3,4,5,6,7].map(i => (
            <span key={i} style={{ background: i === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.26)' }} />
          ))}
        </div>

        {/* toolbar */}
        <div className="sc-cvTop">
          <button type="button" aria-label="Close" onClick={onClose} className="sc-tool">
            <svg viewBox="0 0 15 15" fill="none" width="100%" height="100%">
              <path d="M2.6 2.6l9.8 9.8M12.4 2.6l-9.8 9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="sc-cvTools">
            {TOOL_BTNS.map(t => (
              <button key={t.id} type="button" aria-label={t.label} title={t.label}
                onClick={() => openTool(t.id)}
                className="sc-tool" data-active={panel === t.id && panelOpen ? 'true' : 'false'}>
                {t.node}
              </button>
            ))}
            <button type="button" aria-label="More" title="More settings"
              onClick={() => { if (canPublish) setStep('publish'); else openTool('presets'); }}
              className="sc-tool"><span className="sc-toolTxt">…</span></button>
          </div>
        </div>

        {/* media */}
        {mediaMode === 'image' && previewSrc &&
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="" className="sc-media" style={{ filter: filterCss || undefined }} />}
        {mediaMode === 'video' && previewSrc &&
          <video src={previewSrc} autoPlay muted loop playsInline className="sc-media" style={{ filter: filterCss || undefined }} />}

        {/* overlays */}
        {(vignette || (mediaMode !== 'text' && previewSrc)) && (
          <div className="sc-scrim" style={{ background: vignette
            ? 'radial-gradient(ellipse at center,transparent 35%,rgba(0,0,0,0.75) 100%)'
            : 'linear-gradient(to top,rgba(0,0,0,0.70) 0%,transparent 55%)' }} />
        )}
        {grain && <div className="sc-grain" />}

        {/* caption */}
        {(caption || subtitle) && (
          <div className="sc-cap" style={{ textAlign: textAlign, ...textPosStyle }}>
            {caption && (
              <p style={{
                margin:0, fontSize:`${(fontSize * 0.26).toFixed(2)}cqw`, color:textColor,
                lineHeight:1.3, wordBreak:'break-word',
                textShadow: mediaMode !== 'text' && previewSrc ? '0 1px 10px rgba(0,0,0,0.60)' : 'none',
                ...font.style,
              }}>{caption}</p>
            )}
            {subtitle && (
              <p style={{
                margin:'0.7cqw 0 0', fontSize:`${(fontSize * 0.165).toFixed(2)}cqw`, color:textColor,
                opacity:0.6, lineHeight:1.4, wordBreak:'break-word',
                fontFamily:'system-ui', fontWeight:400,
              }}>{subtitle}</p>
            )}
          </div>
        )}

        {innerBorder && <div className="sc-inner" />}

        {/* empty state — the whole canvas opens the picker */}
        {!previewSrc && !caption && !uploading && (
          <button type="button" className="sc-empty" aria-label="Add your story" onClick={pickMedia}>
            <span className="sc-emptyPlus">+</span>
            <span className="sc-emptyT">Add your story</span>
            <span className="sc-emptyS">Add a photo, video or text</span>
          </button>
        )}

        {/* uploading — the chosen media stays visible underneath */}
        {uploading && (
          <div className="sc-uploading">
            <div className="sc-spin" />
            <span>Uploading…</span>
          </div>
        )}

        {/* failed upload — local preview kept, one tap retries the same file */}
        {!uploading && uploadErr && pendingFile && (
          <button type="button" className="sc-retry" onClick={retryUpload}>
            <span className="sc-retryIcon">
              <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
                <path d="M16 6.5A7 7 0 1 0 17 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M16.5 2.5v4.2h-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="sc-retryT">{uploadErr}</span>
            <span className="sc-retryS">Tap to retry</span>
          </button>
        )}
      </div>
    );
  }

  // ── Colour / filter strip (under the canvas, like the reference) ───────────
  function renderSwatches() {
    if (mediaMode !== 'text') {
      return (
        <div className="sc-strip rc-scrl" role="group" aria-label="Filters">
          {IMAGE_FILTERS.map(f => (
            <button key={f.id} type="button" className="sc-chip sc-tap"
              data-active={imgFilter === f.id} onClick={() => setImgFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      );
    }
    return (
      <div className="sc-strip rc-scrl" role="group" aria-label="Backgrounds">
        {BG_PRESETS.map(g => (
          <button key={g.id} type="button" aria-label={g.label} title={g.label}
            className="sc-dot sc-tap" data-active={bg.id === g.id}
            style={{ background:g.value }}
            onClick={() => { setBg(g); setTextColor(g.text); }} />
        ))}
        <span className="sc-dotSep" />
        <span className="sc-dotWrap">
          <span className="sc-dot sc-dotPick" style={{ background:textColor }} aria-hidden />
          <input type="color" aria-label="Text colour" value={textColor}
            onChange={e => setTextColor(e.target.value)} className="sc-colorInput" />
        </span>
      </div>
    );
  }

  // ── Frame rail ─────────────────────────────────────────────────────────────
  function renderRail() {
    return (
      <div className="sc-rail rc-scrl" role="group" aria-label="Story frames">
        {allFrames.map((f, i) => {
          const src = f.localBlob ?? f.mediaUrl;
          const active = i === activeIdx;
          return (
            <div key={f.id} className="sc-frameWrap">
              <button type="button" className="sc-frame sc-tap" data-active={active}
                onClick={() => gotoFrame(i)} title={`Frame ${i + 1}`}
                aria-label={`Frame ${i + 1}${active ? ' (editing)' : ''}`}
                style={{ background: f.mediaMode === 'text' ? f.bg.value : '#08080b' }}>
                {f.mediaMode === 'video' && src
                  ? <video src={src} muted playsInline preload="metadata" className="sc-frameMedia" />
                  : f.mediaMode === 'image' && src
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={src} alt="" className="sc-frameMedia" />
                  : f.caption
                    ? <span className="sc-frameTxt" style={{ color:f.textColor }}>{f.caption.slice(0, 16)}</span>
                    : <span className="sc-frameTxt" style={{ color:'rgba(255,255,255,0.28)' }}>empty</span>}
                {uploadingIds.includes(f.id) && (
                  <span className="sc-frameBusy"><span className="sc-spin sc-spinTiny" /></span>
                )}
                {!uploadingIds.includes(f.id) && f.uploadErr && <span className="sc-frameErr" />}
                <span className="sc-frameNo">{i + 1}</span>
              </button>
              {active && frames.length > 1 && (
                <button type="button" className="sc-frameDel" aria-label={`Remove frame ${i + 1}`}
                  title="Remove frame" onClick={() => removeFrame(i)}>×</button>
              )}
            </div>
          );
        })}
        <button type="button" className="sc-frame sc-frameAdd sc-tap"
          onClick={addFrame} aria-label="Add story frame" title="Add frame">+</button>
      </div>
    );
  }

  // ── Bottom nav ─────────────────────────────────────────────────────────────
  function renderNav() {
    const item = (key: string, label: string, icon: React.ReactNode, onClick: () => void) => (
      <button key={key} type="button" className="sc-navBtn sc-tap" onClick={onClick}>
        <span className="sc-navIcon">{icon}</span>
        <span className="sc-navLabel">{label}</span>
      </button>
    );
    return (
      <nav className="sc-nav" aria-label="Story sources">
        {item('gallery','Gallery',
          <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
            <rect x="2.5" y="3.5" width="15" height="13" rx="3" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="7" cy="8" r="1.4" fill="currentColor"/>
            <path d="M3 14l4-4 3 3 2.5-2.5L17 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>,
          pickMedia)}

        {item('camera','Camera',
          <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
            <path d="M3 6.5h2.6L7 4.5h6l1.4 2H17a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 17 16H3a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 3 6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.4"/>
          </svg>,
          () => camRef.current?.click())}

        <button type="button" className="sc-shutter sc-tap" aria-label="Capture"
          onClick={() => camRef.current?.click()}><span /></button>

        {item('layout','Layout',
          <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
            <rect x="2.5" y="2.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 2.5v15M2.5 10h7.5" stroke="currentColor" strokeWidth="1.4"/>
          </svg>,
          () => openTool('text'))}

        {item('music','Music',
          <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
            <path d="M7.5 14.5V5l8-1.5v9" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="5.6" cy="14.6" r="1.9" stroke="currentColor" strokeWidth="1.4"/>
            <circle cx="13.6" cy="12.6" r="1.9" stroke="currentColor" strokeWidth="1.4"/>
          </svg>,
          () => showNote('Audio tracks aren’t supported for recents yet — try Effects for a mood instead.'))}
      </nav>
    );
  }

  // ── Tool panel body (all existing controls, unchanged) ─────────────────────
  function renderPanelBody() {
    return (
      <div className="rc-scrl sc-panelBody" key={panel}>

        {/* ══ PRESETS ══ */}
        {panel==='presets'&&(
          <div style={{display:'flex',flexDirection:'column',gap:16}}>

            {/* Story type — text / photo / video */}
            <div className="sc-modeRow">
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
                  <button key={m} type="button" className="sc-modeBtn sc-tap"
                    onClick={()=>{ setMediaMode(m); if(m!=='text') setTimeout(()=>fileRef.current?.click(),50); }}
                    style={{
                      border: active ? `1px solid ${color}44` : '1px solid rgba(255,255,255,0.07)',
                      background: active ? `rgba(${color==='#a78bfa'?'167,139,250':color==='#60a5fa'?'96,165,250':'248,113,113'},0.10)` : 'rgba(255,255,255,0.03)',
                      color: active ? color : 'rgba(255,255,255,0.32)',
                      boxShadow: active ? `0 0 14px ${color}18, inset 0 1px 0 rgba(255,255,255,0.06)` : 'none',
                    }}>
                    {icon}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Upload zone */}
            <div
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={onDrop}
              onClick={pickMedia}
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

            {/* Template grid */}
            <div className="sc-tplGrid">
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
                  <p style={{
                    margin:0, textAlign:'center',
                    fontSize: Math.round(p.size * 0.32),
                    color:p.text, lineHeight:1.25,
                    fontWeight:p.font==='display'||p.font==='wide'?800:p.font==='light'?300:600,
                    fontFamily:p.font==='serif'?"Georgia,serif":p.font==='mono'?"'Courier New',monospace":'system-ui',
                    textShadow:'0 1px 4px rgba(0,0,0,0.40)',
                    wordBreak:'break-word',
                  }}>
                    {p.sample.slice(0,22)}
                  </p>
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
                <p className="sc-lbl">Background</p>
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
                <p className="sc-lbl">Text colour</p>
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
                <p className="sc-lbl">Media</p>
                <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}
                  onClick={pickMedia}
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
                <p className="sc-lbl">Filter</p>
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
                <p className="sc-lbl" style={{margin:0}}>Main text</p>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.25)'}}>{caption.length}/220</span>
              </div>
              <textarea className="rc-ta" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={220} rows={3}
                placeholder="What's on your mind?"
                style={{...inp,resize:'none',lineHeight:1.6,fontSize:14}}/>
            </div>
            <div>
              <p className="sc-lbl">Subtitle <span style={{textTransform:'none',fontSize:9,letterSpacing:'normal',color:'rgba(255,255,255,0.20)',fontWeight:400}}>optional</span></p>
              <input className="rc-inp" value={subtitle} onChange={e=>setSubtitle(e.target.value)} maxLength={100}
                placeholder="A supporting line…" style={inp}/>
            </div>
            <div>
              <p className="sc-lbl">Font</p>
              <div className="sc-fontGrid">
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
                <p className="sc-lbl" style={{margin:0}}>Size</p>
                <span style={{fontSize:10.5,fontWeight:600,color:'rgba(255,255,255,0.35)'}}>{fontSize}px</span>
              </div>
              <input type="range" min={12} max={52} value={fontSize} onChange={e=>setFontSize(+e.target.value)}/>
            </div>
            <div>
              <p className="sc-lbl">Alignment &amp; position</p>
              <div style={{display:'flex',gap:5,marginBottom:7}}>
                {([
                  {id:'left' as const,icon:<svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2h12M1 6h8M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
                  {id:'center' as const,icon:<svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2h12M3 6h8M2 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
                  {id:'right' as const,icon:<svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 2h12M5 6h8M3 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
                ]).map(({id,icon})=>(
                  <button key={id} type="button" className="rc-opt-btn sc-tap" onClick={()=>setTextAlign(id)}
                    style={{flex:1,padding:'9px',borderRadius:9,border:inB(textAlign===id),background:inBg(textAlign===id),
                      cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                      color:textAlign===id?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.32)'}}>
                    {icon}
                  </button>
                ))}
              </div>
              <div style={{display:'flex',gap:5}}>
                {([{id:'top' as const,l:'Top'},{id:'center' as const,l:'Middle'},{id:'bottom' as const,l:'Bottom'}]).map(({id,l})=>(
                  <button key={id} type="button" className="rc-opt-btn sc-tap" onClick={()=>setTextPos(id)}
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
            <p className="sc-lbl">Overlays &amp; Finish</p>
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
                <div style={{flex:1,minWidth:0}}>
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

            {mediaMode!=='text'&&previewSrc&&(
              <div style={{marginTop:4,padding:'13px 14px',borderRadius:13,
                background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:10,gap:8}}>
                  <p style={{margin:0,fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.72)'}}>Scrim darkness</p>
                  <span style={{fontSize:10.5,fontWeight:600,color:'rgba(255,255,255,0.35)'}}>for text legibility</span>
                </div>
                <input type="range" min={0} max={80} defaultValue={40}
                  style={{width:'100%',accentColor:'rgba(255,255,255,0.65)'}}/>
              </div>
            )}

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
    );
  }

  // ── Publish settings (all existing controls, unchanged) ────────────────────
  function renderPublish() {
    return (
      <div className="rc-scrl sc-panelBody" style={{display:'flex',flexDirection:'column',gap:20}}>

        <div>
          <p className="sc-lbl">Category</p>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {CATEGORIES.map(c=>{
              const badge=CAT_BADGE[c]??DEFAULT_BADGE;
              return (
                <button key={c} type="button" className="rc-cat-chip sc-tap" onClick={()=>setCategory(c)}
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
          <p className="sc-lbl">Visibility</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
            {([
              {id:'public'  as const,icon:<svg width="15" height="14" viewBox="0 0 16 14" fill="none"><circle cx="8" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1C8 1 6 3.5 6 7s2 6 2 6M8 1c0 0 2 2.5 2 6s-2 6-2 6M2 7h12" stroke="currentColor" strokeWidth="1.3"/></svg>,label:'Public',sub:'Visible to everyone'},
              {id:'private' as const,icon:<svg width="13" height="15" viewBox="0 0 12 15" fill="none"><rect x="1.5" y="6" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 6V4a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>,label:'Only me',sub:'Stays private'},
            ]).map(({id,icon,label,sub})=>(
              <button key={id} type="button" className="rc-opt-btn sc-tap" onClick={()=>setVisibility(id)}
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
          <p className="sc-lbl">Expires after</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {[6,12,24,48].map(h=>(
              <button key={h} type="button" className="rc-opt-btn sc-tap" onClick={()=>setExpiry(h)}
                style={{
                  flex:'1 1 64px', padding:'11px', borderRadius:12,
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
          <p className="sc-lbl">
            Call-to-action <span style={{textTransform:'none',fontSize:9,letterSpacing:'normal',color:'rgba(255,255,255,0.22)',fontWeight:400,marginLeft:4}}>optional</span>
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <input className="rc-inp" value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)} placeholder="Button label — e.g. Read more" maxLength={50} style={inp}/>
            <input className="rc-inp" type="url" value={ctaUrl} onChange={e=>setCtaUrl(e.target.value)} placeholder="https://…" style={inp}/>
            {ctaLabel&&ctaUrl&&(
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:11,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',flexWrap:'wrap'}}>
                <span style={{fontSize:11,color:'rgba(255,255,255,0.32)'}}>Preview</span>
                <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 13px',borderRadius:99,background:'rgba(255,255,255,0.90)',color:'#000',fontSize:12,fontWeight:700,maxWidth:'100%',overflow:'hidden'}}>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ctaLabel}</span>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{flexShrink:0}}><path d="M2 8L8 2M8 2H3.5M8 2v4.5" stroke="#000" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const sideOpen = step === 'publish' ? true : panelOpen;

  return createPortal(
    <div className="sc-root" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <style>{CREATOR_CSS}</style>

      <div className="sc-shell" onClick={e=>e.stopPropagation()}>

        {/* ══ HEADER ══ */}
        <div className="sc-head">
          {step==='publish' && (
            <button type="button" className="sc-headBtn sc-tap" aria-label="Back" onClick={()=>setStep('design')}>
              <svg width="12" height="11" viewBox="0 0 14 12" fill="none"><path d="M9 2L4 6l5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          <div className="sc-headTitle">
            <p className="sc-headT">{step==='design' ? 'New Recent' : 'Publish Settings'}</p>
            <p className="sc-headS">{step==='design' ? 'Design your story — template, media or text' : 'Set audience, expiry & call-to-action'}</p>
          </div>
          <div className="sc-steps" aria-hidden>
            {['design','publish'].map(s=>(
              <span key={s} data-active={step===s} />
            ))}
          </div>
          <button type="button" className="sc-headBtn sc-tap" aria-label="Close" onClick={onClose}>
            <svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M1 1l9 9M10 1 1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* ══ MAIN ══ */}
        <div className="sc-main">

          {/* ── Stage column ── */}
          <div className="sc-stagecol">
            <div className="sc-stage"
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={onDrop}
              data-drag={dragOver}>{renderCanvas()}</div>
            {renderSwatches()}
            {renderRail()}
            {renderNav()}
            {uploadErr && <p className="sc-err">{uploadErr}</p>}
          </div>

          {/* ── Drawer scrim (compact viewports only) ── */}
          <div className="sc-scrimTap" data-open={sideOpen} onClick={()=>{ if(step==='design') setPanelOpen(false); }} />

          {/* ── Tools / settings column ── */}
          <div className="sc-side" data-open={sideOpen} data-full={step==='publish'}>
            <button type="button" className="sc-grab" aria-label="Close panel"
              onClick={()=>{ step==='publish' ? setStep('design') : setPanelOpen(false); }}><span /></button>

            {step==='design' ? (
              <>
                <div className="sc-tabs" role="tablist">
                  {([
                    {id:'presets' as const, label:'Presets'},
                    {id:'style'   as const, label:'Style'},
                    {id:'text'    as const, label:'Text'},
                    {id:'effects' as const, label:'Effects'},
                  ]).map(t=>(
                    <button key={t.id} type="button" role="tab" aria-selected={panel===t.id}
                      className="sc-tab sc-tap" data-active={panel===t.id}
                      onClick={()=>setPanel(t.id)}>{t.label}</button>
                  ))}
                </div>
                {renderPanelBody()}
              </>
            ) : renderPublish()}
          </div>
        </div>

        {/* ══ FOOTER ══ */}
        <div className="sc-foot">
          <button type="button" className="sc-footBack sc-tap"
            onClick={step==='design'?onClose:()=>setStep('design')}
            aria-label={step==='design'?'Cancel':'Back'}>
            {step==='design'
              ? <svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M1 1l9 9M10 1 1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              : <svg width="12" height="11" viewBox="0 0 14 12" fill="none"><path d="M9 2L4 6l5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>

          {step==='design' ? (
            <button type="button" className="sc-cta" onClick={()=>setStep('publish')} disabled={!canPublish} data-on={canPublish}>
              {canPublish
                ? <>Next <svg width="13" height="12" viewBox="0 0 14 12" fill="none"><path d="M2 6h9M8 2l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></>
                : 'Add content to continue'}
            </button>
          ) : (
            <button type="button" className="sc-cta" onClick={submit} disabled={submitting||anyUploading} data-on={!submitting&&!anyUploading}>
              {anyUploading
                ? <><span className="sc-spin sc-spinSm" />Uploading…</>
                : submitting
                  ? <><span className="sc-spin sc-spinSm" />Publishing…</>
                  : <>Share{publishCount > 1 ? ` ${publishCount} frames` : ''} <svg width="13" height="12" viewBox="0 0 14 12" fill="none"><path d="M2 6h10M8 2l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></>}
            </button>
          )}
        </div>

        {publishErr && <div className="sc-note sc-noteErr" role="alert">{publishErr}</div>}

        {note && <div className="sc-note" role="status">{note}</div>}

        {/* hidden inputs — upload flow unchanged */}
        <input ref={fileRef} type="file" accept="image/*,video/*" style={{display:'none'}} onChange={onFile}/>
        <input ref={camRef} type="file" accept="image/*,video/*" capture="environment" style={{display:'none'}} onChange={onFile}/>
      </div>
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
      <div className="w-full min-w-0" style={{ display:'flex',gap:10,paddingBottom:4,overflowX:'auto',scrollbarWidth:'none' }}>
        <div aria-hidden className="shrink-0" style={{ width: 6, height: 1, marginRight: -10 }} />
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
      <div className="w-full min-w-0" style={{ width:'100%',animation:'rcBarIn 0.30s cubic-bezier(0.22,1,0.36,1) both' }}>
        {/* Label row */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
          <div style={{ display:'flex',alignItems:'center',gap:7 }}>
            <div style={{ width:1.5,height:12,borderRadius:99,background:'rgba(255,255,255,0.30)' }} />
            <span className="hp-sec" style={{ fontSize:11,fontWeight:500,color:'rgba(255,255,255,0.32)',letterSpacing:'0.01em' }}>Recents</span>
          </div>
          <a href="/recents" className="hp-sec" style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.32)',textDecoration:'none',padding:'3px 8px',borderRadius:7,border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)',transition:'all 140ms ease' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.60)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.14)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.32)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.07)';}}>
            View all
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H3.5M8 2v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>

        {/* Scroll row — leading 6px spacer (margin cancels flex gap): initial inset only; scrolls away */}
        <div ref={scrollRef} className="rc-scr w-full min-w-0" style={{ display:'flex',gap:10,overflowX:'auto',paddingBottom:4,scrollbarWidth:'none',WebkitOverflowScrolling:'touch' }}>
          <div aria-hidden className="shrink-0" style={{ width: 6, height: 1, marginRight: -10 }} />

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
