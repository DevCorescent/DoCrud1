'use client';

/**
 * CollabBar — embeddable real-time collaboration bar.
 *
 * Renders:
 *   • Presence strip — colored avatars with name tooltips, "N online"
 *   • Save status    — "Saving…" / "Saved just now" / "Saved Xm ago"
 *   • Conflict toast — "Conflicting edits merged" dismissible banner
 *   • Action buttons — Comments (N), Activity, Versions, Undo, Redo
 *   • Side panel     — slide-in 320 px panel with 3 tabs:
 *       Comments | Activity | Versions
 *
 * Usage:
 *   const engine = useCollabEngine(token, userName);
 *   <CollabBar engine={engine} content={editorContent} onContentChange={...} />
 */

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Clock, History, Undo2, Redo2, Zap, X,
  CheckCircle2, AlertTriangle, ChevronRight, Reply, Check,
  Loader2, Save, Users, RefreshCw, Trash2, RotateCcw,
} from 'lucide-react';
import { type CollabEngineState, formatRelativeTime } from '@/lib/collabEngine';
import { avatarInitials } from '@/lib/collabSession';

/* ─── Props ───────────────────────────────────────────────────────────────── */

export interface CollabBarProps {
  engine:          CollabEngineState;
  content?:        string;
  onContentChange?: (c: string) => void;
  /** compact = true: hide text labels, show icons only */
  compact?:        boolean;
  className?:      string;
}

type PanelTab = 'comments' | 'activity' | 'versions';

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const CB_STYLES = `
@keyframes cb-in  { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:none} }
@keyframes cb-fade{ from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
@keyframes cb-spin{ to{transform:rotate(360deg)} }
@keyframes cb-pulse{ 0%,100%{opacity:1} 50%{opacity:.4} }

.cb-panel {
  animation: cb-in .22s cubic-bezier(.4,0,.2,1) both;
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 320px;
  background: rgba(8,8,14,.97);
  border-left: 1px solid rgba(255,255,255,.09);
  backdrop-filter: blur(24px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  font-family: system-ui, sans-serif;
}
.cb-tab-btn { transition: color .12s, border-color .12s; }
.cb-comment { transition: background .09s; }
.cb-comment:hover { background: rgba(255,255,255,.03) !important; }
.cb-btn { transition: background .12s, color .12s; }
.cb-btn:hover { background: rgba(255,255,255,.09) !important; }
.cb-avatar { transition: transform .15s cubic-bezier(.34,1.56,.64,1); }
.cb-avatar:hover { transform: scale(1.15) translateY(-2px) !important; }
.cb-spin { animation: cb-spin .8s linear infinite; }
.cb-pulse { animation: cb-pulse 1.6s ease-in-out infinite; }
`;

/* ─── Main component ─────────────────────────────────────────────────────── */

export default function CollabBar({ engine, content, onContentChange, compact }: CollabBarProps) {
  const [panelOpen, setPanelOpen]   = useState(false);
  const [panelTab,  setPanelTab]    = useState<PanelTab>('comments');
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText,  setReplyText]  = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [saveLabelOpen, setSaveLabelOpen] = useState(false);
  const [relTime, setRelTime]       = useState('');
  const backdropRef = useRef<HTMLDivElement>(null);

  /* Update relative time every 30 s */
  useEffect(() => {
    const tick = () => setRelTime(engine.lastSavedAt ? formatRelativeTime(engine.lastSavedAt) : '');
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [engine.lastSavedAt]);

  /* Keyboard shortcut: Escape closes panel */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const activeUsers  = engine.users;
  const openComments = engine.comments.filter(c => !c.resolved);
  const totalComments = openComments.length;

  function handleSaveVersion() {
    engine.saveVersion(versionLabel || undefined);
    setVersionLabel('');
    setSaveLabelOpen(false);
  }

  function handleRestore(id: string) {
    engine.restoreVersion(id);
    if (onContentChange) {
      const v = engine.versions.find(v => v.id === id);
      if (v) onContentChange(v.content);
    }
  }

  function handleUndo() {
    const prev = engine.undo();
    if (prev !== null && onContentChange) onContentChange(prev);
  }

  function handleRedo() {
    const next = engine.redo();
    if (next !== null && onContentChange) onContentChange(next);
  }

  /* ─── Save status label ── */
  const saveLabel =
    engine.saveStatus === 'saving' ? 'Saving…' :
    engine.saveStatus === 'saved' && engine.lastSavedAt
      ? `Saved ${relTime || 'just now'}`
      : null;

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{CB_STYLES}</style>

      {/* ── Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 10px', height: 40,
        background: 'rgba(8,8,14,.95)',
        borderBottom: '1px solid rgba(255,255,255,.07)',
        fontFamily: 'system-ui, sans-serif',
        flexShrink: 0,
      }}>

        {/* Presence avatars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginRight: 4 }}>
          {activeUsers.slice(0, 5).map((u, i) => (
            <div
              key={u.sessionId}
              title={u.name + (u.typing ? ' (typing…)' : '')}
              className="cb-avatar"
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: u.color,
                border: '2px solid rgba(8,8,14,.9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: '#fff',
                marginLeft: i === 0 ? 0 : -6,
                zIndex: 10 - i,
                position: 'relative',
                cursor: 'default',
              }}
            >
              {avatarInitials(u.name)}
              {u.typing && (
                <span className="cb-pulse" style={{
                  position: 'absolute', bottom: -1, right: -1,
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#34d399', border: '1px solid rgba(8,8,14,.9)',
                }} />
              )}
            </div>
          ))}
          {activeUsers.length > 5 && (
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'rgba(255,255,255,.1)',
              border: '2px solid rgba(8,8,14,.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: '#94a3b8',
              marginLeft: -6, zIndex: 5, position: 'relative',
            }}>
              +{activeUsers.length - 5}
            </div>
          )}
        </div>

        {/* Online dot + count */}
        {activeUsers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
            <span className="cb-pulse" style={{
              width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block',
            }} />
            {!compact && (
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                {activeUsers.length} online
              </span>
            )}
          </div>
        )}

        {/* Save status */}
        {saveLabel && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: '#64748b',
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,.04)',
          }}>
            {engine.saveStatus === 'saving'
              ? <Loader2 size={11} className="cb-spin" />
              : <Check size={11} color="#34d399" />}
            {saveLabel}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Undo / Redo */}
        <button
          onClick={handleUndo}
          disabled={!engine.canUndo}
          title="Undo (Ctrl+Z)"
          className="cb-btn"
          style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: engine.canUndo ? 'pointer' : 'not-allowed',
            color: engine.canUndo ? '#64748b' : '#1e293b',
          }}
        >
          <Undo2 size={13} />
        </button>
        <button
          onClick={handleRedo}
          disabled={!engine.canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="cb-btn"
          style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: engine.canRedo ? 'pointer' : 'not-allowed',
            color: engine.canRedo ? '#64748b' : '#1e293b',
          }}
        >
          <Redo2 size={13} />
        </button>

        {/* Comments */}
        <button
          onClick={() => { setPanelOpen(true); setPanelTab('comments'); }}
          className="cb-btn"
          title="Comments"
          style={{
            height: 28, paddingInline: 8, borderRadius: 7, border: 'none',
            background: panelOpen && panelTab === 'comments' ? 'rgba(99,102,241,.18)' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <MessageSquare size={13} />
          {totalComments > 0 && !compact && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: '#6366f1', color: '#fff',
              borderRadius: 4, padding: '0 4px',
            }}>
              {totalComments}
            </span>
          )}
        </button>

        {/* Activity */}
        <button
          onClick={() => { setPanelOpen(true); setPanelTab('activity'); }}
          className="cb-btn"
          title="Activity"
          style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: panelOpen && panelTab === 'activity' ? 'rgba(99,102,241,.18)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <Clock size={13} />
        </button>

        {/* Versions */}
        <button
          onClick={() => { setPanelOpen(true); setPanelTab('versions'); }}
          className="cb-btn"
          title="Version history"
          style={{
            height: 28, paddingInline: 8, borderRadius: 7, border: 'none',
            background: panelOpen && panelTab === 'versions' ? 'rgba(99,102,241,.18)' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <History size={13} />
          {!compact && (
            <span style={{ fontSize: 11 }}>{engine.versions.length}</span>
          )}
        </button>

        {/* Save now */}
        <button
          onClick={() => setSaveLabelOpen(p => !p)}
          className="cb-btn"
          title="Save version"
          style={{
            height: 28, paddingInline: 8, borderRadius: 7, border: 'none',
            background: 'rgba(99,102,241,.12)',
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            color: '#818cf8',
          }}
        >
          <Save size={12} />
          {!compact && <span style={{ fontSize: 11, fontWeight: 600 }}>Save</span>}
        </button>

        {/* Collab status dot */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: engine.connected ? '#34d399' : '#f87171',
        }} title={engine.connected ? 'Collab connected' : 'Collab offline'} />
      </div>

      {/* ── Save label popover ── */}
      {saveLabelOpen && (
        <div style={{
          position: 'absolute', right: 12, top: 44, zIndex: 9990,
          background: 'rgba(8,8,14,.98)', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.7)',
          padding: 12, display: 'flex', gap: 6, alignItems: 'center',
          animation: 'cb-fade .15s ease both',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <input
            autoFocus
            value={versionLabel}
            onChange={e => setVersionLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveVersion(); if (e.key === 'Escape') setSaveLabelOpen(false); }}
            placeholder="Label (optional)…"
            style={{
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 7, padding: '6px 10px', color: '#f1f5f9',
              fontSize: 12, outline: 'none', width: 180,
            }}
          />
          <button
            onClick={handleSaveVersion}
            style={{
              padding: '6px 12px', borderRadius: 7, border: 'none',
              background: '#6366f1', color: '#fff',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      )}

      {/* ── Conflict toast ── */}
      {engine.conflict && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9991, maxWidth: 380, width: '90%',
          background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.3)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <AlertTriangle size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fcd34d' }}>
              Conflicting edit by {engine.conflict.authorName}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Their version was merged — last-write wins
            </div>
          </div>
          <button
            onClick={engine.dismissConflict}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Side panel ── */}
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div
            ref={backdropRef}
            onClick={() => setPanelOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              background: 'rgba(0,0,0,.3)',
            }}
          />

          <div className="cb-panel">
            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,.07)',
              flexShrink: 0,
            }}>
              <Zap size={15} color="#818cf8" />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', flex: 1 }}>
                Collaboration
              </span>
              <button
                onClick={() => setPanelOpen(false)}
                style={{
                  background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 7,
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#64748b',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Panel tabs */}
            <div style={{
              display: 'flex', borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0,
            }}>
              {(['comments', 'activity', 'versions'] as PanelTab[]).map(tab => {
                const labels: Record<PanelTab, string> = {
                  comments: `Comments${totalComments > 0 ? ` (${totalComments})` : ''}`,
                  activity: 'Activity',
                  versions: `Versions (${engine.versions.length})`,
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setPanelTab(tab)}
                    className="cb-tab-btn"
                    style={{
                      flex: 1, padding: '9px 4px', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600,
                      color: panelTab === tab ? '#a5b4fc' : '#475569',
                      borderBottom: panelTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                      transition: 'all .12s',
                    }}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

              {/* ═══ Comments tab ═══ */}
              {panelTab === 'comments' && (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Add comment */}
                  <div style={{
                    borderRadius: 10, border: '1px solid rgba(255,255,255,.09)',
                    background: 'rgba(255,255,255,.03)', overflow: 'hidden',
                  }}>
                    <textarea
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Add a comment…"
                      rows={2}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'transparent', border: 'none', outline: 'none',
                        resize: 'none', padding: '10px 12px',
                        color: '#e2e8f0', fontSize: 12, lineHeight: 1.5,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    />
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end',
                      padding: '6px 10px', borderTop: '1px solid rgba(255,255,255,.05)',
                    }}>
                      <button
                        onClick={() => { if (newComment.trim()) { engine.addComment(newComment.trim()); setNewComment(''); } }}
                        disabled={!newComment.trim()}
                        style={{
                          padding: '5px 14px', borderRadius: 7, border: 'none',
                          background: newComment.trim() ? '#6366f1' : 'rgba(99,102,241,.2)',
                          color: newComment.trim() ? '#fff' : '#475569',
                          fontSize: 11, fontWeight: 700, cursor: newComment.trim() ? 'pointer' : 'default',
                        }}
                      >
                        Comment
                      </button>
                    </div>
                  </div>

                  {/* Comment list */}
                  {engine.comments.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
                      No comments yet
                    </div>
                  ) : (
                    engine.comments.map(c => (
                      <div
                        key={c.id}
                        className="cb-comment"
                        style={{
                          borderRadius: 10, padding: '10px 12px',
                          background: 'rgba(255,255,255,.02)',
                          border: '1px solid rgba(255,255,255,.06)',
                          opacity: c.resolved ? 0.5 : 1,
                        }}
                      >
                        {/* Author row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: c.authorColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0,
                          }}>
                            {avatarInitials(c.authorName)}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1' }}>
                            {c.authorName}
                          </span>
                          {c.lineRef && (
                            <span style={{ fontSize: 10, color: '#475569' }}>Line {c.lineRef}</span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569' }}>
                            {formatRelativeTime(c.createdAt)}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                          {c.text}
                        </p>

                        {/* Replies */}
                        {c.replies.length > 0 && (
                          <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid rgba(255,255,255,.07)' }}>
                            {c.replies.map(r => (
                              <div key={r.id} style={{ marginBottom: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: r.authorColor }}>
                                  {r.authorName}
                                </span>
                                <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>
                                  {formatRelativeTime(r.createdAt)}
                                </span>
                                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{r.text}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply / Resolve / Delete */}
                        {!c.resolved && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                            {replyingTo === c.id ? (
                              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                <input
                                  autoFocus
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      if (replyText.trim()) engine.replyToComment(c.id, replyText.trim());
                                      setReplyText(''); setReplyingTo(null);
                                    }
                                    if (e.key === 'Escape') { setReplyText(''); setReplyingTo(null); }
                                  }}
                                  placeholder="Reply…"
                                  style={{
                                    flex: 1, background: 'rgba(255,255,255,.05)',
                                    border: '1px solid rgba(255,255,255,.1)',
                                    borderRadius: 6, padding: '4px 8px',
                                    color: '#f1f5f9', fontSize: 11, outline: 'none',
                                  }}
                                />
                                <button
                                  onClick={() => { if (replyText.trim()) engine.replyToComment(c.id, replyText.trim()); setReplyText(''); setReplyingTo(null); }}
                                  style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 10, cursor: 'pointer' }}
                                >
                                  <Reply size={10} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => setReplyingTo(c.id)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.08)', background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: 10 }}
                                >
                                  <Reply size={9} /> Reply
                                </button>
                                <button
                                  onClick={() => engine.resolveComment(c.id)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(52,211,153,.2)', background: 'rgba(52,211,153,.08)', cursor: 'pointer', color: '#34d399', fontSize: 10 }}
                                >
                                  <CheckCircle2 size={9} /> Resolve
                                </button>
                                <button
                                  onClick={() => engine.deleteComment(c.id)}
                                  style={{ marginLeft: 'auto', padding: '3px 6px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569' }}
                                >
                                  <Trash2 size={10} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {c.resolved && (
                          <div style={{ marginTop: 6, fontSize: 10, color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={9} /> Resolved
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ═══ Activity tab ═══ */}
              {panelTab === 'activity' && (
                <div style={{ padding: 14 }}>
                  {engine.activity.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
                      No activity yet
                    </div>
                  ) : (
                    engine.activity.map(a => {
                      const icons: Record<string, React.ReactNode> = {
                        join:    <Users size={12} />,
                        leave:   <X size={12} />,
                        edit:    <RefreshCw size={12} />,
                        comment: <MessageSquare size={12} />,
                        save:    <Save size={12} />,
                        restore: <RotateCcw size={12} />,
                        resolve: <CheckCircle2 size={12} />,
                      };
                      return (
                        <div key={a.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12,
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: a.authorColor, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 700, color: '#fff',
                          }}>
                            {avatarInitials(a.authorName)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ color: '#64748b' }}>{icons[a.kind]}</span>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>{a.description}</span>
                            </div>
                            <span style={{ fontSize: 10, color: '#334155' }}>
                              {a.authorName} · {formatRelativeTime(a.at)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ═══ Versions tab ═══ */}
              {panelTab === 'versions' && (
                <div style={{ padding: 14 }}>
                  {/* Save now button */}
                  <button
                    onClick={() => engine.saveVersion()}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 9,
                      border: '1px solid rgba(99,102,241,.3)',
                      background: 'rgba(99,102,241,.1)', cursor: 'pointer',
                      color: '#a5b4fc', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      marginBottom: 14,
                    }}
                  >
                    <Save size={13} /> Save Current Version
                  </button>

                  {engine.versions.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '20px 0' }}>
                      No versions saved yet
                    </div>
                  ) : (
                    engine.versions.map((v, i) => (
                      <div key={v.id} style={{
                        borderRadius: 10, padding: '10px 12px',
                        background: i === 0 ? 'rgba(99,102,241,.07)' : 'rgba(255,255,255,.02)',
                        border: `1px solid ${i === 0 ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.06)'}`,
                        marginBottom: 8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                              {v.label ?? (v.isAutoSave ? 'Auto-save' : 'Manual save')}
                              {i === 0 && (
                                <span style={{ marginLeft: 6, fontSize: 9, background: '#6366f1', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>
                                  Latest
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>
                              {v.authorName} · {formatRelativeTime(v.at)} · {v.size.toLocaleString()} chars
                            </div>
                          </div>
                          <button
                            onClick={() => handleRestore(v.id)}
                            title="Restore this version"
                            style={{
                              padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,.09)',
                              background: 'transparent', cursor: 'pointer', color: '#64748b',
                              fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <RotateCcw size={10} /> Restore
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
