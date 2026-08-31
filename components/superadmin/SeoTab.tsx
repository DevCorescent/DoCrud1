'use client';

/**
 * Super Admin → SEO Manager.
 *
 * Edits the metadata the public site emits. Everything here is persisted by
 * PUT /api/super-admin/seo, which re-validates server-side — the limits shown
 * beside each field are guidance for the admin, never the enforcement.
 *
 * Three things drive the layout:
 *
 * 1. PREVIEWS RESOLVE LOCALLY. `resolveSeoWith` is the same function the server
 *    uses, so the Google and social previews update as the admin types instead
 *    of only after a save. No second copy of the fallback rules.
 *
 * 2. EFFECTIVE VALUES ARE VISIBLE. An empty "Homepage title" is not empty in
 *    production — it falls back to the global title. The field shows what is
 *    actually being sent, so the admin is never looking at a blank box
 *    wondering what Google receives.
 *
 * 3. THE CANONICAL HOST IS READ-ONLY. It is deployment configuration: the
 *    sitemap's URLs, every canonical tag and robots.txt derive from it, so a
 *    typo in a form would repoint the whole site at a host nobody serves.
 *
 * The surrounding Super Admin shell is a fixed dark surface
 * (`bg-zinc-950 text-white`, with no `dark:` variants anywhere in the panel),
 * so this tab matches it rather than introducing the app's light theme into one
 * tab of an otherwise dark page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSeoWith, TITLE_MAX, DESCRIPTION_MAX,
  type SeoSettings, type ResolvedSeo,
} from '@/lib/seo-resolve';
import { computeSeoHealth, type SeoCheck } from '@/lib/seo-health';
import SitemapHealth from '@/components/superadmin/SitemapHealth';

/* ── Shared styling, matching the panel's existing language ─────────────── */

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const MINI_BTN =
  'rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-300 '
  + 'transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/* ── Small building blocks ─────────────────────────────────────────────── */

function Counter({ value, max, label }: { value: string; max: number; label: string }) {
  const n = value.length;
  const over = n > max;
  return (
    <span className={`text-[11px] tabular-nums ${over ? 'text-amber-400' : 'text-zinc-600'}`}>
      {n}/{max}
      {/* A word, not just a colour: an amber number alone says nothing to a
          screen reader or a colourblind admin. */}
      {over && <span className="ml-1 font-semibold">· {label} may be truncated by Google</span>}
    </span>
  );
}

function Field({
  id, label, value, onChange, placeholder, hint, max, counterLabel, textarea, effective, onClearOverride,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; max?: number; counterLabel?: string; textarea?: boolean;
  /** What production sends when this field is blank, so an empty box is never a mystery. */
  effective?: { source: string; value: string };
  onClearOverride?: () => void;
}) {
  const showEffective = Boolean(effective && !value.trim() && effective.value);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={LABEL}>{label}</label>
        {max !== undefined && <Counter value={value} max={max} label={counterLabel ?? label} />}
      </div>
      {textarea
        ? <textarea id={id} value={value} rows={3} placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)} className={INPUT} />
        : <input id={id} value={value} placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)} className={INPUT} />}

      {showEffective && (
        <p className="mt-1.5 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-[11px] text-zinc-400">
          <span className="font-semibold text-zinc-500">Currently using {effective!.source}:</span>{' '}
          <span className="text-zinc-300">&ldquo;{effective!.value}&rdquo;</span>
        </p>
      )}
      {!showEffective && value.trim() && onClearOverride && (
        <button type="button" onClick={onClearOverride} className={`${MINI_BTN} mt-1.5`}>
          Clear override
        </button>
      )}
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

/** An image the admin has pointed at, with a real preview and an honest failure state. */
function ImageField({
  id, label, value, onChange, hint, previewUrl, square,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  hint?: string; previewUrl: string; square?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setBroken(false); }, [previewUrl]);

  const upload = async (file: File) => {
    setUploading(true); setUploadError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await fetch('/api/super-admin/seo/upload', { method: 'POST', body });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.url) { setUploadError(data?.error || 'Upload failed.'); return; }
      onChange(data.url);
    } catch { setUploadError('Could not reach the server.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const box = square ? 'h-16 w-16' : 'h-16 w-28';

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>{label}</label>
      <div className="flex items-start gap-3">
        <div className={`${box} shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950`}>
          {previewUrl && !broken
            ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" aria-hidden onError={() => setBroken(true)}
                className="h-full w-full object-contain" />
            )
            : (
              <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-zinc-600">
                {previewUrl ? 'Cannot load' : 'None set'}
              </span>
            )}
        </div>
        <div className="min-w-0 flex-1">
          <input id={id} value={value} onChange={(e) => onChange(e.target.value)}
            placeholder="/docrud-logo.png or https://…" className={INPUT} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className={`${MINI_BTN} disabled:opacity-60`}>
              {uploading ? 'Uploading…' : 'Upload image'}
            </button>
            {value && (
              <button type="button" onClick={() => onChange('')} className={MINI_BTN}>Clear</button>
            )}
            <input ref={fileRef} type="file" className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </div>
          {uploadError && <p role="alert" className="mt-1 text-[11px] text-rose-400">{uploadError}</p>}
          {broken && previewUrl && (
            <p className="mt-1 text-[11px] text-amber-400">
              This image did not load. Social platforms will see the same failure.
            </p>
          )}
        </div>
      </div>
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

/** One of the status tiles across the top. */
function StatTile({
  label, value, tone = 'neutral', detail,
}: {
  label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral'; detail?: string;
}) {
  const toneClass = {
    good: 'text-emerald-400', warn: 'text-amber-400',
    bad: 'text-rose-400', neutral: 'text-zinc-200',
  }[tone];
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className={`mt-1 truncate text-[13px] font-semibold ${toneClass}`} title={value}>{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-zinc-600" title={detail}>{detail}</p>}
    </div>
  );
}

function CheckRow({ check }: { check: SeoCheck }) {
  const mark = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✕';
  const tone = check.status === 'pass' ? 'text-emerald-400'
    : check.status === 'warn' ? 'text-amber-400' : 'text-rose-400';
  return (
    <li className="flex gap-2 py-1">
      {/* Status is carried by a word for assistive tech, not by colour alone. */}
      <span aria-hidden className={`mt-px w-3 shrink-0 text-center text-[12px] font-bold ${tone}`}>{mark}</span>
      <span className="sr-only">
        {check.status === 'pass' ? 'Passed:' : check.status === 'warn' ? 'Warning:' : 'Failed:'}
      </span>
      <span className="min-w-0 text-[12px] leading-relaxed text-zinc-300">
        {check.label}
        {check.advice && <span className="block text-[11px] text-zinc-500">{check.advice}</span>}
      </span>
    </li>
  );
}

/** Native <details>: collapsible, keyboard-operable and screen-reader correct for free. */
function Section({
  title, children, defaultOpen = true, aside,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; aside?: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className={`${CARD} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{title}</span>
        <span className="flex items-center gap-2">
          {aside}
          <span aria-hidden className="text-zinc-600 transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** The social card image, with the same honest failure state as ImageField. */
function SocialImage({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  if (!url || broken) {
    return (
      <div className="flex h-40 items-center justify-center bg-zinc-950 px-4 text-center text-[12px] text-zinc-600">
        {url ? 'Image could not be loaded' : 'No image set'}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" aria-hidden onError={() => setBroken(true)}
      className="h-40 w-full bg-zinc-950 object-contain" />
  );
}

/* ── The tab ───────────────────────────────────────────────────────────── */

export default function SeoTab() {
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  /** The last saved state, for a truthful "unsaved changes" indicator. */
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/super-admin/seo', { cache: 'no-store' });
      if (!r.ok) {
        setError(r.status === 401 ? 'Session expired — sign in again.' : 'Could not load SEO settings.');
        return;
      }
      const data = await r.json();
      setSettings(data.settings);
      setSavedSnapshot(JSON.stringify(data.settings));
      setBaseUrl(data.canonicalBaseUrl);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = Boolean(settings) && JSON.stringify(settings) !== savedSnapshot;

  /* Guards a real navigation away (reload, close, external link). An in-panel
     tab switch is React state and never reaches this — the sticky bar below is
     what covers that case. */
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const set = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = useCallback(async () => {
    if (!settings || saving) return;
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/super-admin/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Could not save.'); return; }
      setSettings(data.settings);
      setSavedSnapshot(JSON.stringify(data.settings));
      setLastSavedAt(new Date());
    } catch { setError('Could not reach the server.'); }
    finally { setSaving(false); }
  }, [settings, saving]);

  const discard = useCallback(() => {
    if (!savedSnapshot) return;
    setSettings(JSON.parse(savedSnapshot) as SeoSettings);
    setError('');
  }, [savedSnapshot]);

  /* Resolved with the SAME function the server uses, against the in-progress
     settings — this is what makes the previews live. */
  const resolved: ResolvedSeo | null = useMemo(
    () => (settings ? resolveSeoWith(settings, baseUrl) : null),
    [settings, baseUrl],
  );
  const health = useMemo(
    () => (settings && resolved ? computeSeoHealth(settings, resolved) : null),
    [settings, resolved],
  );

  if (loading) {
    return <div className="p-6 text-sm text-zinc-500" aria-live="polite">Loading SEO settings…</div>;
  }
  if (!settings || !resolved || !health) {
    return (
      <div className="p-6">
        <p role="alert" className="text-sm text-rose-400">{error || 'SEO settings unavailable.'}</p>
        <button type="button" onClick={() => void load()}
          className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
          Retry
        </button>
      </div>
    );
  }

  const host = hostOf(baseUrl);
  const verified = Boolean(settings.googleSiteVerification.trim());
  const scoreTone = health.band === 'good' ? 'text-emerald-400'
    : health.band === 'fair' ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-zinc-100">SEO Manager</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">
            Control how Docrud appears in search engines and when shared on social platforms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-[12px]">
            {saving ? <span className="text-zinc-400">Saving…</span>
              : dirty ? <span className="text-amber-400">Unsaved changes</span>
              : lastSavedAt ? <span className="text-emerald-400">Saved</span> : null}
          </span>
          <button type="button" onClick={() => void save()} disabled={saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">
          Save failed — {error}
        </p>
      )}

      {/* ── Overview tiles ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile label="SEO health" value={`${health.score} / 100`}
          tone={health.band === 'good' ? 'good' : health.band === 'fair' ? 'warn' : 'bad'}
          detail={`${health.passed} of ${health.total} checks passing`} />
        <StatTile label="Indexing" value={settings.noindex ? 'Noindex enabled' : 'Indexable'}
          tone={settings.noindex ? 'bad' : 'good'}
          detail={settings.noindex ? 'Hidden from search' : 'Visible to search engines'} />
        <StatTile label="Canonical" value={host || 'Not configured'}
          tone={host ? 'neutral' : 'bad'} detail="From NEXT_PUBLIC_APP_URL" />
        <StatTile label="Google verification" value={verified ? 'Configured' : 'Not configured'}
          tone={verified ? 'good' : 'warn'} detail={verified ? 'Meta tag emitted' : 'Optional'} />
        <StatTile label="Last saved"
          value={lastSavedAt
            ? lastSavedAt.toLocaleString(undefined, {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })
            : 'Not saved this session'}
          tone={dirty ? 'warn' : 'neutral'}
          detail={dirty ? 'You have unsaved edits' : undefined} />
      </div>

      {/* ── Previews, side by side where there is room ── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className={CARD} aria-label="Google search preview">
          <p className={LABEL}>Google search preview</p>
          <div className="mt-2 max-w-[600px]">
            <p className="truncate text-[12px] text-zinc-500">{host}</p>
            <p className="truncate text-[18px] leading-snug text-[#8ab4f8]">{resolved.title}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">{resolved.description}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-[11px] text-zinc-600">
              Title <Counter value={resolved.title} max={TITLE_MAX} label="Title" />
            </span>
            <span className="text-[11px] text-zinc-600">
              Description <Counter value={resolved.description} max={DESCRIPTION_MAX} label="Description" />
            </span>
          </div>
          <p className={`${HINT} mt-2`}>
            These are the metadata values Docrud sends. Google may rewrite your title or description
            based on the search query, and decides when and how to display them.
          </p>
        </section>

        <section className={CARD} aria-label="Social sharing preview">
          <p className={LABEL}>Social / Open Graph preview</p>
          <div className="mt-2 max-w-[520px] overflow-hidden rounded-lg border border-zinc-800">
            <SocialImage url={resolved.ogImage} />
            <div className="bg-zinc-900 p-3">
              <p className="truncate text-[11px] uppercase tracking-wide text-zinc-500">{host}</p>
              <p className="truncate text-[14px] font-semibold text-zinc-100">{resolved.ogTitle}</p>
              <p className="line-clamp-2 text-[12px] text-zinc-400">{resolved.ogDescription}</p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Global SEO ── */}
      <Section title="Global SEO">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field id="seo-site-name" label="Site name" value={settings.siteName}
            onChange={(v) => set('siteName', v)} hint="Used in the title template and Open Graph." />
          <Field id="seo-site-title" label="SEO title" value={settings.siteTitle} max={TITLE_MAX}
            onChange={(v) => set('siteTitle', v)} counterLabel="Title"
            hint="The short brand title used across the site." />
          <div className="lg:col-span-2">
            <Field id="seo-title-full" label="Full title" value={settings.siteTitleFull} max={TITLE_MAX}
              onChange={(v) => set('siteTitleFull', v)} counterLabel="Title"
              hint="Used as the homepage title when no homepage title is set below." />
          </div>
          <div className="lg:col-span-2">
            <Field id="seo-description" label="Meta description" value={settings.siteDescription}
              onChange={(v) => set('siteDescription', v)} textarea max={DESCRIPTION_MAX}
              counterLabel="Description"
              hint="The default snippet Google may show beneath your result." />
          </div>
          <div className="lg:col-span-2">
            <Field id="seo-keywords" label="Default keywords" value={settings.keywords.join(', ')}
              onChange={(v) => set('keywords', v.split(',').map((k) => k.trim()).filter(Boolean))}
              hint="Comma separated. Most search engines ignore these; they are kept for completeness." />
          </div>

          <div className="min-w-0">
            <span className={LABEL}>Canonical URL</span>
            <input value={baseUrl} readOnly aria-readonly aria-label="Canonical URL"
              className={`${INPUT} cursor-not-allowed text-zinc-500`} />
            <p className={HINT}>
              Controlled by NEXT_PUBLIC_APP_URL and shared by the sitemap, robots.txt and every
              canonical tag. Not editable here — a typo would repoint the whole site.
            </p>
          </div>

          <div className="min-w-0">
            <span className={LABEL}>Indexing</span>
            <div className={`mt-1 rounded-lg border px-3 py-2 ${settings.noindex
              ? 'border-rose-500/40 bg-rose-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
              <p className={`text-[12px] font-bold uppercase tracking-wide ${settings.noindex ? 'text-rose-300' : 'text-emerald-300'}`}>
                {settings.noindex ? 'Noindex enabled' : 'Indexing enabled'}
              </p>
              <label className="mt-1.5 flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={settings.noindex}
                  onChange={(e) => set('noindex', e.target.checked)}
                  className="h-4 w-4 accent-amber-500" />
                Ask search engines NOT to index this site
              </label>
            </div>
            <p className={HINT}>
              {settings.noindex
                ? 'Search engines are being instructed not to index the public site — it will drop out of results.'
                : 'The public site is available for search engines to index.'}
            </p>
          </div>
        </div>
      </Section>

      {/* ── Homepage SEO ── */}
      <Section title="Homepage SEO">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field id="seo-home-title" label="Homepage title" value={settings.homeTitle} max={TITLE_MAX}
            counterLabel="Title" onChange={(v) => set('homeTitle', v)}
            placeholder="Leave empty to use the global full title"
            effective={{ source: 'the global full title', value: resolved.title }}
            onClearOverride={() => set('homeTitle', '')}
            hint="Overrides the global title on the homepage only." />
          <Field id="seo-home-desc" label="Homepage description" value={settings.homeDescription}
            max={DESCRIPTION_MAX} counterLabel="Description" textarea
            onChange={(v) => set('homeDescription', v)}
            placeholder="Leave empty to use the global meta description"
            effective={{ source: 'the global meta description', value: resolved.description }}
            onClearOverride={() => set('homeDescription', '')}
            hint="Overrides the global description on the homepage only." />
        </div>
      </Section>

      {/* ── Social sharing ── */}
      <Section title="Social sharing">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field id="seo-og-title" label="Open Graph title" value={settings.ogTitle} max={TITLE_MAX}
            counterLabel="Title" onChange={(v) => set('ogTitle', v)}
            placeholder="Falls back to the homepage title"
            effective={{ source: 'the homepage title', value: resolved.ogTitle }}
            onClearOverride={() => set('ogTitle', '')} />
          <Field id="seo-og-desc" label="Open Graph description" value={settings.ogDescription}
            max={DESCRIPTION_MAX} counterLabel="Description" textarea
            onChange={(v) => set('ogDescription', v)}
            placeholder="Falls back to the homepage description"
            effective={{ source: 'the homepage description', value: resolved.ogDescription }}
            onClearOverride={() => set('ogDescription', '')} />
          <div className="lg:col-span-2">
            <ImageField id="seo-og-image" label="Open Graph image" value={settings.ogImage}
              onChange={(v) => set('ogImage', v)} previewUrl={resolved.ogImage}
              hint="Shown when a Docrud link is shared. Site-relative path or an https URL. Falls back to the logo." />
          </div>

          <Field id="seo-tw-title" label="Twitter / X title" value={settings.twitterTitle} max={TITLE_MAX}
            counterLabel="Title" onChange={(v) => set('twitterTitle', v)}
            placeholder="Falls back to the Open Graph title"
            effective={{ source: 'the Open Graph title', value: resolved.twitterTitle }}
            onClearOverride={() => set('twitterTitle', '')} />
          <Field id="seo-tw-desc" label="Twitter / X description" value={settings.twitterDescription}
            max={DESCRIPTION_MAX} counterLabel="Description" textarea
            onChange={(v) => set('twitterDescription', v)}
            placeholder="Falls back to the Open Graph description"
            effective={{ source: 'the Open Graph description', value: resolved.twitterDescription }}
            onClearOverride={() => set('twitterDescription', '')} />
          <div className="lg:col-span-2">
            <ImageField id="seo-tw-image" label="Twitter / X image" value={settings.twitterImage}
              onChange={(v) => set('twitterImage', v)} previewUrl={resolved.twitterImage}
              hint="Falls back to the Open Graph image." />
          </div>
        </div>
      </Section>

      {/* ── Branding ── */}
      <Section title="Branding">
        <div className="grid gap-4 lg:grid-cols-2">
          <ImageField id="seo-logo" label="Logo" value={settings.logoUrl}
            onChange={(v) => set('logoUrl', v)} previewUrl={resolved.logoUrl}
            hint="Used in Organization structured data and as the social image fallback." />
          <ImageField id="seo-favicon" label="Favicon" value={settings.faviconUrl}
            onChange={(v) => set('faviconUrl', v)} previewUrl={settings.faviconUrl} square
            hint="The small icon shown in browser tabs and next to search results." />
        </div>
      </Section>

      {/* ── Health ── */}
      <Section title="SEO health">
        <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-5 py-4 text-center">
            <p className={`text-3xl font-black tabular-nums ${scoreTone}`}>{health.score}</p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600">out of 100</p>
            <p className="mt-1 text-[11px] text-zinc-500">{health.passed} of {health.total} passing</p>
          </div>
          <ul className="min-w-0 sm:columns-2 sm:gap-6">
            {health.checks.map((c) => <CheckRow key={c.id} check={c} />)}
          </ul>
        </div>
        <p className={`${HINT} mt-3`}>
          This score reflects how completely the metadata above is filled in. It is not a Google
          ranking and does not query any external service.
        </p>
      </Section>

      {/* ── Advanced, collapsed by default: rarely touched after setup ── */}
      <Section title="Search Console" defaultOpen={false}
        aside={
          <span className={`text-[11px] font-semibold ${verified ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {verified ? '● Verification configured' : '○ Not configured'}
          </span>
        }>
        <Field id="seo-gsc" label="Google Search Console verification"
          value={settings.googleSiteVerification}
          onChange={(v) => set('googleSiteVerification', v)}
          placeholder="google-site-verification content value"
          hint="Paste only the content value Google gives you, not the whole meta tag. It is emitted as a verification meta tag when set. This status means the value is stored — it does not check with Google." />
      </Section>

      {/* Its own section rather than a line in the one above: it runs real
          validation against the served sitemap and has its own state. */}
      <Section title="Sitemap health" defaultOpen={false}>
        <SitemapHealth />
      </Section>

      {/* ── Sticky unsaved bar: the in-panel equivalent of a leave prompt ── */}
      {dirty && (
        <div role="status"
          className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-zinc-900/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-[13px] text-amber-200">
            You have unsaved SEO changes. They are not live until you save.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={discard} className={MINI_BTN}>Discard changes</button>
            <button type="button" onClick={() => void save()} disabled={saving}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
