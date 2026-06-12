'use client';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, QrCode, Link2, Copy, Check, Shield, Clock,
  Key, Trash2, Users, Eye, MessageSquare, PenLine,
  Crown, Download, RotateCcw, ExternalLink, Zap,
  ChevronDown, Globe, Lock, Plus,
} from 'lucide-react';
import {
  createShare, listSharesForItem, revokeShare, formatExpiry,
  PERMISSION_LABELS, PERMISSION_DESCRIPTIONS, PERMISSION_COLOR,
  type SharePermission, type ShareableKind, type ShareRecord,
} from '@/lib/shareStore';

/* ─── Props ──────────────────────────────────────────────────────────────── */

export interface QRShareTarget {
  id:       string;
  name:     string;
  kind:     ShareableKind;
  fileKind?: string;
}

export interface QRShareDialogProps {
  open:       boolean;
  onClose:    () => void;
  target:     QRShareTarget | null;
  /** Base URL for share links — defaults to window.location.origin */
  baseUrl?:   string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const PERM_ICONS: Record<SharePermission, React.ComponentType<any>> = {
  read:    Eye,
  comment: MessageSquare,
  edit:    PenLine,
  admin:   Crown,
};

const EXPIRY_OPTIONS = [
  { label: '1 hour',   ms: 3_600_000 },
  { label: '24 hours', ms: 86_400_000 },
  { label: '7 days',   ms: 604_800_000 },
  { label: '30 days',  ms: 2_592_000_000 },
  { label: 'No expiry', ms: 0 },
];

function buildShareUrl(token: string, base: string): string {
  return `${base}/share/${token}`;
}

function qrSrc(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&color=ffffff&bgcolor=0a0a12&data=${encodeURIComponent(url)}`;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function QRShareDialog({ open, onClose, target, baseUrl }: QRShareDialogProps) {
  const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');

  /* state */
  const [permission,  setPermission]  = useState<SharePermission>('read');
  const [expiryMs,    setExpiryMs]    = useState<number>(86_400_000);
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [activeShare, setActiveShare] = useState<ShareRecord | null>(null);
  const [existingShares, setExistingShares] = useState<ShareRecord[]>([]);
  const [activeTab,   setActiveTab]   = useState<'create' | 'existing'>('create');
  const [generating,  setGenerating]  = useState(false);
  const [qrLoaded,    setQrLoaded]    = useState(false);
  const [expiryOpen,  setExpiryOpen]  = useState(false);

  /* Reset on open */
  useEffect(() => {
    if (!open || !target) return;
    setPermission('read'); setExpiryMs(86_400_000); setPassword('');
    setActiveShare(null); setQrLoaded(false); setActiveTab('create');
    setExistingShares(listSharesForItem(target.id));
  }, [open, target]);

  /* keyboard */
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);

  const activeUrl = activeShare ? buildShareUrl(activeShare.token, base) : null;

  const handleGenerate = useCallback(() => {
    if (!target) return;
    setGenerating(true); setQrLoaded(false);
    setTimeout(async () => {
      const rec = createShare(
        target.kind, target.id, target.name, target.fileKind,
        { permission, expiresIn: expiryMs || undefined, password: password || undefined },
      );
      setActiveShare(rec);
      setExistingShares(listSharesForItem(target.id));
      setGenerating(false);
      /* persist to server so other devices can scan it */
      try {
        await fetch('/api/drive/share', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token:      rec.token,
            itemId:     rec.itemId,
            itemName:   rec.itemName,
            kind:       rec.kind,
            fileKind:   rec.fileKind,
            permission: rec.permission,
            password:   rec.password,
            expiresAt:  rec.expiresAt,
            dataUrl:    rec.previewDataUrl,
          }),
        });
      } catch { /* non-fatal — local share still works */ }
    }, 320);
  }, [target, permission, expiryMs, password]);

  const handleCopy = useCallback(() => {
    if (!activeUrl) return;
    navigator.clipboard.writeText(activeUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }, [activeUrl]);

  const handleDownloadQR = useCallback(() => {
    if (!activeShare || !base) return;
    const url = qrSrc(buildShareUrl(activeShare.token, base));
    const a = document.createElement('a');
    a.href = url; a.download = `qr-${activeShare.token}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }, [activeShare, base]);

  const handleRevoke = useCallback((token: string) => {
    revokeShare(token);
    if (activeShare?.token === token) setActiveShare(null);
    if (target) setExistingShares(listSharesForItem(target.id));
  }, [activeShare, target]);

  const expiryLabel = EXPIRY_OPTIONS.find(e => e.ms === expiryMs)?.label ?? 'Custom';

  if (!open || !target || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{QRS_STYLES}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2147483660, background:'rgba(0,0,0,0.80)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)' }} />

      {/* Panel */}
      <div style={{ position:'fixed', inset:0, zIndex:2147483661, display:'flex', alignItems:'center', justifyContent:'center', padding:16, pointerEvents:'none' }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            pointerEvents:'auto', width:'100%', maxWidth:560,
            background:'rgba(8,8,13,0.98)', border:'1px solid rgba(255,255,255,0.07)',
            borderRadius:22, boxShadow:'0 24px 80px rgba(0,0,0,0.88)',
            overflow:'hidden', animation:'qrs-in 0.24s cubic-bezier(0.22,1,0.36,1) both',
          }}
        >
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'16px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width:34, height:34, borderRadius:10, background:'rgba(167,139,250,0.14)', border:'1px solid rgba(167,139,250,0.28)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <QrCode size={16} color="#a78bfa" />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.92)', letterSpacing:'-0.015em' }}>Share via QR</p>
              <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {target.name}
              </p>
            </div>
            <button type="button" onClick={onClose} style={iconBtn}>
              <X size={13} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', padding:'10px 18px 0', gap:4 }}>
            {(['create', 'existing'] as const).map(t => (
              <button key={t} type="button" onClick={() => setActiveTab(t)}
                style={{
                  padding:'6px 14px', borderRadius:9, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                  background: activeTab===t ? 'rgba(167,139,250,0.15)' : 'transparent',
                  color: activeTab===t ? '#c4b5fd' : 'rgba(255,255,255,0.38)',
                  transition:'background 0.12s,color 0.12s',
                }}>
                {t === 'create' ? 'New Share' : `Active (${existingShares.length})`}
              </button>
            ))}
          </div>

          {/* ── CREATE TAB ── */}
          {activeTab === 'create' && (
            <div style={{ padding:'16px 18px 20px', display:'flex', flexDirection:'column', gap:16 }}>

              {/* Permission selector */}
              <div>
                <p style={label}>Permission Level</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {(['read','comment','edit','admin'] as SharePermission[]).map(p => {
                    const Icon = PERM_ICONS[p];
                    const color = PERMISSION_COLOR[p];
                    const active = permission === p;
                    return (
                      <button key={p} type="button" onClick={() => setPermission(p)}
                        style={{
                          display:'flex', alignItems:'flex-start', gap:9, padding:'10px 12px',
                          borderRadius:12, border:`1px solid ${active ? `${color}50` : 'rgba(255,255,255,0.07)'}`,
                          background: active ? `${color}12` : 'rgba(255,255,255,0.02)',
                          cursor:'pointer', textAlign:'left', transition:'border-color 0.12s,background 0.12s',
                        }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:`${color}1A`, border:`1px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                          <Icon size={13} color={color} />
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:12, fontWeight:700, color: active ? '#fff' : 'rgba(255,255,255,0.75)' }}>{PERMISSION_LABELS[p]}</p>
                          <p style={{ margin:'2px 0 0', fontSize:10, color:'rgba(255,255,255,0.38)', lineHeight:1.4 }}>{PERMISSION_DESCRIPTIONS[p]}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Collab notice */}
              {permission === 'edit' && (
                <div style={{ display:'flex', gap:10, padding:'10px 13px', background:'rgba(52,211,153,0.07)', border:'1px solid rgba(52,211,153,0.18)', borderRadius:11 }}>
                  <Zap size={13} color="#34d399" style={{ flexShrink:0, marginTop:1 }} />
                  <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.72)', lineHeight:1.5 }}>
                    <strong style={{ color:'#34d399' }}>Real-time collaboration enabled.</strong> When the recipient scans this QR, a live editing session opens automatically — both users see changes instantly.
                  </p>
                </div>
              )}

              {/* Expiry + password row */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* Expiry */}
                <div style={{ position:'relative' }}>
                  <p style={label}>Expires</p>
                  <button type="button" onClick={() => setExpiryOpen(v => !v)}
                    style={{ ...fieldRow, justifyContent:'space-between' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <Clock size={12} color="rgba(255,255,255,0.45)" />
                      <span style={{ fontSize:12, color:'rgba(255,255,255,0.75)' }}>{expiryLabel}</span>
                    </span>
                    <ChevronDown size={11} style={{ color:'rgba(255,255,255,0.35)', transform: expiryOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }} />
                  </button>
                  {expiryOpen && (
                    <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:4, background:'rgba(8,8,13,0.98)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:11, overflow:'hidden', zIndex:10, boxShadow:'0 8px 30px rgba(0,0,0,0.70)' }}>
                      {EXPIRY_OPTIONS.map(opt => (
                        <button key={opt.label} type="button" onClick={() => { setExpiryMs(opt.ms); setExpiryOpen(false); }}
                          style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', width:'100%', border:'none', background: expiryMs===opt.ms ? 'rgba(167,139,250,0.12)' : 'transparent', cursor:'pointer', textAlign:'left', transition:'background 0.09s' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.05)')}
                          onMouseLeave={e=>(e.currentTarget.style.background=expiryMs===opt.ms?'rgba(167,139,250,0.12)':'transparent')}>
                          {expiryMs===opt.ms && <Check size={11} color="#a78bfa" />}
                          <span style={{ fontSize:12, color:'rgba(255,255,255,0.80)' }}>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Password */}
                <div>
                  <p style={label}>Password <span style={{ fontWeight:400, opacity:0.5 }}>(optional)</span></p>
                  <div style={{ ...fieldRow }}>
                    <Key size={12} color="rgba(255,255,255,0.40)" style={{ flexShrink:0 }} />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Optional password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ flex:1, border:'none', background:'transparent', outline:'none', fontSize:12, color:'rgba(255,255,255,0.80)', caretColor:'#a78bfa' }}
                    />
                    {password && (
                      <button type="button" onClick={() => setShowPwd(v => !v)} style={{ border:'none', background:'transparent', cursor:'pointer', color:'rgba(255,255,255,0.35)', padding:0 }}>
                        <Eye size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Generate CTA */}
              {!activeShare && (
                <button type="button" onClick={handleGenerate} disabled={generating}
                  style={{
                    width:'100%', height:42, borderRadius:13, border:'none',
                    background: generating ? 'rgba(167,139,250,0.08)' : 'rgba(167,139,250,0.20)',
                    cursor: generating ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    transition:'background 0.15s',
                  }}>
                  {generating
                    ? <><div style={{ width:14, height:14, border:'2px solid rgba(167,139,250,0.25)', borderTopColor:'#a78bfa', borderRadius:'50%', animation:'qrs-spin 0.7s linear infinite' }} /><span style={{ fontSize:13, fontWeight:700, color:'#a78bfa' }}>Generating…</span></>
                    : <><QrCode size={14} color="#a78bfa" /><span style={{ fontSize:13, fontWeight:700, color:'#c4b5fd' }}>Generate QR Code</span></>
                  }
                </button>
              )}

              {/* ── Active QR result ── */}
              {activeShare && (
                <div style={{ animation:'qrs-in 0.22s ease both' }}>
                  <div style={{ display:'flex', gap:18, alignItems:'flex-start' }}>
                    {/* QR image */}
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <div style={{ width:160, height:160, borderRadius:16, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                        {!qrLoaded && (
                          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(8,8,13,0.90)' }}>
                            <div style={{ width:18, height:18, border:'2px solid rgba(167,139,250,0.25)', borderTopColor:'#a78bfa', borderRadius:'50%', animation:'qrs-spin 0.7s linear infinite' }} />
                          </div>
                        )}
                        <img
                          src={qrSrc(buildShareUrl(activeShare.token, base))}
                          alt="QR code"
                          width={160} height={160}
                          style={{ display: qrLoaded ? 'block' : 'none', borderRadius:14 }}
                          onLoad={() => setQrLoaded(true)}
                          onError={() => setQrLoaded(true)}
                        />
                      </div>
                      {/* Permission badge overlay */}
                      <div style={{
                        position:'absolute', bottom:-6, left:'50%', transform:'translateX(-50%)',
                        padding:'2px 8px', borderRadius:99,
                        background:`${PERMISSION_COLOR[activeShare.permission]}22`,
                        border:`1px solid ${PERMISSION_COLOR[activeShare.permission]}44`,
                        fontSize:9.5, fontWeight:700, color:PERMISSION_COLOR[activeShare.permission],
                        whiteSpace:'nowrap',
                      }}>
                        {PERMISSION_LABELS[activeShare.permission]}
                      </div>
                    </div>

                    {/* Share details */}
                    <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:9 }}>
                      <div style={{ padding:'7px 10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
                        <Link2 size={11} color="rgba(255,255,255,0.40)" style={{ flexShrink:0 }} />
                        <span style={{ flex:1, fontSize:10.5, color:'rgba(255,255,255,0.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>
                          /share/{activeShare.token}
                        </span>
                        <button type="button" onClick={handleCopy}
                          style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:7, border:`1px solid ${copied ? 'rgba(52,211,153,0.30)' : 'rgba(255,255,255,0.10)'}`, background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)', cursor:'pointer', flexShrink:0 }}>
                          {copied ? <Check size={10} color="#34d399" /> : <Copy size={10} color="rgba(255,255,255,0.50)" />}
                          <span style={{ fontSize:10, fontWeight:700, color: copied ? '#34d399' : 'rgba(255,255,255,0.55)' }}>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>

                      {/* Meta */}
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        {[
                          { icon: Clock,  val: formatExpiry(activeShare) },
                          { icon: Shield, val: activeShare.password ? 'Password protected' : 'No password' },
                          { icon: Users,  val: `${activeShare.addedBy.length} added to Ddrive` },
                        ].map(({ icon: Icon, val }) => (
                          <div key={val} style={{ display:'flex', alignItems:'center', gap:7 }}>
                            <Icon size={11} color="rgba(255,255,255,0.30)" />
                            <span style={{ fontSize:11, color:'rgba(255,255,255,0.50)' }}>{val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div style={{ display:'flex', gap:6, marginTop:2 }}>
                        <button type="button" onClick={handleDownloadQR}
                          style={{ flex:1, ...actionBtn }}>
                          <Download size={11} /><span>Save QR</span>
                        </button>
                        <button type="button" onClick={() => handleRevoke(activeShare.token)}
                          style={{ flex:1, ...actionBtn, borderColor:'rgba(248,113,113,0.22)', color:'rgba(248,113,113,0.70)' }}>
                          <Trash2 size={11} /><span>Revoke</span>
                        </button>
                      </div>

                      {/* New share button */}
                      <button type="button" onClick={() => { setActiveShare(null); setQrLoaded(false); }}
                        style={{ display:'flex', alignItems:'center', gap:6, border:'none', background:'transparent', cursor:'pointer', color:'rgba(255,255,255,0.35)', fontSize:11, padding:0, textAlign:'left' }}>
                        <Plus size={11} />Create another share
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── EXISTING SHARES TAB ── */}
          {activeTab === 'existing' && (
            <div style={{ padding:'14px 18px 20px' }}>
              {existingShares.length === 0 ? (
                <div style={{ padding:'32px 0', textAlign:'center' }}>
                  <QrCode size={32} color="rgba(255,255,255,0.12)" style={{ margin:'0 auto 10px' }} />
                  <p style={{ margin:0, fontSize:13, color:'rgba(255,255,255,0.38)' }}>No active shares yet</p>
                  <p style={{ margin:'4px 0 0', fontSize:11, color:'rgba(255,255,255,0.24)' }}>Create a QR share using the "New Share" tab</p>
                </div>
              ) : existingShares.map(rec => {
                const color = PERMISSION_COLOR[rec.permission];
                const Icon  = PERM_ICONS[rec.permission];
                return (
                  <div key={rec.token} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:`${color}14`, border:`1px solid ${color}28`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon size={15} color={color} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.85)' }}>{PERMISSION_LABELS[rec.permission]}</span>
                        <span style={{ padding:'1.5px 6px', borderRadius:5, background:`${color}14`, border:`1px solid ${color}25`, fontSize:9, fontWeight:700, color }}>
                          {rec.accessCount} views
                        </span>
                      </div>
                      <p style={{ margin:'2px 0 0', fontSize:10, color:'rgba(255,255,255,0.35)', fontFamily:'monospace' }}>
                        /share/{rec.token} · {formatExpiry(rec)}
                      </p>
                    </div>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(buildShareUrl(rec.token, base)); }}
                      style={{ ...iconBtn }}>
                      <Copy size={12} />
                    </button>
                    <button type="button" onClick={() => handleRevoke(rec.token)}
                      style={{ ...iconBtn, color:'rgba(248,113,113,0.60)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

/* ─── Style helpers ──────────────────────────────────────────────────────── */

const iconBtn: React.CSSProperties = {
  width:28, height:28, borderRadius:8,
  border:'1px solid rgba(255,255,255,0.08)',
  background:'rgba(255,255,255,0.035)',
  display:'flex', alignItems:'center', justifyContent:'center',
  color:'rgba(255,255,255,0.55)', cursor:'pointer',
  transition:'background 0.10s',
};

const actionBtn: React.CSSProperties = {
  display:'flex', alignItems:'center', justifyContent:'center', gap:5,
  padding:'6px 0', borderRadius:9,
  border:'1px solid rgba(255,255,255,0.09)',
  background:'rgba(255,255,255,0.04)',
  cursor:'pointer', fontSize:11, fontWeight:600,
  color:'rgba(255,255,255,0.65)',
  transition:'background 0.10s',
};

const label: React.CSSProperties = {
  margin:'0 0 6px', fontSize:10, fontWeight:700,
  color:'rgba(255,255,255,0.35)', letterSpacing:'0.07em', textTransform:'uppercase',
};

const fieldRow: React.CSSProperties = {
  display:'flex', alignItems:'center', gap:8, height:36,
  background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)',
  borderRadius:10, padding:'0 11px', width:'100%', cursor:'text',
};

const QRS_STYLES = `
@keyframes qrs-in   { from{opacity:0;transform:translateY(14px) scale(0.97)} to{opacity:1;transform:none} }
@keyframes qrs-spin { to{transform:rotate(360deg)} }
`;
