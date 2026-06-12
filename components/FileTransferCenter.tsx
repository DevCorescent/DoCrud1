'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useSearchTracker, SEARCH_CONTEXTS } from '@/lib/search-tracking';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderClosed,
  FolderPlus,
  Loader2,
  Lock,
  Paperclip,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { buildAbsoluteAppUrl } from '@/lib/url';
import type { FileManagerFolder, FileTransferAuthMode, SecureFileTransfer } from '@/types/document';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

const formatBytes = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(v) / Math.log(1024)));
  return `${(v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

const pickFileIcon = (mime: string) => {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return FileImage;
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return FileSpreadsheet;
  if (m.includes('zip') || m.includes('rar') || m.includes('7z')) return FileArchive;
  return FileText;
};

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

/* ─── token helpers ───────────────────────────────────────────────────────── */

const S = {
  // layout
  panel: { background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 } as React.CSSProperties,
  panelActive: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16 } as React.CSSProperties,
  // text
  h1: { fontSize: 17, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.025em' } as React.CSSProperties,
  h2: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)', letterSpacing: '-0.01em' } as React.CSSProperties,
  label: { fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.18em', textTransform: 'uppercase' } as React.CSSProperties,
  body: { fontSize: 13, color: 'rgba(255,255,255,0.60)' } as React.CSSProperties,
  // input
  input: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10, color: 'rgba(255,255,255,0.88)', fontSize: 13, padding: '9px 12px',
    width: '100%', outline: 'none', fontFamily: 'inherit',
  } as React.CSSProperties,
  // buttons
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px',
    borderRadius: 10, background: '#fff', color: '#0D0D0F',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
    letterSpacing: '-0.01em', transition: 'opacity 0.15s',
  } as React.CSSProperties,
  btnGhost: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.09)',
    letterSpacing: '-0.01em', transition: 'background 0.15s',
  } as React.CSSProperties,
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 10, background: 'rgba(239,68,68,0.10)', color: 'rgba(252,165,165,0.9)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.18)',
    letterSpacing: '-0.01em', transition: 'background 0.15s',
  } as React.CSSProperties,
  // badge
  badgeActive: { background: 'rgba(16,185,129,0.14)', color: 'rgb(52,211,153)', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' } as React.CSSProperties,
  badgeRevoked: { background: 'rgba(239,68,68,0.14)', color: 'rgb(252,165,165)', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' } as React.CSSProperties,
  badgeNeutral: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' } as React.CSSProperties,
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '0' } as React.CSSProperties,
} as const;

/* ─── types ───────────────────────────────────────────────────────────────── */

interface FileTransferCenterProps {
  variant?: 'workspace' | 'admin';
  mode?: 'standard' | 'encrypter';
}

type UploadStep = 'file' | 'protect' | 'share';

/* ─── main component ──────────────────────────────────────────────────────── */

export default function FileTransferCenter({ variant = 'workspace', mode = 'standard' }: FileTransferCenterProps) {
  const [transfers, setTransfers] = useState<SecureFileTransfer[]>([]);
  const [folders, setFolders] = useState<FileManagerFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState('');

  // tabs
  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');

  // upload stepper
  const [step, setStep] = useState<UploadStep>('file');
  const [filePayload, setFilePayload] = useState<{ fileName: string; mimeType: string; sizeInBytes: number; dataUrl: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    title: '',
    notes: '',
    folderId: '',
    authMode: (mode === 'encrypter' ? 'triple_password' : 'password') as FileTransferAuthMode,
    accessPassword: '',
    recipientEmail: '',
    maxDownloads: '',
    expiresInDays: '7',
  });
  const [createdTransfer, setCreatedTransfer] = useState<SecureFileTransfer | null>(null);

  // history
  const [search, setSearch] = useState('');
  const trackSearch = useSearchTracker(SEARCH_CONTEXTS.FILE_TRANSFERS);
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedId, setExpandedId] = useState('');
  const [editDraft, setEditDraft] = useState({ title: '', notes: '', accessPassword: '' });

  // folder management
  const [showFolderPanel, setShowFolderPanel] = useState(false);
  const [folderDraft, setFolderDraft] = useState({ name: '', description: '' });
  const [selectedFolder, setSelectedFolder] = useState<'all' | 'unfiled' | string>('all');

  /* ── data ── */

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  const loadRepository = async () => {
    try {
      setLoading(true);
      const [tr, fr] = await Promise.all([fetch('/api/file-transfers'), fetch('/api/file-manager/folders')]);
      const tp = await tr.json().catch(() => null);
      const fp = await fr.json().catch(() => null);
      if (!tr.ok) throw new Error(tp?.error || 'Failed to load transfers.');
      if (!fr.ok) throw new Error(fp?.error || 'Failed to load folders.');
      setTransfers(Array.isArray(tp) ? tp : []);
      setFolders(Array.isArray(fp) ? fp : []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load.', false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRepository(); }, []);
  useEffect(() => { setHistoryPage(1); }, [search, selectedFolder]);

  /* ── upload ── */

  const handleFileDrop = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setFilePayload({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeInBytes: file.size, dataUrl });
      setForm(f => ({ ...f, title: f.title || file.name.replace(/\.[^.]+$/, '') }));
    } catch {
      showToast('Could not read that file.', false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFileDrop(file);
  };

  const createTransfer = async () => {
    if (!filePayload) { showToast('Pick a file first.', false); return; }
    try {
      setSaving(true);
      const expiresAt = form.expiresInDays
        ? new Date(Date.now() + Number(form.expiresInDays) * 86400_000).toISOString()
        : undefined;
      const folder = folders.find(f => f.id === form.folderId);
      const res = await fetch('/api/file-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...filePayload, title: form.title, notes: form.notes,
          folderId: form.folderId || undefined, folderName: folder?.name,
          authMode: form.authMode, accessPassword: form.accessPassword,
          recipientEmail: form.recipientEmail,
          maxDownloads: form.maxDownloads ? Number(form.maxDownloads) : undefined,
          expiresAt,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to create transfer.');
      setTransfers(c => [payload, ...c]);
      setCreatedTransfer(payload);
      setStep('share');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed.', false);
    } finally {
      setSaving(false);
    }
  };

  const resetUpload = () => {
    setFilePayload(null);
    setCreatedTransfer(null);
    setForm({ title: '', notes: '', folderId: '', authMode: 'password', accessPassword: '', recipientEmail: '', maxDownloads: '', expiresInDays: '7' });
    setStep('file');
  };

  /* ── copy ── */

  const copyText = async (val: string, key: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(key);
    showToast('Copied to clipboard.');
    setTimeout(() => setCopied(''), 2000);
  };

  /* ── transfer mutations ── */

  const revokeTransfer = async (id: string) => {
    const res = await fetch('/api/file-transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, revoke: true }) });
    const p = await res.json().catch(() => null);
    if (res.ok) { setTransfers(c => c.map(t => t.id === p.id ? p : t)); showToast('Link revoked.'); return; }
    showToast(p?.error || 'Could not revoke.', false);
  };

  const deleteTransfer = async (id: string) => {
    const res = await fetch(`/api/file-transfers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const p = await res.json().catch(() => null);
    if (res.ok) { setTransfers(c => c.filter(t => t.id !== id)); if (expandedId === id) setExpandedId(''); showToast('File deleted.'); return; }
    showToast(p?.error || 'Could not delete.', false);
  };

  const saveEdit = async () => {
    if (!expandedId) return;
    const res = await fetch('/api/file-transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: expandedId, ...editDraft }) });
    const p = await res.json().catch(() => null);
    if (res.ok) { setTransfers(c => c.map(t => t.id === p.id ? p : t)); setExpandedId(''); showToast('Saved.'); return; }
    showToast(p?.error || 'Could not save.', false);
  };

  const moveFolder = async (id: string, folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    const res = await fetch('/api/file-transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, folderId: folderId || '', folderName: folder?.name || '' }) });
    const p = await res.json().catch(() => null);
    if (res.ok) { setTransfers(c => c.map(t => t.id === p.id ? p : t)); showToast('Moved.'); return; }
    showToast(p?.error || 'Could not move.', false);
  };

  /* ── folder mutations ── */

  const createFolder = async () => {
    if (!folderDraft.name.trim()) { showToast('Name required.', false); return; }
    const res = await fetch('/api/file-manager/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(folderDraft) });
    const p = await res.json().catch(() => null);
    if (res.ok) { setFolders(c => [p, ...c]); setFolderDraft({ name: '', description: '' }); showToast('Folder created.'); return; }
    showToast(p?.error || 'Could not create folder.', false);
  };

  const deleteFolder = async (id: string) => {
    const res = await fetch(`/api/file-manager/folders?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const p = await res.json().catch(() => null);
    if (res.ok) {
      setFolders(c => c.filter(f => f.id !== id));
      setTransfers(c => c.map(t => t.folderId === id ? { ...t, folderId: undefined, folderName: undefined } : t));
      if (selectedFolder === id) setSelectedFolder('all');
      showToast('Folder removed.'); return;
    }
    showToast(p?.error || 'Could not delete folder.', false);
  };

  /* ── derived ── */

  const filteredTransfers = useMemo(() =>
    transfers.filter(t => {
      const inFolder = selectedFolder === 'all' ? true : selectedFolder === 'unfiled' ? !t.folderId : t.folderId === selectedFolder;
      const q = search.trim().toLowerCase();
      const matchSearch = q ? [t.title, t.fileName, t.notes, t.folderName].filter(Boolean).some(v => String(v).toLowerCase().includes(q)) : true;
      return inFolder && matchSearch;
    })
  , [transfers, search, selectedFolder]);

  useEffect(() => {
    if (search.trim()) trackSearch(search, filteredTransfers.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filteredTransfers.length]);

  const PAGE = 8;
  const pageCount = Math.max(1, Math.ceil(filteredTransfers.length / PAGE));
  const paged = filteredTransfers.slice((historyPage - 1) * PAGE, historyPage * PAGE);

  const buildUrl = (path: string) => buildAbsoluteAppUrl(path, typeof window !== 'undefined' ? window.location.origin : undefined);

  const STEPS: UploadStep[] = ['file', 'protect', 'share'];
  const stepIdx = STEPS.indexOf(step);

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────────────── */

  return (
    <div style={{ fontFamily: 'inherit', color: 'rgba(255,255,255,0.88)', position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, padding: '10px 18px', borderRadius: 12,
          background: toast.ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
          color: toast.ok ? 'rgb(52,211,153)' : 'rgb(252,165,165)',
          fontSize: 13, fontWeight: 600,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.50)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Saving overlay */}
      {saving && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, borderRadius: 16,
          background: 'rgba(13,13,15,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 600 }}>
            <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
            Securing your file…
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([['send', 'Send File'], ['history', 'History']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            style={{
              padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: activeTab === id ? '#fff' : 'rgba(255,255,255,0.06)',
              color: activeTab === id ? '#0D0D0F' : 'rgba(255,255,255,0.50)',
              border: 'none', transition: 'all 0.18s', letterSpacing: '-0.01em',
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => void loadRepository()} style={{ ...S.btnGhost, padding: '7px 12px' }}>
            <RefreshCw style={{ width: 13, height: 13 }} />
          </button>
          <button type="button" onClick={() => setShowFolderPanel(v => !v)} style={{ ...S.btnGhost, padding: '7px 14px' }}>
            <FolderClosed style={{ width: 13, height: 13 }} />
            <span>Folders</span>
          </button>
        </div>
      </div>

      {/* Folder panel */}
      {showFolderPanel && (
        <div style={{ ...S.panel, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={S.h2}>Manage Folders</span>
            <button type="button" onClick={() => setShowFolderPanel(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.40)', cursor: 'pointer' }}>
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 16 }}>
            <input
              value={folderDraft.name}
              onChange={e => setFolderDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Folder name"
              style={S.input}
            />
            <input
              value={folderDraft.description}
              onChange={e => setFolderDraft(d => ({ ...d, description: e.target.value }))}
              placeholder="Short note"
              style={S.input}
            />
            <button type="button" onClick={() => void createFolder()} style={S.btnPrimary}>
              <FolderPlus style={{ width: 14, height: 14 }} />
              Create
            </button>
          </div>
          {folders.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {folders.map(f => (
                <div key={f.id} style={{ ...S.panel, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                  <FolderClosed style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.80)' }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>
                    {transfers.filter(t => t.folderId === f.id).length} files
                  </span>
                  <button type="button" onClick={() => void deleteFolder(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.60)', marginLeft: 4 }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ ...S.body, fontSize: 12 }}>No folders yet. Create one above.</p>
          )}
        </div>
      )}

      {/* ── SEND TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'send' && (
        <div>
          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
            {STEPS.map((s, i) => {
              const done = stepIdx > i;
              const active = step === s;
              const labels: Record<UploadStep, string> = { file: '1 · Choose File', protect: '2 · Set Security', share: '3 · Share' };
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
                  <button
                    type="button"
                    onClick={() => { if (done || active) setStep(s); }}
                    style={{
                      padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: done || active ? 'pointer' : 'default',
                      background: active ? '#fff' : done ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.06)',
                      color: active ? '#0D0D0F' : done ? 'rgb(52,211,153)' : 'rgba(255,255,255,0.35)',
                      border: 'none', whiteSpace: 'nowrap', letterSpacing: '-0.01em', transition: 'all 0.18s',
                    }}
                  >
                    {done ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check style={{ width: 11, height: 11 }} />{labels[s].split(' · ')[1]}</span> : labels[s]}
                  </button>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: done ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)', margin: '0 8px' }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Step 1: File ── */}
          {step === 'file' && (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Drop zone */}
              <label
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFileDrop(f); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 12, padding: '48px 24px', borderRadius: 16, cursor: 'pointer', textAlign: 'center',
                  border: `2px dashed ${dragOver ? 'rgba(255,255,255,0.30)' : filePayload ? 'rgba(16,185,129,0.40)' : 'rgba(255,255,255,0.12)'}`,
                  background: dragOver ? 'rgba(255,255,255,0.05)' : filePayload ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.025)',
                  transition: 'all 0.2s',
                }}
              >
                <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
                {filePayload ? (
                  <>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.25)',
                    }}>
                      {(() => { const Icon = pickFileIcon(filePayload.mimeType); return <Icon style={{ width: 22, height: 22, color: 'rgb(52,211,153)' }} />; })()}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginBottom: 4 }}>{filePayload.fileName}</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{formatBytes(filePayload.sizeInBytes)} · {filePayload.mimeType}</p>
                    </div>
                    <span style={{ ...S.badgeActive }}>File ready</span>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                    }}>
                      <Upload style={{ width: 22, height: 22, color: 'rgba(255,255,255,0.40)' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>Drop your file here</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>or click to browse</p>
                    </div>
                  </>
                )}
              </label>

              {/* Title + folder */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p style={{ ...S.label, marginBottom: 6 }}>Display Title</p>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Project Brief Q3" style={S.input} />
                </div>
                <div>
                  <p style={{ ...S.label, marginBottom: 6 }}>Folder</p>
                  <select value={form.folderId} onChange={e => setForm(f => ({ ...f, folderId: e.target.value }))} style={S.input}>
                    <option value="">Unfiled</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <p style={{ ...S.label, marginBottom: 6 }}>Notes (optional)</p>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Private notes about this transfer" rows={2} style={{ ...S.input, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { if (!filePayload) { showToast('Pick a file first.', false); return; } setStep('protect'); }}
                  style={S.btnPrimary}
                >
                  Set Security
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Protect ── */}
          {step === 'protect' && (
            <div style={{ display: 'grid', gap: 20 }}>
              {/* File summary */}
              <div style={{ ...S.panel, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {(() => { const Icon = pickFileIcon(filePayload?.mimeType || ''); return <Icon style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.50)' }} />; })()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.title || filePayload?.fileName}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{filePayload ? formatBytes(filePayload.sizeInBytes) : ''}</p>
                </div>
              </div>

              {/* Auth mode selection */}
              <div>
                <p style={{ ...S.label, marginBottom: 12 }}>Access Control</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {([
                    ['password', 'Password', 'Viewer must enter a password'],
                    ['public', 'Public', 'Anyone with the link can open'],
                    ['email', 'Email Gate', 'Viewer must enter their email'],
                    ['password_and_email', 'Password + Email', 'Both required to access'],
                  ] as const).map(([val, label, desc]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, authMode: val }))}
                      style={{
                        padding: '12px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                        background: form.authMode === val ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${form.authMode === val ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)'}`,
                        transition: 'all 0.18s',
                      }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 700, color: form.authMode === val ? '#fff' : 'rgba(255,255,255,0.55)', marginBottom: 3 }}>{label}</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Password field */}
              {(form.authMode === 'password' || form.authMode === 'password_and_email') && (
                <div>
                  <p style={{ ...S.label, marginBottom: 6 }}>Access Password</p>
                  <input
                    value={form.accessPassword}
                    onChange={e => setForm(f => ({ ...f, accessPassword: e.target.value.toUpperCase() }))}
                    placeholder="e.g. LAUNCH2024"
                    style={S.input}
                  />
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 6 }}>Stored in uppercase. Share this separately from the link.</p>
                </div>
              )}

              {form.authMode === 'email' || form.authMode === 'password_and_email' ? (
                <div>
                  <p style={{ ...S.label, marginBottom: 6 }}>Recipient Email (optional)</p>
                  <input value={form.recipientEmail} onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))} placeholder="recipient@company.com" style={S.input} />
                </div>
              ) : null}

              {/* Limits */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p style={{ ...S.label, marginBottom: 6 }}>Expires After (days)</p>
                  <input value={form.expiresInDays} onChange={e => setForm(f => ({ ...f, expiresInDays: e.target.value }))} placeholder="7" style={S.input} />
                </div>
                <div>
                  <p style={{ ...S.label, marginBottom: 6 }}>Max Downloads</p>
                  <input value={form.maxDownloads} onChange={e => setForm(f => ({ ...f, maxDownloads: e.target.value }))} placeholder="Unlimited" style={S.input} />
                </div>
              </div>

              {/* Security info row */}
              <div style={{ ...S.panel, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', lineHeight: 1.5 }}>
                  Your file is stored encrypted. Only someone with the link{form.authMode !== 'public' ? ' and password' : ''} can access it.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" onClick={() => setStep('file')} style={S.btnGhost}>
                  <ArrowLeft style={{ width: 13, height: 13 }} />
                  Back
                </button>
                <button type="button" onClick={() => void createTransfer()} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>
                  {saving ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Lock style={{ width: 14, height: 14 }} />}
                  Create Secure Link
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Share ── */}
          {step === 'share' && createdTransfer && (() => {
            const secureUrl = buildUrl(`/transfer/${createdTransfer.shareId}`);
            const openUrl = buildUrl(createdTransfer.publicOpenUrl || `/open/${createdTransfer.shareId}`);
            return (
              <div style={{ display: 'grid', gap: 20 }}>
                {/* Success header */}
                <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.28)',
                  }}>
                    <CheckCircle2 style={{ width: 26, height: 26, color: 'rgb(52,211,153)' }} />
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 6 }}>File secured & ready to share</p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)' }}>{createdTransfer.title || createdTransfer.fileName}</p>
                </div>

                {/* Link cards */}
                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    { label: 'Secure Link', desc: 'Password-protected access', url: secureUrl, key: 'secure' },
                    { label: 'Direct Link', desc: 'Open link (no auth page)', url: openUrl, key: 'open' },
                  ].map(item => (
                    <div key={item.key} style={{ ...S.panel, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginLeft: 8 }}>{item.desc}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" onClick={() => void copyText(item.url, item.key)} style={{ ...S.btnGhost, padding: '5px 10px', fontSize: 12 }}>
                            {copied === item.key ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                            {copied === item.key ? 'Copied' : 'Copy'}
                          </button>
                          <button type="button" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')} style={{ ...S.btnGhost, padding: '5px 10px', fontSize: 12 }}>
                            <ExternalLink style={{ width: 12, height: 12 }} />
                            Open
                          </button>
                        </div>
                      </div>
                      <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', wordBreak: 'break-all', lineHeight: 1.5 }}>{item.url}</p>
                    </div>
                  ))}

                  {createdTransfer.accessPassword && (
                    <div style={{ ...S.panel, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>Access Password</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginLeft: 8 }}>Share separately from the link</span>
                        </div>
                        <button type="button" onClick={() => void copyText(createdTransfer.accessPassword || '', 'pw')} style={{ ...S.btnGhost, padding: '5px 10px', fontSize: 12 }}>
                          {copied === 'pw' ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                          {copied === 'pw' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 8, letterSpacing: '0.08em' }}>{createdTransfer.accessPassword}</p>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Opens', value: String(createdTransfer.openCount ?? 0) },
                    { label: 'Downloads', value: String(createdTransfer.downloadCount ?? 0) },
                    { label: 'Auth Mode', value: createdTransfer.authMode.replace(/_/g, ' + ') },
                  ].map(m => (
                    <div key={m.label} style={{ ...S.panel, padding: '12px 14px', textAlign: 'center' }}>
                      <p style={{ ...S.label, marginBottom: 4 }}>{m.label}</p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'capitalize' }}>{m.value}</p>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" onClick={() => { setActiveTab('history'); }} style={S.btnGhost}>
                    View in History
                  </button>
                  <button type="button" onClick={resetUpload} style={S.btnPrimary}>
                    <Upload style={{ width: 14, height: 14 }} />
                    Send Another File
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'rgba(255,255,255,0.30)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search files, notes…"
                style={{ ...S.input, paddingLeft: 32 }}
              />
            </div>
            {/* Folder filter */}
            <select value={selectedFolder} onChange={e => setSelectedFolder(e.target.value)} style={{ ...S.input, width: 'auto', paddingRight: 28 }}>
              <option value="all">All files ({transfers.length})</option>
              <option value="unfiled">Unfiled ({transfers.filter(t => !t.folderId).length})</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name} ({transfers.filter(t => t.folderId === f.id).length})</option>)}
            </select>
            <button type="button" onClick={() => { resetUpload(); setActiveTab('send'); }} style={S.btnPrimary}>
              <Upload style={{ width: 13, height: 13 }} />
              New Transfer
            </button>
          </div>

          {/* Summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Total Files', value: transfers.length },
              { label: 'Total Opens', value: transfers.reduce((a, t) => a + (t.openCount || 0), 0) },
              { label: 'Active Links', value: transfers.filter(t => !t.revokedAt).length },
            ].map(m => (
              <div key={m.label} style={{ ...S.panel, padding: '14px 16px' }}>
                <p style={{ ...S.label, marginBottom: 6 }}>{m.label}</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.03em' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* File list */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', justifyContent: 'center', color: 'rgba(255,255,255,0.40)' }}>
              <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13 }}>Loading transfers…</span>
            </div>
          ) : paged.length === 0 ? (
            <div style={{ ...S.panel, padding: '48px 24px', textAlign: 'center' }}>
              <FolderClosed style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.20)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>No files yet.</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>Upload your first file using the Send tab.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {paged.map(transfer => {
                const secureUrl = buildUrl(`/transfer/${transfer.shareId}`);
                const openUrl = buildUrl(transfer.publicOpenUrl || `/open/${transfer.shareId}`);
                const FileIcon = pickFileIcon(transfer.mimeType);
                const isExpanded = expandedId === transfer.id;
                const isExpired = transfer.expiresAt ? new Date(transfer.expiresAt) < new Date() : false;
                const status = transfer.revokedAt ? 'revoked' : isExpired ? 'expired' : 'active';

                return (
                  <div key={transfer.id} style={{ ...S.panel, overflow: 'hidden', transition: 'background 0.15s' }}>
                    {/* Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                      {/* Icon */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                      }}>
                        {transfer.dataUrl && transfer.mimeType?.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={transfer.dataUrl} alt="" style={{ width: 40, height: 40, borderRadius: 11, objectFit: 'cover' }} />
                        ) : (
                          <FileIcon style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.45)' }} />
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {transfer.title || transfer.fileName}
                          </p>
                          <span style={status === 'active' ? S.badgeActive : status === 'revoked' ? S.badgeRevoked : S.badgeNeutral}>
                            {status}
                          </span>
                          {transfer.folderName && (
                            <span style={{ ...S.badgeNeutral }}>{transfer.folderName}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>{formatBytes(transfer.sizeInBytes)}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>{transfer.openCount || 0} opens</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>{transfer.downloadCount || 0} downloads</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>{timeAgo(transfer.createdAt)}</span>
                        </div>
                      </div>

                      {/* Quick actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type="button" onClick={() => void copyText(secureUrl, `link-${transfer.id}`)} title="Copy link" style={{ ...S.btnGhost, padding: '6px 10px' }}>
                          {copied === `link-${transfer.id}` ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
                        </button>
                        <button type="button" onClick={() => window.open(secureUrl, '_blank', 'noopener,noreferrer')} title="Open" style={{ ...S.btnGhost, padding: '6px 10px' }}>
                          <ExternalLink style={{ width: 13, height: 13 }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isExpanded) { setExpandedId(''); } else {
                              setExpandedId(transfer.id);
                              setEditDraft({ title: transfer.title || '', notes: transfer.notes || '', accessPassword: transfer.accessPassword || '' });
                            }
                          }}
                          style={{ ...S.btnGhost, padding: '6px 10px' }}
                        >
                          {isExpanded ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <>
                        <div style={S.divider} />
                        <div style={{ padding: '16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
                            {[
                              { label: 'Opens', value: String(transfer.openCount ?? 0) },
                              { label: 'Downloads', value: String(transfer.downloadCount ?? 0) },
                              { label: 'Auth', value: transfer.authMode.replace(/_/g, '+') },
                              { label: 'Created', value: new Date(transfer.createdAt).toLocaleDateString() },
                              { label: 'Last Open', value: transfer.lastOpenedAt ? timeAgo(transfer.lastOpenedAt) : 'Never' },
                            ].map(m => (
                              <div key={m.label} style={{ ...S.panel, padding: '10px 12px' }}>
                                <p style={{ ...S.label, marginBottom: 4 }}>{m.label}</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.80)', textTransform: 'capitalize' }}>{m.value}</p>
                              </div>
                            ))}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            {/* Edit form */}
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div>
                                <p style={{ ...S.label, marginBottom: 5 }}>Title</p>
                                <input value={editDraft.title} onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))} placeholder="Display title" style={S.input} />
                              </div>
                              <div>
                                <p style={{ ...S.label, marginBottom: 5 }}>Notes</p>
                                <textarea value={editDraft.notes} onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Private notes" rows={2} style={{ ...S.input, resize: 'vertical' }} />
                              </div>
                              {transfer.authMode !== 'triple_password' && (
                                <div>
                                  <p style={{ ...S.label, marginBottom: 5 }}>Password</p>
                                  <input value={editDraft.accessPassword} onChange={e => setEditDraft(d => ({ ...d, accessPassword: e.target.value.toUpperCase() }))} placeholder="Access password" style={S.input} />
                                </div>
                              )}
                            </div>

                            {/* Links + actions */}
                            <div style={{ display: 'grid', gap: 8 }}>
                              {/* Link pills */}
                              {[
                                { label: 'Secure Link', url: secureUrl, key: `sec-${transfer.id}` },
                                { label: 'Open Link', url: openUrl, key: `open-${transfer.id}` },
                              ].map(lnk => (
                                <button key={lnk.key} type="button" onClick={() => void copyText(lnk.url, lnk.key)} style={{ ...S.panel, padding: '9px 12px', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                                  <p style={{ ...S.label, marginBottom: 3 }}>{lnk.label} {copied === lnk.key ? '· Copied!' : ''}</p>
                                  <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lnk.url}</p>
                                </button>
                              ))}

                              {transfer.authMode === 'triple_password' && (
                                <div style={{ ...S.panel, padding: '10px 12px' }}>
                                  <p style={{ ...S.label, marginBottom: 6 }}>Triple Passwords</p>
                                  {[
                                    { label: 'Transfer', val: transfer.accessPassword },
                                    { label: 'Secure', val: transfer.securePassword },
                                    { label: 'Parser', val: transfer.parserPassword },
                                  ].map(pw => (
                                    <button key={pw.label} type="button" onClick={() => void copyText(pw.val || '', `pw-${pw.label}`)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '3px 0' }}>
                                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>{pw.label}: </span>
                                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{pw.val || '—'}</span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Move folder */}
                              <select value={transfer.folderId || ''} onChange={e => void moveFolder(transfer.id, e.target.value)} style={S.input}>
                                <option value="">Move to Unfiled</option>
                                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Action row */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setExpandedId('')} style={S.btnGhost}>
                              Close
                            </button>
                            <button type="button" onClick={() => void saveEdit()} style={S.btnGhost}>
                              <Check style={{ width: 13, height: 13 }} />
                              Save Changes
                            </button>
                            {!transfer.revokedAt && (
                              <button type="button" onClick={() => void revokeTransfer(transfer.id)} style={S.btnGhost}>
                                <ShieldCheck style={{ width: 13, height: 13 }} />
                                Revoke
                              </button>
                            )}
                            <button type="button" onClick={() => void deleteTransfer(transfer.id)} style={S.btnDanger}>
                              <Trash2 style={{ width: 13, height: 13 }} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <button type="button" disabled={historyPage === 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))} style={{ ...S.btnGhost, padding: '7px 14px', opacity: historyPage === 1 ? 0.4 : 1 }}>
                <ArrowLeft style={{ width: 13, height: 13 }} />
              </button>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{historyPage} / {pageCount}</span>
              <button type="button" disabled={historyPage === pageCount} onClick={() => setHistoryPage(p => Math.min(pageCount, p + 1))} style={{ ...S.btnGhost, padding: '7px 14px', opacity: historyPage === pageCount ? 0.4 : 1 }}>
                <ArrowRight style={{ width: 13, height: 13 }} />
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
