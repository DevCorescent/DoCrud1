'use client';

/**
 * Super Admin → SEO Manager.
 *
 * Edits the metadata the public site emits. Everything here is persisted by
 * PUT /api/super-admin/seo, which re-validates server-side — the limits shown
 * beside each field are guidance for the admin, never the enforcement.
 *
 * The canonical host is displayed READ-ONLY. It is deployment configuration:
 * the sitemap's 502 URLs, every canonical tag and robots.txt derive from it, so
 * a typo in a form would repoint the whole site at a host nobody serves.
 *
 * Follows the existing tab pattern (JobsTab, SponsoredAdsTab): one
 * self-contained component fetching its own admin endpoint.
 */
import { useCallback, useEffect, useState } from 'react';

interface SeoSettings {
  siteName: string; siteTitle: string; siteTitleFull: string; siteDescription: string;
  keywords: string[]; noindex: boolean;
  homeTitle: string; homeDescription: string;
  ogTitle: string; ogDescription: string; ogImage: string;
  twitterTitle: string; twitterDescription: string; twitterImage: string;
  logoUrl: string; faviconUrl: string;
  googleSiteVerification: string;
}
interface Resolved {
  baseUrl: string; title: string; description: string;
  ogTitle: string; ogDescription: string; ogImage: string;
  twitterTitle: string; twitterDescription: string; twitterImage: string;
  logoUrl: string; faviconUrl: string;
}

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const HINT = 'mt-1 text-[11px] text-zinc-500';

/** Google truncates around these. Advisory, matching the server's constants. */
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

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
  id, label, value, onChange, placeholder, hint, max, counterLabel, textarea,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; max?: number; counterLabel?: string; textarea?: boolean;
}) {
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
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

export default function SeoTab() {
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/super-admin/seo', { cache: 'no-store' });
      if (!r.ok) { setError(r.status === 401 ? 'Session expired — sign in again.' : 'Could not load SEO settings.'); return; }
      const data = await r.json();
      setSettings(data.settings); setResolved(data.resolved); setBaseUrl(data.canonicalBaseUrl);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  };

  const save = useCallback(async () => {
    if (!settings || saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const r = await fetch('/api/super-admin/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Could not save.'); return; }
      setSettings(data.settings); setResolved(data.resolved); setSaved(true);
    } catch { setError('Could not reach the server.'); }
    finally { setSaving(false); }
  }, [settings, saving]);

  if (loading) {
    return <div className="p-6 text-sm text-zinc-500" aria-live="polite">Loading SEO settings…</div>;
  }
  if (!settings) {
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

  const previewTitle = resolved?.title || settings.siteTitle;
  const previewDesc = resolved?.description || settings.siteDescription;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">SEO Manager</h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Metadata the public site sends to search engines and social previews.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-[12px]">
            {saving ? <span className="text-zinc-400">Saving…</span>
              : saved ? <span className="text-emerald-400">Saved</span> : null}
          </span>
          <button type="button" onClick={() => void save()} disabled={saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">
          {error}
        </p>
      )}

      {/* Google decides the final snippet; this preview shows what we SEND. */}
      <section className={CARD} aria-label="Search result preview">
        <p className={LABEL}>Google preview</p>
        <div className="mt-2 max-w-[600px]">
          <p className="truncate text-[12px] text-zinc-500">{baseUrl.replace(/^https?:\/\//, '')}</p>
          <p className="truncate text-[18px] leading-snug text-[#8ab4f8]">{previewTitle}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">{previewDesc}</p>
        </div>
        <p className={`${HINT} mt-3`}>
          Google chooses the final title and snippet it displays. This shows the metadata Docrud sends,
          not a guarantee of how the result will appear.
        </p>
      </section>

      <section className={CARD} aria-label="Social preview">
        <p className={LABEL}>Social / Open Graph preview</p>
        <div className="mt-2 max-w-[520px] overflow-hidden rounded-lg border border-zinc-800">
          {resolved?.ogImage
            ? <img src={resolved.ogImage} alt="" aria-hidden className="h-40 w-full bg-zinc-950 object-contain" />
            : <div className="flex h-40 items-center justify-center bg-zinc-950 text-[12px] text-zinc-600">No image set</div>}
          <div className="bg-zinc-900 p-3">
            <p className="truncate text-[11px] uppercase tracking-wide text-zinc-500">
              {baseUrl.replace(/^https?:\/\//, '')}
            </p>
            <p className="truncate text-[14px] font-semibold text-zinc-100">{resolved?.ogTitle || previewTitle}</p>
            <p className="line-clamp-2 text-[12px] text-zinc-400">{resolved?.ogDescription || previewDesc}</p>
          </div>
        </div>
      </section>

      <section className={CARD}>
        <p className={LABEL}>Global</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field id="seo-site-name" label="Site name" value={settings.siteName}
            onChange={(v) => set('siteName', v)} hint="Used in the title template and Open Graph." />
          <Field id="seo-site-title" label="SEO title" value={settings.siteTitle} max={TITLE_MAX}
            onChange={(v) => set('siteTitle', v)} counterLabel="Title" />
          <div className="lg:col-span-2">
            <Field id="seo-title-full" label="Full title" value={settings.siteTitleFull} max={TITLE_MAX}
              onChange={(v) => set('siteTitleFull', v)} counterLabel="Title"
              hint="Shown as the homepage title when no homepage title is set." />
          </div>
          <div className="lg:col-span-2">
            <Field id="seo-description" label="Meta description" value={settings.siteDescription}
              onChange={(v) => set('siteDescription', v)} textarea max={DESCRIPTION_MAX} counterLabel="Description" />
          </div>
          <div className="lg:col-span-2">
            <Field id="seo-keywords" label="Default keywords" value={settings.keywords.join(', ')}
              onChange={(v) => set('keywords', v.split(',').map((k) => k.trim()).filter(Boolean))}
              hint="Comma separated. Most search engines ignore these; they are kept for completeness." />
          </div>

          <div className="min-w-0">
            <span className={LABEL}>Canonical URL</span>
            <input value={baseUrl} readOnly aria-readonly
              className={`${INPUT} cursor-not-allowed text-zinc-500`} />
            <p className={HINT}>
              Deployment configuration (NEXT_PUBLIC_APP_URL), not editable here — the sitemap,
              every canonical tag and robots.txt all derive from it.
            </p>
          </div>

          <div className="min-w-0">
            <span className={LABEL}>Indexing</span>
            <label className="mt-1 flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={settings.noindex}
                onChange={(e) => set('noindex', e.target.checked)}
                className="h-4 w-4 accent-amber-500" />
              Ask search engines NOT to index this site
            </label>
            <p className={HINT}>
              {settings.noindex
                ? 'Currently sending noindex, nofollow — the site will drop out of search results.'
                : 'Currently indexable.'}
            </p>
          </div>
        </div>
      </section>

      <section className={CARD}>
        <p className={LABEL}>Homepage &amp; social</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field id="seo-home-title" label="Homepage title" value={settings.homeTitle} max={TITLE_MAX}
            onChange={(v) => set('homeTitle', v)} counterLabel="Title" placeholder="Falls back to the full title" />
          <Field id="seo-home-desc" label="Homepage description" value={settings.homeDescription}
            max={DESCRIPTION_MAX} counterLabel="Description"
            onChange={(v) => set('homeDescription', v)} placeholder="Falls back to the meta description" />
          <Field id="seo-og-title" label="Open Graph title" value={settings.ogTitle} max={TITLE_MAX}
            onChange={(v) => set('ogTitle', v)} counterLabel="Title" placeholder="Falls back to the homepage title" />
          <Field id="seo-og-desc" label="Open Graph description" value={settings.ogDescription}
            max={DESCRIPTION_MAX} counterLabel="Description"
            onChange={(v) => set('ogDescription', v)} placeholder="Falls back to the homepage description" />
          <Field id="seo-og-image" label="Open Graph image" value={settings.ogImage}
            onChange={(v) => set('ogImage', v)} hint="Site-relative path or an https URL." />
          <Field id="seo-tw-image" label="Twitter / X image" value={settings.twitterImage}
            onChange={(v) => set('twitterImage', v)} placeholder="Falls back to the Open Graph image" />
          <Field id="seo-tw-title" label="Twitter / X title" value={settings.twitterTitle} max={TITLE_MAX}
            onChange={(v) => set('twitterTitle', v)} counterLabel="Title" placeholder="Falls back to the Open Graph title" />
          <Field id="seo-tw-desc" label="Twitter / X description" value={settings.twitterDescription}
            max={DESCRIPTION_MAX} counterLabel="Description"
            onChange={(v) => set('twitterDescription', v)} placeholder="Falls back to the Open Graph description" />
        </div>
      </section>

      <section className={CARD}>
        <p className={LABEL}>Branding &amp; Search Console</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field id="seo-logo" label="Logo" value={settings.logoUrl}
            onChange={(v) => set('logoUrl', v)} hint="Used in Organization structured data and as the social fallback." />
          <Field id="seo-favicon" label="Favicon" value={settings.faviconUrl}
            onChange={(v) => set('faviconUrl', v)} hint="Site-relative path or an https URL." />
          <div className="lg:col-span-2">
            <Field id="seo-gsc" label="Google Search Console verification"
              value={settings.googleSiteVerification}
              onChange={(v) => set('googleSiteVerification', v)}
              placeholder="google-site-verification content value"
              hint="Paste only the content value. Emitted as a verification meta tag when set." />
          </div>
        </div>
      </section>
    </div>
  );
}
