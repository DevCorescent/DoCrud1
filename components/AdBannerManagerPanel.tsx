'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, GripVertical, ImageIcon, Link2, Loader2, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

type AdBanner = {
  id: string;
  imageUrl: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  active: boolean;
  order: number;
  createdAt: string;
};

const EMPTY: Omit<AdBanner, 'id' | 'createdAt' | 'order'> = {
  imageUrl: '', title: '', subtitle: '', ctaLabel: '', ctaHref: '', active: true,
};

/* ── shared dark-theme primitives ─────────────────────────────────── */
const card  = 'rounded-2xl border border-zinc-800 bg-zinc-900';
const label = 'mb-1.5 block text-xs font-medium text-zinc-400 uppercase tracking-wider';
const inp   = 'w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition';
const btn   = (variant: 'primary' | 'ghost' | 'danger') => ({
  primary: 'flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50',
  ghost:   'flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-750 hover:text-white disabled:opacity-50',
  danger:  'flex items-center gap-1.5 rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/40 hover:text-red-300',
}[variant]);

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-2 group">
      {on
        ? <ToggleRight className="h-6 w-6 text-amber-400 transition group-hover:text-amber-300" />
        : <ToggleLeft  className="h-6 w-6 text-zinc-600 transition group-hover:text-zinc-500" />}
      <span className={`text-sm font-medium transition ${on ? 'text-amber-400' : 'text-zinc-500'}`}>
        {on ? 'Active — showing on homepage' : 'Inactive — hidden from homepage'}
      </span>
    </button>
  );
}

export default function AdBannerManagerPanel() {
  const [banners, setBanners]       = useState<AdBanner[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing]       = useState<AdBanner | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm]             = useState<typeof EMPTY>({ ...EMPTY });
  const [imageMode, setImageMode]   = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput]     = useState('');
  const fileRef                     = useRef<HTMLInputElement>(null);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/ad-banners', { cache: 'no-store' });
      const d = await r.json() as { banners?: AdBanner[] };
      setBanners(Array.isArray(d.banners) ? d.banners : []);
    } catch { flash(false, 'Failed to load banners'); }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const resetForm = () => {
    setEditing(null);
    setIsCreating(false);
    setForm({ ...EMPTY });
    setUrlInput('');
    setImageMode('upload');
  };

  const openNew = () => {
    setEditing(null);
    setIsCreating(true);
    setForm({ ...EMPTY });
    setUrlInput('');
    setImageMode('upload');
  };

  const openEdit = (b: AdBanner) => {
    setIsCreating(false);
    setEditing(b);
    setForm({ imageUrl: b.imageUrl, title: b.title, subtitle: b.subtitle ?? '', ctaLabel: b.ctaLabel ?? '', ctaHref: b.ctaHref ?? '', active: b.active });
    setUrlInput(b.imageUrl.startsWith('/') ? '' : b.imageUrl.startsWith('http') ? b.imageUrl : '');
    setImageMode(b.imageUrl.startsWith('http') && !b.imageUrl.includes('/uploads/') ? 'url' : 'upload');
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/super-admin/ad-banners/upload', { method: 'POST', body: fd });
      const d = await r.json() as { url?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Upload failed');
      if (d.url) setForm(f => ({ ...f, imageUrl: d.url! }));
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Upload failed'); }
    setUploading(false);
  };

  const applyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      flash(false, 'Please enter a valid URL starting with http:// or https://');
      return;
    }
    setForm(f => ({ ...f, imageUrl: trimmed }));
  };

  const save = async () => {
    if (!form.imageUrl) { flash(false, 'Please provide an image (upload or URL)'); return; }
    if (!form.title.trim()) { flash(false, 'Title is required'); return; }
    setSaving(true);
    try {
      const banner = editing
        ? { ...editing, ...form }
        : { ...form, id: `banner_${Date.now()}`, order: banners.length, createdAt: new Date().toISOString() };
      const r = await fetch('/api/super-admin/ad-banners', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'upsert', banner }),
      });
      const d = await r.json() as { banners?: AdBanner[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Save failed');
      if (d.banners) setBanners(d.banners);
      resetForm();
      flash(true, editing ? 'Banner updated successfully' : 'Banner created successfully');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Save failed'); }
    setSaving(false);
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('Delete this banner? This cannot be undone.')) return;
    setSaving(true);
    try {
      const r = await fetch('/api/super-admin/ad-banners', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const d = await r.json() as { banners?: AdBanner[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Delete failed');
      if (d.banners) setBanners(d.banners);
      if (editing?.id === id) resetForm();
      flash(true, 'Banner deleted');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Delete failed'); }
    setSaving(false);
  };

  const toggleActive = async (b: AdBanner) => {
    const r = await fetch('/api/super-admin/ad-banners', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', banner: { ...b, active: !b.active } }),
    });
    const d = await r.json() as { banners?: AdBanner[] };
    if (r.ok && d.banners) setBanners(d.banners);
  };

  const showForm = isCreating || editing !== null;

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Ad Banners</h2>
          <p className="mt-1 text-sm text-zinc-500">Manage promotional banners shown in the homepage slider.</p>
        </div>
        <button className={btn('primary')} onClick={openNew}>
          <Plus className="h-4 w-4" /> Add Banner
        </button>
      </div>

      {/* ── flash ── */}
      {msg && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
          msg.ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/30 bg-red-500/10 text-red-400'
        }`}>
          <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${msg.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {msg.text}
        </div>
      )}

      {/* ── form ── */}
      {showForm && (
        <div className={`${card} overflow-hidden`}>
          {/* form header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-white">{editing ? 'Edit Banner' : 'New Banner'}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Recommended image size: 1920×820px (21:9 ratio)</p>
            </div>
            <button onClick={resetForm} className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="space-y-5 p-5">
            {/* ── image section ── */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <label className={label} style={{ margin: 0 }}>Banner Image</label>
                {/* mode toggle */}
                <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => { setImageMode('upload'); }}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                      imageMode === 'upload' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <ImageIcon className="h-3 w-3" /> Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImageMode('url'); }}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                      imageMode === 'url' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Link2 className="h-3 w-3" /> Image URL
                  </button>
                </div>
              </div>

              {/* image preview */}
              {form.imageUrl && (
                <div className="relative mb-3 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950" style={{ aspectRatio: '21/9' }}>
                  <img src={form.imageUrl} alt="preview" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <button
                    onClick={() => { setForm(f => ({ ...f, imageUrl: '' })); setUrlInput(''); }}
                    className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition hover:bg-black/90 hover:text-white"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                  <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2.5 py-1 text-[10px] font-medium text-emerald-400 backdrop-blur-sm">
                    ✓ Image ready
                  </div>
                </div>
              )}

              {/* upload mode */}
              {imageMode === 'upload' && !form.imageUrl && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="group relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-800/40 py-10 text-zinc-500 transition hover:border-amber-500/50 hover:bg-zinc-800/60 hover:text-zinc-400 disabled:opacity-60"
                  style={{ aspectRatio: '21/9' }}
                >
                  {uploading
                    ? <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                    : <ImageIcon className="h-8 w-8 transition group-hover:text-amber-500/70" />
                  }
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-400 group-hover:text-zinc-300">
                      {uploading ? 'Uploading…' : 'Click to upload image'}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">JPEG, PNG, WebP, GIF — max 4 MB</p>
                  </div>
                  {!uploading && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1.5 border-t border-zinc-800 bg-zinc-900/80 py-1.5 text-[11px] text-zinc-600">
                      Recommended: <span className="text-zinc-500 font-medium">1920 × 820 px</span>
                    </div>
                  )}
                </button>
              )}

              {/* URL mode */}
              {imageMode === 'url' && !form.imageUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } }}
                    placeholder="https://example.com/banner.jpg"
                    className={inp}
                  />
                  <button
                    type="button"
                    onClick={applyUrl}
                    disabled={!urlInput.trim()}
                    className="flex-shrink-0 rounded-xl bg-zinc-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-600 disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
            </div>

            {/* ── text fields ── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Title <span className="text-red-500">*</span></label>
                <input className={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Launch Your Career Today" />
              </div>
              <div>
                <label className={label}>Subtitle</label>
                <input className={inp} value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                  placeholder="Supporting line under the title" />
              </div>
              <div>
                <label className={label}>CTA Button Label</label>
                <input className={inp} value={form.ctaLabel} onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))}
                  placeholder="e.g. Learn More" />
              </div>
              <div>
                <label className={label}>CTA Link</label>
                <input className={inp} type="url" value={form.ctaHref} onChange={e => setForm(f => ({ ...f, ctaHref: e.target.value }))}
                  placeholder="https://…" />
              </div>
            </div>

            {/* ── active toggle ── */}
            <Toggle on={form.active} onToggle={() => setForm(f => ({ ...f, active: !f.active }))} />

            {/* ── preview strip ── */}
            {form.imageUrl && form.title && (
              <div className="rounded-xl border border-zinc-800 overflow-hidden">
                <div className="border-b border-zinc-800 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600">Live Preview</p>
                </div>
                <div className="relative overflow-hidden" style={{ aspectRatio: '21/9' }}>
                  <img src={form.imageUrl} alt="preview" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    {form.title && <p className="text-base font-bold text-white leading-tight drop-shadow-lg" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>{form.title}</p>}
                    {form.subtitle && <p className="mt-0.5 text-xs text-white/65">{form.subtitle}</p>}
                    {form.ctaLabel && (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm border border-white/20">
                        {form.ctaLabel} →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── actions ── */}
            <div className="flex items-center gap-3 pt-1">
              <button className={btn('primary')} onClick={() => void save()} disabled={saving || uploading}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {editing ? 'Save Changes' : 'Create Banner'}
              </button>
              <button className={btn('ghost')} onClick={resetForm}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── banner list ── */}
      <div className={card}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <p className="text-sm font-semibold text-white">
            All Banners
            <span className="ml-2 rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-normal text-zinc-500">{banners.length}</span>
          </p>
          {banners.length > 0 && (
            <p className="text-xs text-zinc-600">{banners.filter(b => b.active).length} active</p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : banners.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800">
              <ImageIcon className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">No banners yet</p>
              <p className="mt-0.5 text-xs text-zinc-600">Click "Add Banner" to create your first ad banner</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {banners.map((b, idx) => (
              <div key={b.id} className={`flex items-center gap-4 px-5 py-4 transition hover:bg-zinc-800/30 ${editing?.id === b.id ? 'bg-amber-500/5 border-l-2 border-amber-500' : ''}`}>
                {/* order */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <GripVertical className="h-4 w-4 text-zinc-700" />
                  <span className="w-5 text-center text-xs font-mono text-zinc-700">{idx + 1}</span>
                </div>

                {/* thumbnail */}
                <div className="h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800 border border-zinc-700">
                  <img src={b.imageUrl} alt={b.title} className="h-full w-full object-cover" />
                </div>

                {/* info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{b.title}</p>
                  {b.subtitle && <p className="truncate text-xs text-zinc-500 mt-0.5">{b.subtitle}</p>}
                  {b.ctaHref && (
                    <a href={b.ctaHref} target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-600 transition hover:text-amber-500">
                      <ExternalLink className="h-2.5 w-2.5" />
                      {b.ctaHref.length > 45 ? b.ctaHref.slice(0, 45) + '…' : b.ctaHref}
                    </a>
                  )}
                </div>

                {/* actions */}
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleActive(b)}
                    className={`rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-widest transition ${
                      b.active
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25'
                        : 'bg-zinc-800 text-zinc-600 border border-zinc-700 hover:border-zinc-600 hover:text-zinc-400'
                    }`}
                  >{b.active ? 'Live' : 'Off'}</button>

                  <button
                    type="button"
                    onClick={() => openEdit(b)}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-white"
                  >Edit</button>

                  <button
                    type="button"
                    onClick={() => void deleteBanner(b.id)}
                    className="rounded-lg p-1.5 text-zinc-700 transition hover:bg-red-900/30 hover:text-red-400"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
