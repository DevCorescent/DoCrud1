'use client';

/**
 * ShareTokenClient — client-side share landing page.
 *
 * Validates a share token from shareStore (localStorage).
 * Shows file info, permission badge, optional password gate,
 * and CTAs:
 *   • Open in Drive   — navigates to /  (drive opens the file via handoff)
 *   • Download        — for read-only shares with a previewDataUrl
 *   • Join Live Edit  — for edit/admin, connects to collab session
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Folder, Eye, MessageSquare, Zap, ShieldCheck,
  Lock, CheckCircle2, AlertTriangle, Users, Download,
  ExternalLink, Loader2, ArrowLeft,
} from 'lucide-react';
import {
  getShare, recordAccess, markAddedToScan, formatExpiry,
  type ShareRecord, type SharePermission,
  PERMISSION_LABELS, PERMISSION_DESCRIPTIONS, PERMISSION_COLOR,
} from '@/lib/shareStore';
import { useCollabSession, avatarInitials } from '@/lib/collabSession';

/* ─── Permission icon map ─────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PERM_ICONS: Record<SharePermission, React.ComponentType<any>> = {
  read:    Eye,
  comment: MessageSquare,
  edit:    Zap,
  admin:   ShieldCheck,
};

/* ─── Types ───────────────────────────────────────────────────────────────── */

type PageStage = 'loading' | 'locked' | 'ready' | 'invalid' | 'expired' | 'added';

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function ShareTokenClient({ token }: { token: string }) {
  const router = useRouter();

  const [stage,       setStage]      = useState<PageStage>('loading');
  const [share,       setShare]      = useState<ShareRecord | null>(null);
  const [password,    setPassword]   = useState('');
  const [pwdError,    setPwdError]   = useState('');
  const [unlocked,    setUnlocked]   = useState(false);
  const [joinCollab,  setJoinCollab] = useState(false);
  const [addingMsg,   setAddingMsg]  = useState('');

  /* collab hook — activates only when user clicks "Join Live Edit" */
  const collabToken = joinCollab ? token : null;
  const collab      = useCollabSession(collabToken, 'Guest');

  /* ── load share on mount ── */
  useEffect(() => {
    // tiny delay so localStorage is available after hydration
    const t = setTimeout(() => {
      const rec = getShare(token);
      if (!rec) {
        setStage('invalid');
        return;
      }
      if (rec.expiresAt && Date.now() > rec.expiresAt) {
        setStage('expired');
        return;
      }
      recordAccess(token);
      setShare(rec);
      if (rec.password) {
        setStage('locked');
      } else {
        setUnlocked(true);
        setStage('ready');
      }
    }, 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* ── password unlock ── */
  function handleUnlock() {
    if (!share) return;
    if (share.password && password !== share.password) {
      setPwdError('Incorrect password — please try again.');
      return;
    }
    setPwdError('');
    setUnlocked(true);
    setStage('ready');
  }

  /* ── add to drive ── */
  function handleAddToDrive() {
    if (!share) return;
    markAddedToScan(token, 'web-visitor');
    setAddingMsg('Opening your Drive…');
    // Navigate to drive root; the file appears via shared-files panel
    setTimeout(() => {
      router.push(`/?share=${token}`);
    }, 800);
  }

  /* ── download (for previewDataUrl shares) ── */
  function handleDownload() {
    if (!share?.previewDataUrl) return;
    const a = document.createElement('a');
    a.href = share.previewDataUrl;
    a.download = share.itemName;
    a.click();
  }

  /* ── shared styles ── */
  const card: React.CSSProperties = {
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,.09)',
    background: 'rgba(255,255,255,.03)',
    padding: 20,
  };

  const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '11px 22px', borderRadius: 10,
    fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s',
    background: disabled
      ? 'rgba(99,102,241,.2)'
      : primary
        ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
        : 'rgba(255,255,255,.07)',
    color: disabled ? '#475569' : primary ? '#fff' : '#cbd5e1',
    border: primary ? 'none' : '1px solid rgba(255,255,255,.1)',
  } as React.CSSProperties);

  /* ─── RENDER ─────────────────────────────────────────────────────────────── */

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 20% 20%, rgba(99,102,241,.12) 0%, transparent 60%), #08080f',
      fontFamily: 'system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── top bar ── */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        display: 'flex', alignItems: 'center', gap: 14,
        backdropFilter: 'blur(12px)',
        background: 'rgba(8,8,15,.7)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontWeight: 800, fontSize: 18, color: '#f1f5f9',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={16} color="#fff" />
          </div>
          DocDrive
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => router.push('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
            color: '#94a3b8', fontSize: 13, fontWeight: 600,
          }}
        >
          <ArrowLeft size={13} /> Go to Drive
        </button>
      </div>

      {/* ── content ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 16px',
      }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* ════ Loading ════ */}
          {stage === 'loading' && (
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <Loader2 size={32} color="#6366f1" style={{ animation: 'spin .8s linear infinite', marginBottom: 12 }} />
              <div>Loading share…</div>
            </div>
          )}

          {/* ════ Invalid ════ */}
          {stage === 'invalid' && (
            <div style={{ ...card, textAlign: 'center' }}>
              <AlertTriangle size={36} color="#f87171" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, fontSize: 18, color: '#fca5a5', marginBottom: 8 }}>
                Share not found
              </div>
              <div style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
                This link may have expired, been revoked, or never existed.
              </div>
              <button onClick={() => router.push('/')} style={btn(true)}>
                <ArrowLeft size={14} /> Back to Drive
              </button>
            </div>
          )}

          {/* ════ Expired ════ */}
          {stage === 'expired' && (
            <div style={{ ...card, textAlign: 'center' }}>
              <AlertTriangle size={36} color="#fbbf24" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, fontSize: 18, color: '#fcd34d', marginBottom: 8 }}>
                Share link expired
              </div>
              <div style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
                The owner can generate a new share link from their Drive.
              </div>
              <button onClick={() => router.push('/')} style={btn(false)}>
                <ArrowLeft size={14} /> Go to Drive
              </button>
            </div>
          )}

          {/* ════ Locked (password gate) ════ */}
          {stage === 'locked' && share && (
            <div style={card}>
              {/* file header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'rgba(99,102,241,.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Lock size={22} color="#818cf8" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>
                    {share.itemName}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Password-protected · Shared by {share.ownerName}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
                Enter the password to access this share:
              </div>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setPwdError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                placeholder="Share password…"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,.05)',
                  border: `1px solid ${pwdError ? '#ef4444' : 'rgba(255,255,255,.12)'}`,
                  borderRadius: 9, padding: '10px 13px',
                  color: '#f1f5f9', fontSize: 14, outline: 'none', marginBottom: 6,
                }}
              />
              {pwdError && (
                <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{pwdError}</div>
              )}
              <button
                onClick={handleUnlock}
                disabled={!password.trim()}
                style={{ ...btn(true, !password.trim()), width: '100%', marginTop: 6 }}
              >
                <Lock size={14} /> Unlock
              </button>
            </div>
          )}

          {/* ════ Ready (main share view) ════ */}
          {(stage === 'ready' || stage === 'added') && share && unlocked && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── file card ── */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'rgba(99,102,241,.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {share.kind === 'folder'
                      ? <Folder size={26} color="#818cf8" />
                      : <FileText size={26} color="#818cf8" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 800, fontSize: 17, color: '#f1f5f9',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {share.itemName}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                      Shared by <span style={{ color: '#94a3b8', fontWeight: 600 }}>{share.ownerName}</span>
                      {share.fileKind && (
                        <span style={{
                          marginLeft: 8, padding: '2px 7px', borderRadius: 4,
                          background: 'rgba(99,102,241,.2)', color: '#a5b4fc',
                          fontSize: 11, fontWeight: 600,
                        }}>
                          {share.fileKind.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 5 }}>
                      {formatExpiry(share)}
                      {share.accessCount > 0 && ` · ${share.accessCount} views`}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── permission card ── */}
              {(() => {
                const permColor = PERMISSION_COLOR[share.permission];
                const PermIcon  = PERM_ICONS[share.permission];
                return (
                  <div style={{
                    ...card,
                    background: `${permColor}10`,
                    borderColor: `${permColor}30`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PermIcon size={18} color={permColor} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: permColor }}>
                          {PERMISSION_LABELS[share.permission]}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                          {PERMISSION_DESCRIPTIONS[share.permission]}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── image preview ── */}
              {share.previewDataUrl && share.fileKind === 'image' && (
                <div style={{
                  ...card, padding: 10, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={share.previewDataUrl}
                    alt={share.itemName}
                    style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, display: 'block' }}
                  />
                </div>
              )}

              {/* ── collab section ── */}
              {(share.permission === 'edit' || share.permission === 'admin') && (
                <div style={{
                  ...card,
                  background: 'rgba(52,211,153,.05)',
                  borderColor: 'rgba(52,211,153,.2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Zap size={15} color="#34d399" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#6ee7b7' }}>
                      Live Collaboration Available
                    </span>
                  </div>

                  {!joinCollab ? (
                    <button
                      onClick={() => setJoinCollab(true)}
                      style={{ ...btn(false), width: '100%' }}
                    >
                      <Users size={14} /> Join Live Editing Session
                    </button>
                  ) : collab.connected ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', background: '#34d399',
                          display: 'inline-block',
                        }} />
                        <span style={{ color: '#34d399', fontSize: 13, fontWeight: 600 }}>
                          Connected · {collab.users.length} online
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {collab.users.slice(0, 8).map(u => (
                          <div
                            key={u.sessionId}
                            title={u.name}
                            style={{
                              width: 30, height: 30, borderRadius: '50%',
                              background: u.color, display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700, color: '#fff',
                            }}
                          >
                            {avatarInitials(u.name)}
                          </div>
                        ))}
                        {collab.users.length > 8 && (
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%',
                            background: 'rgba(255,255,255,.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: '#94a3b8',
                          }}>
                            +{collab.users.length - 8}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13 }}>
                      <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} />
                      Connecting…
                    </div>
                  )}
                </div>
              )}

              {/* ── success message ── */}
              {stage === 'added' && (
                <div style={{
                  ...card,
                  background: 'rgba(99,102,241,.1)',
                  borderColor: 'rgba(99,102,241,.25)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <CheckCircle2 size={22} color="#818cf8" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#a5b4fc', fontSize: 14 }}>
                      Opening Drive…
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      "{share.itemName}" will appear in your Drive
                    </div>
                  </div>
                </div>
              )}

              {/* ── CTAs ── */}
              {stage === 'ready' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  {share.previewDataUrl && (
                    <button
                      onClick={handleDownload}
                      style={{ ...btn(false), flex: 1 }}
                    >
                      <Download size={14} /> Download
                    </button>
                  )}
                  <button
                    onClick={handleAddToDrive}
                    style={{ ...btn(true), flex: 2 }}
                  >
                    <ExternalLink size={14} />
                    {addingMsg || 'Open in Drive'}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── footer ── */}
      <div style={{
        padding: '14px 24px', textAlign: 'center',
        color: '#1e293b', fontSize: 12,
        borderTop: '1px solid rgba(255,255,255,.04)',
      }}>
        Shared via DocDrive · Secure file collaboration
      </div>

      {/* keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
