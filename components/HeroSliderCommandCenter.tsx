'use client';

/**
 * Super Admin → Promotions → Hero Slider.
 *
 * ═══ WHAT THIS IS FOR ═══
 *
 * Everything the homepage hero shows, in one screen: the words, the two
 * artworks, the ground colour, the accent, and which graphic animates beside
 * the text. The older Ad Banner panel edits the same records and still works —
 * it just knows about four of the eleven fields, which is why the server merges
 * an upsert rather than replacing it. This is the master.
 *
 * ═══ WHY THERE IS A PREVIEW ═══
 *
 * The hero is the first thing on the homepage and it is composed of a picture,
 * a wash, white type and a moving graphic. Nobody can hold that in their head
 * from six form fields, and "save it and go and look" means publishing to
 * everyone in order to find out. The preview is the same veil, the same type
 * scale and the same motif as the page, at both shapes, and it updates as you
 * type — before anything is saved.
 *
 * ═══ WHY IT ASKS FOR TWO IMAGES ═══
 *
 * The hero is a wide band on a monitor and a nearly-square one on a phone. One
 * picture cannot be both: a 12:5 banner on a phone crops to a thin strip
 * through its middle, which is usually the part with nothing in it. The mobile
 * upload is optional and falls back to the wide one — but the panel says what
 * each shape is for rather than leaving it to be discovered on a phone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, Check, ChevronDown, ChevronUp, ImageIcon, Loader2,
  Monitor, Plus, Smartphone, Trash2, Upload, X,
} from 'lucide-react';
import HeroMotif from '@/components/home/HeroMotif';
import {
  HERO_DEFAULT_ACCENT, HERO_DEFAULT_BG, HERO_IMAGE_SPEC, HERO_MOTIFS,
  safeHexColor, type HeroBanner, type HeroMotif as HeroMotifKind,
} from '@/lib/hero-banner';
import './hero-command-center.css';

type Draft = Omit<HeroBanner, 'createdAt'>;

const blank = (order: number): Draft => ({
  id: `hero_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  imageUrl: '', imageUrlMobile: '', backgroundColor: HERO_DEFAULT_BG,
  accentColor: HERO_DEFAULT_ACCENT, motif: 'orbit',
  title: '', subtitle: '', ctaLabel: '', ctaHref: '', active: true, order,
});

/* ── Presets ──
   Six grounds that already work on this theme, so the common case is one click
   rather than a colour picker and a guess. A free hex field is right there for
   everything else. */
const GROUNDS: Array<{ bg: string; accent: string; name: string }> = [
  { bg: '#0b1020', accent: '#8aa2ff', name: 'Midnight' },
  { bg: '#08120f', accent: '#63e0cb', name: 'Deep teal' },
  { bg: '#140f08', accent: '#ffd39a', name: 'Amber' },
  { bg: '#150a14', accent: '#f4a3d8', name: 'Plum' },
  { bg: '#0d1117', accent: '#a7b6c8', name: 'Slate' },
  { bg: '#120b1e', accent: '#c4a3ff', name: 'Violet' },
];

export default function HeroSliderCommandCenter() {
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');

  const deskFile = useRef<HTMLInputElement>(null);
  const mobFile = useRef<HTMLInputElement>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg(null), 4200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/ad-banners', { cache: 'no-store' });
      const d = await r.json() as { banners?: HeroBanner[] };
      setBanners(Array.isArray(d.banners) ? [...d.banners].sort((a, b) => a.order - b.order) : []);
    } catch {
      flash(false, 'Could not load the hero banners.');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  /* ── Talking to the server ──
     Every write goes through the same POST the older panel uses, so there is
     one code path that touches the file and one place where a banner is
     validated. */
  const post = useCallback(async (body: Record<string, unknown>, okText: string) => {
    setSaving(true);
    try {
      const r = await fetch('/api/super-admin/ad-banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json() as { banners?: HeroBanner[]; error?: string };
      if (!r.ok) { flash(false, d.error || 'Save failed.'); return false; }
      if (Array.isArray(d.banners)) setBanners([...d.banners].sort((a, b) => a.order - b.order));
      flash(true, okText);
      return true;
    } catch {
      flash(false, 'Save failed — the server did not answer.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [flash]);

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) { flash(false, 'A slide needs a headline.'); return; }
    if (!draft.imageUrl && !draft.backgroundColor) {
      flash(false, 'A slide needs a picture or a background colour.'); return;
    }
    if (await post({ action: 'upsert', banner: draft }, 'Slide saved. It is live on the homepage.')) {
      setDraft(null);
    }
  };

  const upload = async (which: 'desktop' | 'mobile', file: File) => {
    setUploading(which);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/super-admin/ad-banners/upload', { method: 'POST', body: fd });
      const d = await r.json() as { url?: string; error?: string };
      if (!r.ok || !d.url) { flash(false, d.error || 'Upload failed.'); return; }
      set(which === 'desktop' ? 'imageUrl' : 'imageUrlMobile', d.url);
      flash(true, `${which === 'desktop' ? 'Desktop' : 'Mobile'} artwork uploaded.`);
    } catch {
      flash(false, 'Upload failed.');
    } finally {
      setUploading(null);
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const i = banners.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= banners.length) return;
    const next = [...banners];
    [next[i], next[j]] = [next[j], next[i]];
    setBanners(next);                                   // move it now, reconcile after
    await post({ action: 'reorder', order: next.map((b) => b.id) }, 'Order updated.');
  };

  const live = useMemo(() => banners.filter((b) => b.active).length, [banners]);

  return (
    <div className="hcc">
      <header className="hcc-head">
        <div>
          <h2 className="hcc-h">Hero Slider</h2>
          <p className="hcc-sub">
            The band across the top of the homepage. It runs edge to edge and up behind
            the navigation, so whatever is here is the first thing anyone sees.
          </p>
        </div>
        <div className="hcc-head-right">
          <span className="hcc-count">
            <span className="hcc-dot" data-on={live > 0} />
            {loading ? 'Loading…' : `${live} live · ${banners.length} total`}
          </span>
          <button
            type="button"
            className="hcc-btn hcc-btn-primary"
            onClick={() => { setDraft(blank(banners.length)); setPreview('desktop'); }}
          >
            <Plus className="h-4 w-4" /> New slide
          </button>
        </div>
      </header>

      {msg && (
        <div className={`hcc-flash ${msg.ok ? 'is-ok' : 'is-bad'}`} role="status">
          {msg.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* ══ The editor ══ */}
      {draft && (
        <section className="hcc-editor">
          <div className="hcc-editor-head">
            <h3>{banners.some((b) => b.id === draft.id) ? 'Edit slide' : 'New slide'}</h3>
            <button type="button" className="hcc-icon" onClick={() => setDraft(null)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="hcc-grid">
            {/* ── Left: the fields ── */}
            <div className="hcc-fields">
              <Group title="Words">
                <Field label="Headline" hint="Two lines at most — it is clamped after that.">
                  <input
                    className="hcc-in" value={draft.title} maxLength={120}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="Find people by what they can do"
                  />
                </Field>
                <Field label="Supporting line" hint="Optional. Also clamped to two lines.">
                  <textarea
                    className="hcc-in hcc-ta" value={draft.subtitle} maxLength={240} rows={2}
                    onChange={(e) => set('subtitle', e.target.value)}
                    placeholder="Search the directory by skill, role and availability."
                  />
                </Field>
                <div className="hcc-row">
                  <Field label="Button label" hint="Leave both empty for no button.">
                    <input
                      className="hcc-in" value={draft.ctaLabel} maxLength={48}
                      onChange={(e) => set('ctaLabel', e.target.value)} placeholder="Browse people"
                    />
                  </Field>
                  <Field label="Button link" hint="A path like /people, or an https:// address.">
                    <input
                      className="hcc-in" value={draft.ctaHref} maxLength={512}
                      onChange={(e) => set('ctaHref', e.target.value)} placeholder="/people"
                    />
                  </Field>
                </div>
                {draft.ctaHref.trim() !== '' && !isAcceptedHref(draft.ctaHref) && (
                  <p className="hcc-warn">
                    <AlertCircle className="h-3.5 w-3.5" />
                    That link will be dropped when it saves. Use a path starting with <code>/</code> or an <code>https://</code> address.
                  </p>
                )}
              </Group>

              <Group title="Artwork" hint="Both optional — a colour and a motif make a slide on their own.">
                <ImageSlot
                  icon={<Monitor className="h-4 w-4" />}
                  name="Desktop"
                  spec={HERO_IMAGE_SPEC.desktop}
                  value={draft.imageUrl}
                  busy={uploading === 'desktop'}
                  inputRef={deskFile}
                  onPick={(f) => upload('desktop', f)}
                  onUrl={(v) => set('imageUrl', v)}
                  onClear={() => set('imageUrl', '')}
                />
                <ImageSlot
                  icon={<Smartphone className="h-4 w-4" />}
                  name="Mobile"
                  spec={HERO_IMAGE_SPEC.mobile}
                  value={draft.imageUrlMobile}
                  busy={uploading === 'mobile'}
                  inputRef={mobFile}
                  fallbackNote={draft.imageUrl ? 'Falls back to the desktop artwork when empty.' : undefined}
                  onPick={(f) => upload('mobile', f)}
                  onUrl={(v) => set('imageUrlMobile', v)}
                  onClear={() => set('imageUrlMobile', '')}
                />
              </Group>

              <Group title="Colour">
                <div className="hcc-presets">
                  {GROUNDS.map((g) => (
                    <button
                      key={g.bg}
                      type="button"
                      className="hcc-preset"
                      data-on={draft.backgroundColor === g.bg && draft.accentColor === g.accent}
                      style={{ background: g.bg, borderColor: g.accent + '55' }}
                      onClick={() => { set('backgroundColor', g.bg); set('accentColor', g.accent); }}
                      title={`${g.name} — ground ${g.bg}, accent ${g.accent}`}
                    >
                      <span className="hcc-preset-a" style={{ background: g.accent }} />
                      <span className="hcc-preset-n">{g.name}</span>
                    </button>
                  ))}
                </div>
                <div className="hcc-row">
                  <Field label="Background" hint="Under the artwork, and alone when there is none.">
                    <ColorField value={draft.backgroundColor} fallback={HERO_DEFAULT_BG} onChange={(v) => set('backgroundColor', v)} />
                  </Field>
                  <Field label="Accent" hint="What the animated graphic is drawn in.">
                    <ColorField value={draft.accentColor} fallback={HERO_DEFAULT_ACCENT} onChange={(v) => set('accentColor', v)} />
                  </Field>
                </div>
              </Group>

              <Group title="Animation" hint="Drawn in the browser — nothing is downloaded for it.">
                <div className="hcc-motifs">
                  {HERO_MOTIFS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="hcc-motif"
                      data-on={draft.motif === m.id}
                      onClick={() => set('motif', m.id as HeroMotifKind)}
                    >
                      <span className="hcc-motif-art" style={{ color: draft.accentColor || HERO_DEFAULT_ACCENT }}>
                        {m.id === 'none'
                          ? <span className="hcc-motif-none">—</span>
                          : <HeroMotif kind={m.id} color={draft.accentColor || HERO_DEFAULT_ACCENT} />}
                      </span>
                      <span className="hcc-motif-l">{m.label}</span>
                      <span className="hcc-motif-h">{m.hint}</span>
                    </button>
                  ))}
                </div>
              </Group>

              <label className="hcc-check">
                <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
                <span>Show this slide on the homepage</span>
              </label>
            </div>

            {/* ── Right: what it will look like ── */}
            <div className="hcc-preview-col">
              <div className="hcc-preview-head">
                <span>Preview</span>
                <div className="hcc-seg">
                  <button type="button" data-on={preview === 'desktop'} onClick={() => setPreview('desktop')}>
                    <Monitor className="h-3.5 w-3.5" /> Desktop
                  </button>
                  <button type="button" data-on={preview === 'mobile'} onClick={() => setPreview('mobile')}>
                    <Smartphone className="h-3.5 w-3.5" /> Mobile
                  </button>
                </div>
              </div>
              <HeroPreview draft={draft} shape={preview} />
              <p className="hcc-preview-note">
                The same wash, type scale and graphic the page uses. On the homepage this band
                also runs up behind the navigation bar and dissolves into the feed underneath.
              </p>
            </div>
          </div>

          <div className="hcc-editor-foot">
            <button type="button" className="hcc-btn hcc-btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="hcc-btn hcc-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save slide
            </button>
          </div>
        </section>
      )}

      {/* ══ The slides ══ */}
      <section className="hcc-list">
        {loading && <div className="hcc-empty"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>}

        {!loading && banners.length === 0 && (
          <div className="hcc-empty">
            <ImageIcon className="h-5 w-5" />
            <div>
              <strong>No slides yet.</strong>
              <span>The hero renders nothing at all until there is one — the feed simply starts at the top.</span>
            </div>
          </div>
        )}

        {banners.map((b, i) => (
          <article key={b.id} className="hcc-item" data-off={!b.active}>
            <div
              className="hcc-thumb"
              style={{
                backgroundColor: b.backgroundColor || HERO_DEFAULT_BG,
                backgroundImage: b.imageUrl ? `url("${b.imageUrl.replace(/["\\]/g, encodeURIComponent)}")` : undefined,
              }}
            >
              {!b.imageUrl && <span className="hcc-thumb-c" style={{ color: b.accentColor }}>◍</span>}
            </div>

            <div className="hcc-item-body">
              <div className="hcc-item-top">
                <h4>{b.title || <em>Untitled slide</em>}</h4>
                {!b.active && <span className="hcc-tag">Hidden</span>}
                {b.motif !== 'none' && <span className="hcc-tag hcc-tag-q">{labelFor(b.motif)}</span>}
                {b.imageUrlMobile && <span className="hcc-tag hcc-tag-q">Mobile art</span>}
              </div>
              {b.subtitle && <p className="hcc-item-sub">{b.subtitle}</p>}
              {b.ctaLabel && b.ctaHref && (
                <p className="hcc-item-cta">{b.ctaLabel} <ArrowRight className="h-3 w-3" /> <code>{b.ctaHref}</code></p>
              )}
            </div>

            <div className="hcc-item-acts">
              <button type="button" className="hcc-icon" disabled={i === 0 || saving} onClick={() => move(b.id, -1)} aria-label="Move up">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" className="hcc-icon" disabled={i === banners.length - 1 || saving} onClick={() => move(b.id, 1)} aria-label="Move down">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="hcc-btn hcc-btn-ghost hcc-btn-s"
                onClick={() => { setDraft({ ...b }); setPreview('desktop'); }}
              >
                Edit
              </button>
              <button
                type="button"
                className="hcc-icon hcc-icon-danger"
                disabled={saving}
                onClick={() => {
                  if (!window.confirm(`Delete “${b.title || 'this slide'}”? This cannot be undone.`)) return;
                  void post({ action: 'delete', id: b.id }, 'Slide deleted.');
                }}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

/* ══════════ pieces ══════════ */

function labelFor(m: HeroMotifKind) {
  return HERO_MOTIFS.find((x) => x.id === m)?.label ?? m;
}

/** The same rule the server applies, so the panel can say so before saving
    rather than letting a link vanish without explanation. */
function isAcceptedHref(v: string) {
  const t = v.trim();
  return (t.startsWith('/') && !t.startsWith('//')) || /^https:\/\//i.test(t);
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="hcc-group">
      <div className="hcc-group-h">
        <h4>{title}</h4>
        {hint && <span>{hint}</span>}
      </div>
      <div className="hcc-group-b">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="hcc-field">
      <span className="hcc-label">{label}</span>
      {children}
      {hint && <span className="hcc-hint">{hint}</span>}
    </label>
  );
}

/** A colour well and the hex beside it. The text field is the authority — a
    native picker cannot express "no colour", and typing is faster than
    hunting when you already know the value. */
function ColorField({ value, fallback, onChange }: { value: string; fallback: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const valid = safeHexColor(text, '') !== '' || text.trim() === '';
  return (
    <span className="hcc-color">
      <input
        type="color"
        className="hcc-color-well"
        value={safeHexColor(value, fallback).slice(0, 7)}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
        aria-label="Pick a colour"
      />
      <input
        className={`hcc-in hcc-color-hex ${valid ? '' : 'is-bad'}`}
        value={text}
        maxLength={9}
        spellCheck={false}
        placeholder={fallback}
        onChange={(e) => {
          setText(e.target.value);
          const ok = safeHexColor(e.target.value, '');
          if (ok || e.target.value.trim() === '') onChange(ok);
        }}
      />
    </span>
  );
}

function ImageSlot({
  icon, name, spec, value, busy, inputRef, fallbackNote, onPick, onUrl, onClear,
}: {
  icon: React.ReactNode;
  name: string;
  spec: { w: number; h: number; ratio: string; note: string };
  value: string;
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  fallbackNote?: string;
  onPick: (f: File) => void;
  onUrl: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="hcc-slot">
      <div className="hcc-slot-h">
        <span className="hcc-slot-n">{icon} {name}</span>
        <span className="hcc-slot-spec">{spec.ratio} · {spec.w}×{spec.h}</span>
      </div>

      <div className="hcc-slot-b">
        <div
          className="hcc-slot-prev"
          data-shape={name === 'Mobile' ? 'tall' : 'wide'}
          style={value ? { backgroundImage: `url("${value.replace(/["\\]/g, encodeURIComponent)}")` } : undefined}
        >
          {!value && <ImageIcon className="h-4 w-4" />}
        </div>

        <div className="hcc-slot-ctrl">
          <p className="hcc-slot-note">{spec.note}</p>
          {fallbackNote && <p className="hcc-slot-note hcc-slot-note-q">{fallbackNote}</p>}
          <div className="hcc-slot-btns">
            <button type="button" className="hcc-btn hcc-btn-ghost hcc-btn-s" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {value ? 'Replace' : 'Upload'}
            </button>
            {value && (
              <button type="button" className="hcc-btn hcc-btn-ghost hcc-btn-s" onClick={onClear}>
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <input
            className="hcc-in hcc-in-s"
            value={value}
            spellCheck={false}
            placeholder="…or paste an image URL"
            onChange={(e) => onUrl(e.target.value)}
          />
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The slide, at the shape it will be seen in.
 *
 * The veil is the same three gradients as home-hero-slider.css. Two copies of
 * one wash is a thing that can drift apart — but the alternative is the panel
 * importing the page's stylesheet and inheriting its bleed, its parallax and
 * its scroll-snap track, none of which mean anything in a 420px box. The
 * comment in both files points at the other.
 */
function HeroPreview({ draft, shape }: { draft: Draft; shape: 'desktop' | 'mobile' }) {
  const src = shape === 'mobile' ? (draft.imageUrlMobile || draft.imageUrl) : draft.imageUrl;
  return (
    <div className="hcc-prev" data-shape={shape}>
      <div
        className="hcc-prev-frame"
        style={{
          backgroundColor: draft.backgroundColor || HERO_DEFAULT_BG,
          backgroundImage: src ? `url("${src.replace(/["\\]/g, encodeURIComponent)}")` : undefined,
        }}
      >
        <div className="hcc-prev-veil" />
        <HeroMotif kind={draft.motif} color={draft.accentColor || HERO_DEFAULT_ACCENT} />
        <div className="hcc-prev-body">
          <h5>{draft.title || 'Your headline goes here'}</h5>
          {draft.subtitle && <p>{draft.subtitle}</p>}
          {draft.ctaLabel && draft.ctaHref && (
            <span className="hcc-prev-cta">{draft.ctaLabel} <ArrowRight className="h-3.5 w-3.5" /></span>
          )}
        </div>
        <div className="hcc-prev-dots"><i data-on /><i /><i /></div>
      </div>
    </div>
  );
}
