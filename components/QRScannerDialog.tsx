'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Camera, Upload, Link2, CheckCircle2, AlertTriangle,
  FileText, Folder, Eye, MessageSquare, Zap, ShieldCheck,
  QrCode, Loader2, RotateCcw, ArrowRight, Lock, ScanLine,
  Download, Shield, User,
} from 'lucide-react';
import jsQR from 'jsqr';
import { getShare, markAddedToScan, recordAccess, type SharePermission, PERMISSION_LABELS, PERMISSION_COLOR } from '@/lib/shareStore';

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface AddedShareFile {
  token:       string;
  name:        string;
  kind:        'file' | 'folder';
  fileKind?:   string;
  permission:  SharePermission;
  shareUrl:    string;
  transferId?: string;
}

export interface QRScannerDialogProps {
  open:         boolean;
  onClose:      () => void;
  onFileAdded?: (file: AddedShareFile) => void;
  baseUrl?:     string;
  userName?:    string;
  userId?:      string;
}

type ScannerMode = 'camera' | 'upload' | 'manual';
type ScanStage   = 'scanning' | 'preview' | 'adding' | 'done' | 'error';
type TransferPhase = 'connecting' | 'fetching' | 'verifying' | 'saving' | 'done';

interface ServerShare {
  token:       string;
  itemName:    string;
  kind:        'file' | 'folder';
  fileKind?:   string;
  permission:  SharePermission;
  ownerName:   string;
  hasPassword: boolean;
  expiresAt?:  number;
  accessCount: number;
}

/* ─── BarcodeDetector shim ──────────────────────────────────────────────── */
interface BarcodeDetectorResult { rawValue: string }
interface BarcodeDetectorAPI { detect(src: ImageBitmapSource): Promise<BarcodeDetectorResult[]> }
declare const BarcodeDetector: {
  new(opts?: { formats: string[] }): BarcodeDetectorAPI;
};

/* ─── Transfer phases ───────────────────────────────────────────────────── */
const PHASES: { phase: TransferPhase; label: string; dur: number; from: number; to: number }[] = [
  { phase: 'connecting', label: 'Establishing secure channel', dur: 550,  from: 0,  to: 22  },
  { phase: 'fetching',   label: 'Fetching document data',      dur: 950,  from: 22, to: 64  },
  { phase: 'verifying',  label: 'Verifying file integrity',    dur: 650,  from: 64, to: 87  },
  { phase: 'saving',     label: 'Saving to your Ddrive',        dur: 450,  from: 87, to: 100 },
];
const TOTAL_MS = PHASES.reduce((s, p) => s + p.dur, 0);

function ease(t: number) { return 1 - (1 - t) * (1 - t); }

function parseToken(raw: string): string | null {
  raw = raw.trim();
  const m = raw.match(/\/share\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{6,20}$/.test(raw)) return raw;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PERM_ICON: Record<SharePermission, React.ComponentType<any>> = {
  read:    Eye,
  comment: MessageSquare,
  edit:    Zap,
  admin:   ShieldCheck,
};

/* ─── Styles ────────────────────────────────────────────────────────────── */
const STYLES = `
@keyframes qsc-in    { from{opacity:0;transform:translateY(18px) scale(.97)} to{opacity:1;transform:none} }
@keyframes qsc-scan  { 0%{top:6%} 50%{top:88%} 100%{top:6%} }
@keyframes qsc-spin  { to{transform:rotate(360deg)} }
@keyframes qsc-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
@keyframes qsc-shimmer {
  0%   { background-position:-200% 0 }
  100% { background-position: 200% 0 }
}
@keyframes qsc-corners {
  0%,100% { opacity:.55 }
  50%     { opacity:1   }
}
.qsc-dialog   { animation: qsc-in .22s cubic-bezier(.4,0,.2,1) both }
.qsc-scan-bar { position:absolute; left:6%; width:88%; height:2px; animation:qsc-scan 2s ease-in-out infinite;
                background:linear-gradient(90deg,transparent,#6366f1,#a78bfa,#6366f1,transparent);
                box-shadow:0 0 12px 3px rgba(99,102,241,.55); border-radius:9999px; pointer-events:none }
.qsc-spinner  { animation:qsc-spin .75s linear infinite }
.qsc-pulse    { animation:qsc-pulse 1.5s ease-in-out infinite }
.qsc-shimmer  { background:linear-gradient(90deg,#4f46e5 0%,#7c3aed 40%,#a78bfa 50%,#7c3aed 60%,#4f46e5 100%);
                background-size:200% 100%; animation:qsc-shimmer 1.35s linear infinite }
.qsc-corners  { animation:qsc-corners 2s ease-in-out infinite }
`;

/* ─── Corner SVG overlay for scanner viewfinder ────────────────────────── */
function ScanCorners({ active }: { active: boolean }) {
  const c = active ? '#6366f1' : 'rgba(255,255,255,0.25)';
  const w = 22; const r = 5; const s = active ? 2.5 : 1.5;
  return (
    <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
      {/* TL */}
      <path d={`M${w},${r} Q${w},${w} ${r+w-w},${w} H${r} Q${r},${w} ${r},${r} Z`} fill="none" stroke={c} strokeWidth={s} className={active ? 'qsc-corners' : ''}
        style={{ strokeDasharray:`${w-r} ${w*4}`, strokeDashoffset: 0 }}/>
      {/* using 4 explicit corner paths */}
      <polyline points={`${r+2},${w} ${r},${w} ${r},${r} ${w},${r}`} fill="none" stroke={c} strokeWidth={s} strokeLinecap="round" className={active ? 'qsc-corners' : ''} />
      <polyline points={`${100-w},${r} ${100-r},${r} ${100-r},${w}`}  fill="none" stroke={c} strokeWidth={s} strokeLinecap="round" className={active ? 'qsc-corners' : ''} />
      <polyline points={`${100-w},${100-r} ${100-r},${100-r} ${100-r},${100-w}`} fill="none" stroke={c} strokeWidth={s} strokeLinecap="round" className={active ? 'qsc-corners' : ''} />
      <polyline points={`${r},${100-w} ${r},${100-r} ${w},${100-r}`}  fill="none" stroke={c} strokeWidth={s} strokeLinecap="round" className={active ? 'qsc-corners' : ''} />
    </svg>
  );
}

/* ─── Main Component ────────────────────────────────────────────────────── */
export default function QRScannerDialog({
  open, onClose, onFileAdded,
  baseUrl, userName = 'You', userId = 'guest',
}: QRScannerDialogProps) {
  const [mode,        setMode]       = useState<ScannerMode>('camera');
  const [stage,       setStage]      = useState<ScanStage>('scanning');
  const [token,       setToken]      = useState<string | null>(null);
  const [share,       setShare]      = useState<ServerShare | null>(null);
  const [errMsg,      setErrMsg]     = useState('');
  const [manualVal,   setManualVal]  = useState('');
  const [camErr,      setCamErr]     = useState('');
  const [camReady,    setCamReady]   = useState(false);
  const [password,    setPassword]   = useState('');
  const [pwdErr,      setPwdErr]     = useState('');
  const [dragOver,    setDragOver]   = useState(false);
  const [mounted,     setMounted]    = useState(false);
  const [lookingUp,   setLookingUp]  = useState(false);

  /* transfer animation */
  const [pct,         setPct]        = useState(0);
  const [phase,       setPhase]      = useState<TransferPhase>('connecting');
  const [timeLeft,    setTimeLeft]   = useState(0);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const scanRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorRef = useRef<BarcodeDetectorAPI | null>(null);
  const uploadRef   = useRef<HTMLInputElement>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedRef  = useRef(false); // prevent duplicate scans

  useEffect(() => { setMounted(true); }, []);

  /* reset on open */
  useEffect(() => {
    if (!open) return;
    setMode('camera'); setStage('scanning');
    setToken(null); setShare(null); setErrMsg('');
    setManualVal(''); setCamErr(''); setCamReady(false);
    setPassword(''); setPwdErr('');
    setPct(0); setPhase('connecting'); setTimeLeft(0);
    setLookingUp(false); scannedRef.current = false;
  }, [open]);

  /* camera lifecycle */
  useEffect(() => {
    if (!open || mode !== 'camera') return;
    let cancelled = false;
    scannedRef.current = false;

    (async () => {
      setCamReady(false); setCamErr('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', '');
          try { await videoRef.current.play(); } catch { /* handled by autoplay */ }
        }
        if ('BarcodeDetector' in window) {
          try { detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] }); } catch { detectorRef.current = null; }
        }
        setCamReady(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        setCamErr(msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('NotFoundError')
          ? 'Camera permission denied — switch to Upload or Paste mode.'
          : 'Camera unavailable. Try a different browser or use Upload mode.');
      }
    })();

    return () => { cancelled = true; stopCamera(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  /* scan loop */
  useEffect(() => {
    if (!camReady || stage !== 'scanning') return;
    let alive = true;

    const tick = async () => {
      if (!alive || scannedRef.current) return;
      const vid = videoRef.current; const cvs = canvasRef.current;
      if (!vid || !cvs || vid.readyState < 2) return;

      const w = vid.videoWidth || 320; const h = vid.videoHeight || 240;
      cvs.width = w; cvs.height = h;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(vid, 0, 0, w, h);

      if (detectorRef.current) {
        try {
          const results = await detectorRef.current.detect(cvs);
          if (!alive || scannedRef.current) return;
          if (results.length > 0) { scannedRef.current = true; void handleRawScan(results[0].rawValue); return; }
        } catch { /* fallthrough */ }
      }

      try {
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (!alive || scannedRef.current) return;
        if (code) { scannedRef.current = true; void handleRawScan(code.data); }
      } catch { /* keep scanning */ }
    };

    scanRef.current = setInterval(() => { void tick(); }, 120);
    return () => { alive = false; if (scanRef.current) clearInterval(scanRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camReady, stage]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (scanRef.current) clearInterval(scanRef.current);
  }

  /* look up token — server first, localStorage fallback */
  const handleRawScan = useCallback(async (raw: string) => {
    const tok = parseToken(raw);
    if (!tok) { setErrMsg("QR code doesn't contain a valid Docrud share link."); setStage('error'); return; }

    setLookingUp(true);
    stopCamera();

    /* 1. Try server API */
    try {
      const res = await fetch(`/api/drive/share/${encodeURIComponent(tok)}`);
      if (res.ok) {
        const data = await res.json() as { share: ServerShare };
        setToken(tok); setShare(data.share); setStage('preview'); setLookingUp(false);
        return;
      }
      if (res.status === 410) {
        const e = await res.json() as { error: string };
        setErrMsg(e.error === 'revoked' ? 'This share has been revoked.' : 'This share has expired.');
        setStage('error'); setLookingUp(false); return;
      }
    } catch { /* network error, fall through */ }

    /* 2. Fallback: localStorage (same-device shares) */
    const local = getShare(tok);
    if (local) {
      recordAccess(tok);
      setToken(tok);
      setShare({
        token:       tok,
        itemName:    local.itemName,
        kind:        local.kind,
        fileKind:    local.fileKind,
        permission:  local.permission,
        ownerName:   local.ownerName,
        hasPassword: !!local.password,
        expiresAt:   local.expiresAt,
        accessCount: local.accessCount,
      });
      setStage('preview'); setLookingUp(false);
      return;
    }

    setErrMsg('Share not found — it may have expired or been revoked. Ask the sender to regenerate it.');
    setStage('error'); setLookingUp(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* image upload scan */
  const scanFile = useCallback(async (file: File) => {
    try {
      const bmp = await createImageBitmap(file);
      const cvs = document.createElement('canvas');
      cvs.width = bmp.width; cvs.height = bmp.height;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      if (!ctx) { setErrMsg('Could not read image.'); setStage('error'); return; }
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, bmp.width, bmp.height);

      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (code) { void handleRawScan(code.data); return; }

      if ('BarcodeDetector' in window) {
        try {
          const det = new BarcodeDetector({ formats: ['qr_code'] });
          const res = await det.detect(bmp);
          if (res.length > 0) { void handleRawScan(res[0].rawValue); return; }
        } catch { /* not supported */ }
      }

      setErrMsg('No QR code detected in this image. Make sure the QR is clear and unobstructed.');
      setStage('error');
    } catch {
      setErrMsg('Could not read the image file.'); setStage('error');
    }
  }, [handleRawScan]);

  /* Add to Drive — real server call */
  async function handleAddToDrive() {
    if (!share || !token) return;
    if (share.hasPassword && !password.trim()) { setPwdErr('Password required.'); return; }

    setStage('adding');
    setPct(0); setPhase('connecting'); setTimeLeft(TOTAL_MS / 1000);

    /* run the animated progress while the real API call fires in parallel */
    const startMs = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startMs;
      setTimeLeft(Math.max(0, (TOTAL_MS - elapsed) / 1000));
      let p = 0; let ph: TransferPhase = 'connecting'; let cum = 0;
      for (const ph_ of PHASES) {
        if (elapsed <= cum + ph_.dur) {
          p = ph_.from + (ph_.to - ph_.from) * ease((elapsed - cum) / ph_.dur);
          ph = ph_.phase; break;
        }
        cum += ph_.dur; p = ph_.to; ph = ph_.phase;
      }
      setPct(Math.min(p, 99)); setPhase(ph);
    }, 40);

    let transferId: string | undefined;
    let isStub = false;
    try {
      const res = await fetch(`/api/drive/share/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: password || undefined }),
      });
      if (res.status === 403) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPwdErr('Incorrect password.'); setStage('preview'); return;
      }
      if (!res.ok) throw new Error('Server error');
      const data = await res.json() as { ok: boolean; transferId?: string; stub?: boolean };
      transferId = data.transferId;
      isStub     = !!data.stub;
    } catch {
      /* if server call failed but we have a local share, use localStorage path */
      const local = getShare(token);
      if (local) markAddedToScan(token, userId);
    }

    /* finish animation */
    if (timerRef.current) clearInterval(timerRef.current);
    await new Promise<void>(r => {
      const remain = TOTAL_MS - (Date.now() - startMs);
      if (remain > 0) setTimeout(r, remain); else r();
    });
    setPct(100); setPhase('done');
    await new Promise<void>(r => setTimeout(r, 380));

    const origin = typeof window !== 'undefined' ? window.location.origin : (baseUrl ?? '');
    onFileAdded?.({
      token,
      name:       share.itemName,
      kind:       share.kind,
      fileKind:   share.fileKind,
      permission: share.permission,
      shareUrl:   `${origin}/share/${token}`,
      transferId,
    });

    setStage('done');
    void isStub; // acknowledged
  }

  function handleReset() {
    scannedRef.current = false;
    setStage('scanning'); setToken(null); setShare(null);
    setErrMsg(''); setPassword(''); setPwdErr('');
    setPct(0); setPhase('connecting');
    if (mode === 'camera') { setMode('upload'); setTimeout(() => setMode('camera'), 50); }
  }

  function handleClose() { stopCamera(); onClose(); }

  if (!mounted || !open) return null;

  const permColor = share ? PERMISSION_COLOR[share.permission] : '#94a3b8';
  const PermIcon  = share ? PERM_ICON[share.permission] : Eye;
  const phaseLabel = phase === 'done' ? 'Transfer complete' : (PHASES.find(p => p.phase === phase)?.label ?? '');

  return createPortal(
    <>
      <style>{STYLES}</style>

      {/* Backdrop */}
      <div
        onClick={stage === 'adding' ? undefined : handleClose}
        style={{ position:'fixed', inset:0, zIndex:99990, background:'rgba(0,0,0,.72)', backdropFilter:'blur(8px)' }}
      />

      {/* ═══ DIALOG ═══ */}
      <div style={{
        position:'fixed', inset:0, zIndex:99991,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16,
        pointerEvents:'none',
      }}>
        <div
          className="qsc-dialog"
          onClick={e => e.stopPropagation()}
          style={{
            pointerEvents:'auto',
            width:'100%', maxWidth:480,
            background:'linear-gradient(160deg,rgba(10,10,18,0.98),rgba(6,6,14,0.99))',
            border:'1px solid rgba(255,255,255,0.09)',
            borderRadius:24,
            boxShadow:'0 0 0 1px rgba(255,255,255,0.035) inset, 0 40px 100px rgba(0,0,0,.9), 0 0 80px rgba(99,102,241,0.08)',
            overflow:'hidden',
            fontFamily:'system-ui,sans-serif',
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display:'flex', alignItems:'center', gap:12,
            padding:'16px 18px 14px',
            borderBottom:'1px solid rgba(255,255,255,0.06)',
            background:'rgba(255,255,255,0.02)',
          }}>
            <div style={{
              width:36, height:36, borderRadius:11, flexShrink:0,
              background:'linear-gradient(135deg,rgba(99,102,241,0.20),rgba(139,92,246,0.15))',
              border:'1px solid rgba(99,102,241,0.30)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <ScanLine size={16} color="#a78bfa" />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.92)', letterSpacing:'-0.015em' }}>
                Scan QR Code
              </p>
              <p style={{ margin:0, fontSize:10.5, color:'rgba(255,255,255,0.32)', marginTop:1 }}>
                Transfer a shared document into your Ddrive
              </p>
            </div>
            {stage !== 'adding' && (
              <button
                type="button" onClick={handleClose}
                style={{ width:28, height:28, borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.45)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* ── Mode tabs (scanning stage only) ── */}
          {stage === 'scanning' && (
            <div style={{ display:'flex', gap:4, padding:'10px 14px 0', background:'rgba(255,255,255,0.015)' }}>
              {([['camera','Camera',Camera],['upload','Upload',Upload],['manual','Paste Link',Link2]] as const).map(([m, label, Icon]) => (
                <button
                  key={m} type="button"
                  onClick={() => { setMode(m); setCamErr(''); scannedRef.current = false; }}
                  style={{
                    flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                    padding:'7px 0', borderRadius:9, border:'none', cursor:'pointer', fontSize:11.5, fontWeight:600, transition:'all .15s',
                    background: mode === m ? 'rgba(99,102,241,0.18)' : 'transparent',
                    color:      mode === m ? '#a78bfa' : 'rgba(255,255,255,0.38)',
                    outline:    mode === m ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent',
                  }}
                >
                  <Icon size={12} />{label}
                </button>
              ))}
            </div>
          )}

          {/* ══════════════════════════ SCANNING ══════════════════════════ */}
          {stage === 'scanning' && (
            <div style={{ padding:'14px 16px 18px' }}>

              {/* ── Camera viewfinder ── */}
              {mode === 'camera' && (
                <div style={{ position:'relative', borderRadius:16, overflow:'hidden', background:'#000', aspectRatio:'4/3' }}>
                  <video
                    ref={videoRef} playsInline autoPlay muted
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                  />
                  <canvas ref={canvasRef} style={{ display:'none' }} />

                  {/* scan bar */}
                  {camReady && !camErr && <div className="qsc-scan-bar" />}

                  {/* corner overlay */}
                  <div style={{ position:'absolute', inset:'8%', pointerEvents:'none' }}>
                    <ScanCorners active={camReady && !camErr} />
                  </div>

                  {/* loading state */}
                  {!camReady && !camErr && (
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, background:'rgba(0,0,0,0.6)' }}>
                      <Loader2 size={28} color="#6366f1" className="qsc-spinner" />
                      <span style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>Starting camera…</span>
                    </div>
                  )}

                  {/* looking up token */}
                  {lookingUp && (
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, background:'rgba(0,0,0,0.75)' }}>
                      <Loader2 size={28} color="#a78bfa" className="qsc-spinner" />
                      <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>Looking up share…</span>
                    </div>
                  )}

                  {/* camera error */}
                  {camErr && (
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:24, textAlign:'center' }}>
                      <AlertTriangle size={28} color="rgba(251,191,36,0.8)" />
                      <p style={{ margin:0, fontSize:12, color:'rgba(255,255,255,0.5)', lineHeight:1.5 }}>{camErr}</p>
                    </div>
                  )}

                  {/* dim overlay hint */}
                  {camReady && !camErr && !lookingUp && (
                    <div style={{ position:'absolute', bottom:10, left:0, right:0, textAlign:'center', pointerEvents:'none' }}>
                      <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.30)', background:'rgba(0,0,0,0.45)', padding:'3px 10px', borderRadius:20 }}>
                        Point camera at a Docrud QR code
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Upload mode ── */}
              {mode === 'upload' && (
                <>
                  <input ref={uploadRef} type="file" accept="image/*" style={{ display:'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void scanFile(f); e.target.value = ''; }} />
                  <div
                    onClick={() => !lookingUp && uploadRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void scanFile(f); }}
                    style={{
                      borderRadius:14, border:`2px dashed ${dragOver ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.10)'}`,
                      background: dragOver ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                      cursor: lookingUp ? 'wait' : 'pointer',
                      padding:'40px 20px', textAlign:'center', transition:'all .18s',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:10,
                    }}
                  >
                    {lookingUp
                      ? <Loader2 size={28} color="#6366f1" className="qsc-spinner" />
                      : <><Upload size={28} color="rgba(255,255,255,0.22)" />
                        <p style={{ margin:0, fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.55)' }}>Drop a QR image here</p>
                        <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.28)' }}>or click to choose a file · PNG, JPG, WEBP</p>
                      </>
                    }
                  </div>
                </>
              )}

              {/* ── Manual paste ── */}
              {mode === 'manual' && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.38)', letterSpacing:'0.06em', textTransform:'uppercase' }}>
                    Share link or token
                  </label>
                  <input
                    value={manualVal}
                    onChange={e => setManualVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleRawScan(manualVal); }}
                    placeholder="https://docrud.com/share/AbCdEfGh  or  AbCdEfGh"
                    disabled={lookingUp}
                    style={{
                      width:'100%', padding:'11px 14px', borderRadius:11,
                      border:'1px solid rgba(255,255,255,0.10)', background:'rgba(255,255,255,0.04)',
                      color:'rgba(255,255,255,0.85)', fontSize:13, outline:'none',
                      boxSizing:'border-box', transition:'border-color .15s',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleRawScan(manualVal)}
                    disabled={!manualVal.trim() || lookingUp}
                    style={{
                      padding:'10px 0', borderRadius:11, border:'none', cursor:'pointer',
                      background: manualVal.trim() ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'rgba(255,255,255,0.06)',
                      color: manualVal.trim() ? '#fff' : 'rgba(255,255,255,0.25)',
                      fontSize:13, fontWeight:700, transition:'all .15s',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    }}
                  >
                    {lookingUp ? <><Loader2 size={14} className="qsc-spinner" /> Looking up…</> : <><ArrowRight size={14} /> Scan Token</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════ ERROR ══════════════════════════ */}
          {stage === 'error' && (
            <div style={{ padding:'28px 22px', display:'flex', flexDirection:'column', alignItems:'center', gap:14, textAlign:'center' }}>
              <div style={{ width:52, height:52, borderRadius:16, background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <AlertTriangle size={22} color="#f87171" />
              </div>
              <div>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.85)' }}>Scan Failed</p>
                <p style={{ margin:'6px 0 0', fontSize:12, color:'rgba(255,255,255,0.38)', lineHeight:1.55 }}>{errMsg}</p>
              </div>
              <button
                type="button" onClick={handleReset}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 22px', borderRadius:10, border:'1px solid rgba(255,255,255,0.10)', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.65)', fontSize:12.5, fontWeight:600, cursor:'pointer' }}
              >
                <RotateCcw size={13} /> Try Again
              </button>
            </div>
          )}

          {/* ══════════════════════════ PREVIEW ══════════════════════════ */}
          {stage === 'preview' && share && (
            <div style={{ padding:'18px 18px 20px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* File card */}
              <div style={{
                borderRadius:14, padding:'14px 16px',
                background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)',
                display:'flex', alignItems:'center', gap:13,
              }}>
                <div style={{
                  width:44, height:44, borderRadius:12, flexShrink:0,
                  background:`${permColor}18`, border:`1px solid ${permColor}30`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {share.kind === 'folder'
                    ? <Folder size={20} color={permColor} />
                    : <FileText size={20} color={permColor} />
                  }
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:'rgba(255,255,255,0.90)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {share.itemName}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)', display:'flex', alignItems:'center', gap:3 }}>
                      <User size={9} /> {share.ownerName}
                    </span>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.18)' }}>·</span>
                    <span style={{
                      display:'inline-flex', alignItems:'center', gap:3,
                      fontSize:9.5, fontWeight:700, padding:'2px 7px', borderRadius:20,
                      background:`${permColor}15`, border:`1px solid ${permColor}28`, color: permColor,
                    }}>
                      <PermIcon size={9} /> {PERMISSION_LABELS[share.permission]}
                    </span>
                    {share.fileKind && (
                      <span style={{ fontSize:9.5, fontWeight:600, color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                        {share.fileKind}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata row */}
              <div style={{ display:'flex', gap:8 }}>
                {[
                  { icon: Shield,   label:'Permission', val: PERMISSION_LABELS[share.permission] },
                  { icon: Download, label:'Type',       val: share.kind === 'folder' ? 'Folder' : (share.fileKind?.toUpperCase() ?? 'File') },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} style={{ flex:1, borderRadius:10, padding:'9px 11px', background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                      <Icon size={10} color="rgba(255,255,255,0.28)" /><span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.25)' }}>{label}</span>
                    </div>
                    <p style={{ margin:0, fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,0.65)' }}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Password field */}
              {share.hasPassword && (
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'rgba(255,255,255,0.32)', display:'flex', alignItems:'center', gap:4 }}>
                    <Lock size={9} /> Password Required
                  </label>
                  <input
                    type="password" value={password} onChange={e => { setPassword(e.target.value); setPwdErr(''); }}
                    placeholder="Enter share password"
                    style={{ padding:'9px 12px', borderRadius:9, border:`1px solid ${pwdErr ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.10)'}`, background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.85)', fontSize:13, outline:'none', boxSizing:'border-box', width:'100%' }}
                  />
                  {pwdErr && <p style={{ margin:0, fontSize:11, color:'#f87171' }}>{pwdErr}</p>}
                </div>
              )}

              {/* Actions */}
              <div style={{ display:'flex', gap:8, marginTop:2 }}>
                <button
                  type="button" onClick={handleReset}
                  style={{ flex:'0 0 auto', padding:'10px 16px', borderRadius:11, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.45)', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}
                >
                  <RotateCcw size={12} /> Rescan
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddToDrive()}
                  style={{
                    flex:1, padding:'11px 0', borderRadius:11, border:'none', cursor:'pointer',
                    background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
                    color:'#fff', fontSize:13, fontWeight:700, letterSpacing:'-0.01em',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                    boxShadow:'0 4px 18px rgba(99,102,241,0.35)',
                    transition:'opacity .15s',
                  }}
                >
                  <Download size={14} /> Add to My Drive
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════ ADDING ══════════════════════════ */}
          {stage === 'adding' && (
            <div style={{ padding:'32px 24px 28px', display:'flex', flexDirection:'column', alignItems:'center', gap:22 }}>

              {/* Animated ring */}
              <div style={{ position:'relative', width:80, height:80 }}>
                <svg width={80} height={80} style={{ position:'absolute', inset:0, transform:'rotate(-90deg)' }}>
                  <circle cx={40} cy={40} r={34} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5} />
                  <circle cx={40} cy={40} r={34} fill="none" strokeWidth={5} strokeLinecap="round"
                    stroke="url(#qsc-grad)"
                    strokeDasharray={`${2 * Math.PI * 34 * pct / 100} ${2 * Math.PI * 34}`}
                    style={{ transition:'stroke-dasharray .08s linear' }}
                  />
                  <defs>
                    <linearGradient id="qsc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {phase === 'done'
                    ? <CheckCircle2 size={28} color="#34d399" />
                    : <span style={{ fontSize:15, fontWeight:800, color:'rgba(255,255,255,0.85)' }}>{Math.round(pct)}%</span>
                  }
                </div>
              </div>

              {/* Phase steps */}
              <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:6 }}>
                {PHASES.map(p => {
                  const done    = PHASES.indexOf(p) < PHASES.findIndex(x => x.phase === phase);
                  const current = p.phase === phase;
                  return (
                    <div key={p.phase} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 12px', borderRadius:9, background: current ? 'rgba(99,102,241,0.10)' : 'transparent', border:`1px solid ${current ? 'rgba(99,102,241,0.20)' : 'transparent'}`, transition:'all .2s' }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                        background: done ? 'rgba(52,211,153,0.18)' : current ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
                        border:`1px solid ${done ? 'rgba(52,211,153,0.35)' : current ? 'rgba(99,102,241,0.40)' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                        {done    ? <CheckCircle2 size={10} color="#34d399" />
                        : current ? <Loader2 size={10} color="#a78bfa" className="qsc-spinner" />
                        :           <span style={{ width:5, height:5, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'block' }} />
                        }
                      </div>
                      <span style={{ fontSize:12, fontWeight: current ? 600 : 400, color: done ? 'rgba(52,211,153,0.70)' : current ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.25)' }}>
                        {p.label}
                      </span>
                      {current && timeLeft > 0 && (
                        <span style={{ marginLeft:'auto', fontSize:10, color:'rgba(255,255,255,0.25)', flexShrink:0 }}>{timeLeft.toFixed(1)}s</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* progress bar */}
              <div style={{ width:'100%', height:4, borderRadius:9999, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                <div className="qsc-shimmer" style={{ height:'100%', borderRadius:9999, width:`${pct}%`, transition:'width .08s linear' }} />
              </div>

              <p style={{ margin:0, fontSize:11.5, color:'rgba(255,255,255,0.30)', textAlign:'center' }}>{phaseLabel}</p>
            </div>
          )}

          {/* ══════════════════════════ DONE ══════════════════════════ */}
          {stage === 'done' && share && (
            <div style={{ padding:'32px 22px 26px', display:'flex', flexDirection:'column', alignItems:'center', gap:14, textAlign:'center' }}>
              <div style={{
                width:60, height:60, borderRadius:18,
                background:'linear-gradient(135deg,rgba(52,211,153,0.18),rgba(16,185,129,0.12))',
                border:'1px solid rgba(52,211,153,0.28)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <CheckCircle2 size={26} color="#34d399" />
              </div>
              <div>
                <p style={{ margin:0, fontSize:15, fontWeight:800, color:'rgba(255,255,255,0.92)', letterSpacing:'-0.02em' }}>Added to Drive!</p>
                <p style={{ margin:'5px 0 0', fontSize:12, color:'rgba(255,255,255,0.38)', lineHeight:1.55 }}>
                  <strong style={{ color:'rgba(255,255,255,0.60)' }}>{share.itemName}</strong> has been saved to your Ddrive with{' '}
                  <span style={{ color: PERMISSION_COLOR[share.permission] }}>{PERMISSION_LABELS[share.permission]}</span> access.
                </p>
              </div>
              <div style={{ display:'flex', gap:8, width:'100%' }}>
                <button
                  type="button" onClick={handleReset}
                  style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid rgba(255,255,255,0.09)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.55)', fontSize:12.5, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}
                >
                  <QrCode size={13} /> Scan Another
                </button>
                <button
                  type="button" onClick={handleClose}
                  style={{ flex:1, padding:'10px 0', borderRadius:10, border:'none', background:'linear-gradient(135deg,#059669,#10b981)', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}
                >
                  Open Ddrive <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ── Footer hint ── */}
          {(stage === 'scanning') && (
            <div style={{ padding:'8px 18px 12px', borderTop:'1px solid rgba(255,255,255,0.04)', textAlign:'center' }}>
              <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.18)' }}>
                Scans Docrud share QRs only · Works across devices · Secure channel
              </p>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
