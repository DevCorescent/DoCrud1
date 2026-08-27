'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, AlignLeft, Check, ChevronDown, ChevronUp,
  Eye, Globe, GripVertical, Image as ImageIcon, Info,
  Layout, Link2, Loader2, Megaphone, Navigation,
  Plus, RefreshCw, Save, ToggleLeft, ToggleRight, Trash2,
  Type, X,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────────────── */
type SectionVisibility = {
  trustedCompanies: boolean; homeHighlights: boolean;
  heroBanner: boolean; featureCards: boolean;
  publishHeading: boolean; contentDiscovery: boolean; adBanners: boolean;
  gigsGrid: boolean; leaderboards: boolean; builtInIndia: boolean; footer: boolean;
};
type TrustedCompany = { id: string; name: string; logoUrl: string; href: string; visible: boolean };
type SlotWord    = { word: string; subtitle: string; color: string };
type NavLink     = { id: string; label: string; href: string; visible: boolean; order: number };
type ContentTab  = { id: string; label: string; visible: boolean; order: number };
type FooterLink  = { label: string; href: string; visible: boolean };
type FooterColumn = { id: string; title: string; links: FooterLink[] };
type AnnouncementBanner = {
  id: string; text: string; ctaLabel: string; ctaHref: string;
  style: 'info' | 'warning' | 'success' | 'promo'; active: boolean;
};
type HomepageConfig = {
  sections: SectionVisibility;
  trustedCompanies: { label: string; items: TrustedCompany[]; autoFromJobs: boolean };
  greeting: { subtitle: string; cadenceLabel: string; illustrationUrl: string };
  hero: { slotWords: SlotWord[]; backgroundImage: string; guestCtaPrimary: string; guestCtaSecondary: string; authCtaPrimary: string; authCtaSecondary: string };
  nav: { logoText: string; logoUrl: string; links: NavLink[]; showSignIn: boolean; showSignUp: boolean };
  featureCards: { guestFeatureIds: string[]; defaultFeatureIds: string[] };
  contentDiscovery: { tabs: ContentTab[] };
  footer: { columns: FooterColumn[]; securityBadges: Array<{ label: string; visible: boolean }>; tagline: string; madeIn: string; copyrightEntity: string };
  announcementBanner: AnnouncementBanner | null;
  seoTitle: string; seoDescription: string; updatedAt: string;
};

/* ── Constants ─────────────────────────────────────────────────────────────── */
const DEFAULT_CONFIG: HomepageConfig = {
  sections: { trustedCompanies: true, homeHighlights: true, heroBanner: true, featureCards: true, publishHeading: true, contentDiscovery: true, adBanners: true, gigsGrid: false, leaderboards: false, builtInIndia: true, footer: true },
  trustedCompanies: { label: 'Top companies trust docrud', items: [], autoFromJobs: true },
  greeting: { subtitle: '', cadenceLabel: '', illustrationUrl: '' },
  hero: { slotWords: [], backgroundImage: '', guestCtaPrimary: '', guestCtaSecondary: '', authCtaPrimary: '', authCtaSecondary: '' },
  nav: { logoText: '', logoUrl: '', links: [], showSignIn: true, showSignUp: true },
  featureCards: { guestFeatureIds: [], defaultFeatureIds: [] },
  contentDiscovery: { tabs: [] },
  footer: { columns: [], securityBadges: [], tagline: '', madeIn: '', copyrightEntity: '' },
  announcementBanner: null,
  seoTitle: '', seoDescription: '', updatedAt: '',
};

const ALL_FEATURE_IDS = [
  { id: 'docword', label: 'DocWord' }, { id: 'docsheets', label: 'DocSheets' },
  { id: 'esign', label: 'E-Sign Studio' }, { id: 'pdf', label: 'PDF Studio' },
  { id: 'people', label: 'People Directory' }, { id: 'gigs', label: 'Gigs Marketplace' },
  { id: 'forms', label: 'Forms Center' }, { id: 'drive', label: 'File Drive' },
  { id: 'publish', label: 'Publish Anything' }, { id: 'scratchpad', label: 'Scratchpad' },
  { id: 'esign-viewer', label: 'Document Viewer' }, { id: 'visualizer', label: 'Doc Visualizer' },
];

const DEFAULT_TABS: ContentTab[] = [
  'All', 'News', 'Articles', 'Docs', 'Portfolio', 'Announce', 'Jobs', 'Resumes',
  'Products', 'Events', 'Hackathons', 'Posts', 'Polls', 'Surveys', 'Charts',
  'Threads', 'Videos', 'Milestones', 'Tutorials', 'Gigs',
].map((label, i) => ({ id: label.toLowerCase(), label, visible: true, order: i }));

const DEFAULT_FOOTER_COLS: FooterColumn[] = [
  { id: 'platform', title: 'Platform', links: [
    { label: 'Published Content', href: '/published', visible: true },
    { label: 'File Directory', href: '/directory', visible: true },
    { label: 'Gigs Marketplace', href: '/gigs', visible: true },
    { label: 'Workspace', href: '/workspace', visible: true },
    { label: 'Pricing', href: '/pricing', visible: true },
  ]},
  { id: 'company', title: 'Company', links: [
    { label: 'About', href: '/about', visible: true },
    { label: 'Blog', href: '/blog', visible: true },
    { label: 'Contact Us', href: '/contact', visible: true },
    { label: 'Careers', href: '/careers', visible: true },
    { label: 'Sign Up', href: '/onboarding?start=signup', visible: true },
  ]},
  { id: 'legal', title: 'Legal', links: [
    { label: 'Terms & Conditions', href: '/terms', visible: true },
    { label: 'Privacy Policy', href: '/privacy', visible: true },
    { label: 'Cookie Policy', href: '/cookies', visible: true },
    { label: 'Refund Policy', href: '/refund', visible: true },
    { label: 'DPDP Compliance', href: '/dpdp', visible: true },
  ]},
  { id: 'security', title: 'Security', links: [
    { label: 'Security Overview', href: '/security', visible: true },
    { label: 'Encryption Standards', href: '/security#encryption', visible: true },
    { label: 'Trust & Compliance', href: '/security#trust', visible: true },
    { label: 'Report Vulnerability', href: '/security#report', visible: true },
  ]},
];

const DEFAULT_BADGES = [
  { label: '256-bit AES Encryption', visible: true },
  { label: 'DPDP Act 2023 Compliant', visible: true },
  { label: 'TLS 1.3 in Transit', visible: true },
  { label: 'Data Hosted in India', visible: true },
  { label: 'End-to-End Doc Security', visible: true },
];

const SECTION_META: { key: keyof SectionVisibility; label: string; desc: string; default: boolean }[] = [
  { key: 'trustedCompanies', label: 'Top Companies',        desc: 'Trust marquee above the greeting',     default: true },
  { key: 'homeHighlights',   label: 'Greeting & Matches',   desc: 'Hey-there card, job/people counts, score', default: true },
  { key: 'heroBanner',       label: 'Hero Banner',          desc: 'Slot-machine headline + CTAs',         default: true },
  { key: 'featureCards',     label: 'Feature Cards',        desc: 'Quick-action 2×2 feature grid',        default: true },
  { key: 'publishHeading',   label: 'Publish Heading',      desc: 'CTA strip to publish content',         default: true },
  { key: 'contentDiscovery', label: 'Content Discovery',    desc: 'Tabbed content category pills',        default: true },
  { key: 'adBanners',        label: 'Ad Banners',           desc: 'Promotional image slider',             default: true },
  { key: 'gigsGrid',         label: 'Gigs Grid',            desc: 'Job & gig listing cards',              default: false },
  { key: 'leaderboards',     label: 'Live Leaderboards',    desc: 'Real-time ranking boards',             default: false },
  { key: 'builtInIndia',     label: 'Built in India',       desc: 'India highlights section',             default: true },
  { key: 'footer',           label: 'Footer',               desc: 'Full site footer',                     default: true },
];

const AB_STYLES = [
  { id: 'info'    as const, label: 'Info',    bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.35)',  text: '#93c5fd',  dot: 'bg-blue-400' },
  { id: 'warning' as const, label: 'Warning', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', text: '#fcd34d',  dot: 'bg-amber-400' },
  { id: 'success' as const, label: 'Success', bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.35)',  text: '#86efac',  dot: 'bg-emerald-400' },
  { id: 'promo'   as const, label: 'Promo',   bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.35)', text: '#d8b4fe',  dot: 'bg-purple-400' },
];

type Panel = 'sections' | 'trustedCompanies' | 'announcement' | 'hero' | 'nav' | 'featureCards' | 'contentDiscovery' | 'footer' | 'seo';

const PANELS: { id: Panel; label: string; icon: React.ReactNode }[] = [
  { id: 'sections',         label: 'Sections',           icon: <Layout className="h-4 w-4" /> },
  { id: 'trustedCompanies', label: 'Top Companies',      icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'announcement',     label: 'Announcement Bar',   icon: <Megaphone className="h-4 w-4" /> },
  { id: 'hero',             label: 'Hero Banner',        icon: <Type className="h-4 w-4" /> },
  { id: 'nav',              label: 'Navigation',         icon: <Navigation className="h-4 w-4" /> },
  { id: 'featureCards',     label: 'Feature Cards',      icon: <Globe className="h-4 w-4" /> },
  { id: 'contentDiscovery', label: 'Content Discovery',  icon: <Eye className="h-4 w-4" /> },
  { id: 'footer',           label: 'Footer',             icon: <AlignLeft className="h-4 w-4" /> },
  { id: 'seo',              label: 'SEO & Meta',         icon: <Globe className="h-4 w-4" /> },
];

/* ── Design tokens ──────────────────────────────────────────────────────────── */
const card   = 'rounded-2xl border border-zinc-800 bg-zinc-900';
const label  = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500';
const inp    = 'w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition';
const infoBox = 'flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/8 px-3.5 py-3 text-xs text-blue-400';

/* ── Toggle ─────────────────────────────────────────────────────────────────── */
function Toggle({ on, onToggle, label: lbl }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-2 group">
      {on
        ? <ToggleRight className="h-5 w-5 flex-shrink-0 text-amber-400 transition group-hover:text-amber-300" />
        : <ToggleLeft  className="h-5 w-5 flex-shrink-0 text-zinc-600 transition group-hover:text-zinc-500" />}
      {lbl && <span className={`select-none text-sm transition ${on ? 'text-zinc-300' : 'text-zinc-600'}`}>{lbl}</span>}
    </button>
  );
}

/* ── Root ────────────────────────────────────────────────────────────────────── */
export default function HomepageCommandCenter() {
  const [config, setConfig]   = useState<HomepageConfig>(DEFAULT_CONFIG);
  const [saved, setSaved]     = useState<HomepageConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [panel, setPanel]     = useState<Panel>('sections');
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const heroImgRef  = useRef<HTMLInputElement>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/homepage-config', { cache: 'no-store' });
      const d = await r.json() as { config?: HomepageConfig };
      if (d.config) { setConfig(d.config); setSaved(d.config); }
    } catch { flash(false, 'Failed to load config'); }
    setLoading(false);
  }, [flash]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/super-admin/homepage-config', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const d = await r.json() as { config?: HomepageConfig; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Save failed');
      if (d.config) { setConfig(d.config); setSaved(d.config); }
      flash(true, 'Homepage config saved — changes are live');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Save failed'); }
    setSaving(false);
  };

  const uploadImage = async (file: File, field: string, onDone: (url: string) => void) => {
    setUploadingField(field);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/super-admin/ad-banners/upload', { method: 'POST', body: fd });
      const d = await r.json() as { url?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Upload failed');
      if (d.url) onDone(d.url);
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Upload failed'); }
    setUploadingField(null);
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(saved);
  const setSection = (k: keyof SectionVisibility, v: boolean) =>
    setConfig(c => ({ ...c, sections: { ...c.sections, [k]: v } }));
  const setHero = (k: keyof HomepageConfig['hero'], v: string | SlotWord[]) =>
    setConfig(c => ({ ...c, hero: { ...c.hero, [k]: v } }));
  const setNav = <K extends keyof HomepageConfig['nav']>(k: K, v: HomepageConfig['nav'][K]) =>
    setConfig(c => ({ ...c, nav: { ...c.nav, [k]: v } }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── header bar ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-white">
            <Layout className="h-5 w-5 text-amber-400" /> Homepage Command Centre
          </h2>
          <p className="mt-1 text-sm text-zinc-500">Control every section, element, and content piece on the public homepage.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Unsaved changes
            </span>
          )}
          <button
            onClick={() => void load()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
          ><RefreshCw className="h-3.5 w-3.5" /></button>
          <button
            onClick={() => void save()}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* flash */}
      {msg && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
          msg.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
        }`}>
          {msg.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* ── body ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* sidebar */}
        <nav className="flex flex-row flex-wrap gap-1 lg:w-52 lg:flex-col lg:flex-nowrap">
          {PANELS.map(p => (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                panel === p.id
                  ? 'bg-zinc-800 text-amber-400 border border-zinc-700'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
              }`}
            >{p.icon} {p.label}</button>
          ))}
        </nav>

        {/* panel */}
        <div className="min-w-0 flex-1">
          {panel === 'sections'         && <SectionsPanel config={config} setSection={setSection} />}
          {panel === 'trustedCompanies' && (
            <TrustedCompaniesPanel config={config} setConfig={setConfig}
              uploadImage={uploadImage} uploadingField={uploadingField} />
          )}
          {panel === 'announcement'     && <AnnouncementPanel config={config} setConfig={setConfig} />}
          {panel === 'hero'             && (
            <HeroPanel config={config} setHero={setHero} uploadingField={uploadingField}
              heroImgRef={heroImgRef as React.RefObject<HTMLInputElement>}
              onUpload={f => uploadImage(f, 'hero.bg', url => setHero('backgroundImage', url))} />
          )}
          {panel === 'nav'              && (
            <NavPanel config={config} setNav={setNav} uploadingField={uploadingField}
              logoFileRef={logoFileRef as React.RefObject<HTMLInputElement>}
              onUploadLogo={f => uploadImage(f, 'nav.logo', url => setNav('logoUrl', url))} />
          )}
          {panel === 'featureCards'     && <FeatureCardsPanel config={config} setConfig={setConfig} />}
          {panel === 'contentDiscovery' && <ContentDiscoveryPanel config={config} setConfig={setConfig} />}
          {panel === 'footer'           && <FooterPanel config={config} setConfig={setConfig} />}
          {panel === 'seo'              && <SeoPanel config={config} setConfig={setConfig} />}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Sections
════════════════════════════════════════════════════════════════════ */
function SectionsPanel({ config, setSection }: { config: HomepageConfig; setSection: (k: keyof SectionVisibility, v: boolean) => void }) {
  const onCount = SECTION_META.filter(s => config.sections[s.key]).length;
  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Layout className="h-4 w-4 text-amber-400" /> Section Visibility</p>
          <p className="mt-0.5 text-xs text-zinc-600">Toggle which sections are shown on the public homepage.</p>
        </div>
        <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 text-xs font-bold text-emerald-400">
          {onCount}/{SECTION_META.length} on
        </span>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTION_META.map(({ key, label: lbl, desc, default: def }) => {
          const on = config.sections[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key, !on)}
              className={`group flex items-start justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                on
                  ? 'border-amber-500/25 bg-amber-500/8 hover:bg-amber-500/12'
                  : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-800/70'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${on ? 'text-white' : 'text-zinc-400'}`}>{lbl}</p>
                <p className="mt-0.5 text-xs leading-snug text-zinc-600">{desc}</p>
                {!def && <p className="mt-1 text-[10px] text-zinc-700 uppercase tracking-wider">Off by default</p>}
              </div>
              <span className={`mt-0.5 flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                on ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-600'
              }`}>{on ? 'On' : 'Off'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Announcement
════════════════════════════════════════════════════════════════════ */
/* ── Top Companies ──────────────────────────────────────────────────────────
   The "Top companies trust docrud" marquee. Super Admin owns the heading, the
   company list, the order and — the point of this panel — the LOGOS. A logo is
   uploaded through the same image endpoint the ad banners use, so there is no
   second upload path. A company with no logo renders its name as a wordmark on
   the homepage; it is never shown as a broken image. */
function TrustedCompaniesPanel({
  config, setConfig, uploadImage, uploadingField,
}: {
  config: HomepageConfig;
  setConfig: React.Dispatch<React.SetStateAction<HomepageConfig>>;
  uploadImage: (file: File, field: string, onDone: (url: string) => void) => Promise<void>;
  uploadingField: string | null;
}) {
  const block = config.trustedCompanies ?? { label: '', items: [], autoFromJobs: true };
  const items = block.items ?? [];

  const setBlock = (patch: Partial<HomepageConfig['trustedCompanies']>) =>
    setConfig(c => ({ ...c, trustedCompanies: { ...c.trustedCompanies, ...patch } }));
  const setItems = (next: TrustedCompany[]) => setBlock({ items: next });
  const update = (i: number, patch: Partial<TrustedCompany>) =>
    setItems(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  const add = () => setItems([
    ...items,
    { id: `company-${Date.now().toString(36)}`, name: '', logoUrl: '', href: '', visible: true },
  ]);

  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <ImageIcon className="h-4 w-4 text-amber-400" /> Top Companies Marquee
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            The trust row above the homepage greeting. Add companies, upload their logos, reorder.
          </p>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-zinc-600">{items.filter(i => i.visible).length}/{items.length} visible</span>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div>
          <label className={label}>Heading</label>
          <input className={inp} value={block.label} placeholder="Top companies trust docrud"
            onChange={e => setBlock({ label: e.target.value })} />
          <p className="mt-1.5 text-[11px] text-zinc-600">Leave empty to show the logos with no caption.</p>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-800/40 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">Show companies that are hiring</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">
              Fills the row from employers with live job postings, using their verified logo where
              we have one. Companies pinned below still lead the row.
            </p>
          </div>
          <Toggle on={block.autoFromJobs !== false} onToggle={() => setBlock({ autoFromJobs: block.autoFromJobs === false })} />
        </div>

        {items.length === 0 ? (
          <div className={infoBox}>
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {block.autoFromJobs === false
              ? 'Nothing pinned and auto-fill is off — the marquee is hidden on the homepage.'
              : 'Nothing pinned — the row shows the employers currently posting jobs.'}
          </div>
        ) : (
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {items.map((item, i) => {
              const field = `company-logo-${item.id}`;
              return (
                <div key={item.id}
                  className={`rounded-xl border px-3 py-3 transition ${item.visible ? 'border-zinc-800 bg-zinc-800/40' : 'border-zinc-800/50 bg-zinc-900 opacity-60'}`}>
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-zinc-700" />

                    {/* Logo preview — the real uploaded file, or the initial. */}
                    <div className="flex h-9 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
                      {item.logoUrl
                        ? <img src={item.logoUrl} alt="" className="h-full w-full object-contain p-1" />
                        : <span className="text-[11px] font-bold text-zinc-600">{(item.name || '?').charAt(0).toUpperCase()}</span>}
                    </div>

                    <input className={`${inp} flex-1`} style={{ padding: '5px 10px', fontSize: 12 }}
                      placeholder="Company name" value={item.name}
                      onChange={e => update(i, { name: e.target.value })} />

                    <Toggle on={item.visible} onToggle={() => update(i, { visible: !item.visible })} />
                    <button onClick={() => move(i, -1)} disabled={i === 0}
                      className="rounded p-0.5 text-zinc-700 transition hover:text-zinc-400 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === items.length - 1}
                      className="rounded p-0.5 text-zinc-700 transition hover:text-zinc-400 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                      className="rounded p-0.5 text-zinc-700 transition hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:text-white">
                      {uploadingField === field
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <ImageIcon className="h-3 w-3" />}
                      {item.logoUrl ? 'Replace logo' : 'Upload logo'}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void uploadImage(file, field, url => update(i, { logoUrl: url }));
                        }} />
                    </label>

                    {item.logoUrl && (
                      <button onClick={() => update(i, { logoUrl: '' })}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 transition hover:text-red-400">
                        Remove logo
                      </button>
                    )}

                    <input className={inp} style={{ padding: '5px 10px', fontSize: 12, flex: 1, minWidth: 180 }}
                      placeholder="Link (optional) — https://company.com" value={item.href}
                      onChange={e => update(i, { href: e.target.value })} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={add}
          className="flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/15 px-3.5 py-2 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/25">
          <Plus className="h-3.5 w-3.5" /> Add Company
        </button>
      </div>
    </div>
  );
}

function AnnouncementPanel({ config, setConfig }: { config: HomepageConfig; setConfig: React.Dispatch<React.SetStateAction<HomepageConfig>> }) {
  const ab = config.announcementBanner;
  const setAb = (patch: Partial<AnnouncementBanner>) =>
    setConfig(c => ({ ...c, announcementBanner: c.announcementBanner ? { ...c.announcementBanner, ...patch } : null }));
  const create = () => setConfig(c => ({ ...c, announcementBanner: { id: 'ab1', text: '', ctaLabel: '', ctaHref: '', style: 'info', active: true } }));
  const remove = () => setConfig(c => ({ ...c, announcementBanner: null }));
  const ps = AB_STYLES.find(s => s.id === ab?.style) ?? AB_STYLES[0];

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Megaphone className="h-4 w-4 text-amber-400" /> Announcement Banner</p>
          <p className="mt-0.5 text-xs text-zinc-600">A top-of-page strip for launches, promos, or alerts.</p>
        </div>
        {ab && (
          <button onClick={remove} className="rounded-lg p-1.5 text-zinc-700 transition hover:bg-red-900/30 hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="p-5">
        {!ab ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-800/30 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800">
              <Megaphone className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">No active announcement banner</p>
              <p className="mt-0.5 text-xs text-zinc-600">Create one to show a coloured strip at the top of the homepage</p>
            </div>
            <button onClick={create} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400">
              <Plus className="h-4 w-4" /> Create Announcement
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <Toggle on={ab.active} onToggle={() => setAb({ active: !ab.active })} label="Active — show on homepage" />

            <div>
              <label className={label}>Announcement Text <span className="text-red-500 lowercase normal-case font-normal">*</span></label>
              <textarea value={ab.text} onChange={e => setAb({ text: e.target.value })}
                placeholder="🎉 Introducing DocSheets — your all-in-one collaborative spreadsheet. Try it free!"
                rows={2} className={`${inp} resize-none`} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>CTA Label</label>
                <input className={inp} value={ab.ctaLabel} onChange={e => setAb({ ctaLabel: e.target.value })} placeholder="Learn More" />
              </div>
              <div>
                <label className={label}>CTA Link</label>
                <input className={inp} type="url" value={ab.ctaHref} onChange={e => setAb({ ctaHref: e.target.value })} placeholder="https://…" />
              </div>
            </div>

            <div>
              <label className={label}>Style</label>
              <div className="flex flex-wrap gap-2">
                {AB_STYLES.map(s => (
                  <button key={s.id} type="button" onClick={() => setAb({ style: s.id })}
                    style={{ background: ab.style === s.id ? s.bg : undefined, borderColor: ab.style === s.id ? s.border : undefined, color: ab.style === s.id ? s.text : undefined }}
                    className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                      ab.style === s.id ? '' : 'border-zinc-700 bg-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    <span style={{ color: ab.style === s.id ? s.text : undefined }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {ab.text && (
              <div>
                <label className={label}>Preview</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, background: ps.bg, border: `1px solid ${ps.border}` }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: ps.text, lineHeight: 1.4 }}>{ab.text}</span>
                  {ab.ctaLabel && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: ps.text, border: `1px solid ${ps.border}`, borderRadius: 8, padding: '4px 12px', whiteSpace: 'nowrap' }}>{ab.ctaLabel}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Hero
════════════════════════════════════════════════════════════════════ */
function HeroPanel({ config, setHero, uploadingField, heroImgRef, onUpload }: {
  config: HomepageConfig; setHero: (k: keyof HomepageConfig['hero'], v: string | SlotWord[]) => void;
  uploadingField: string | null; heroImgRef: React.RefObject<HTMLInputElement>; onUpload: (f: File) => void;
}) {
  const words = config.hero.slotWords;
  const addWord = () => setHero('slotWords', [...words, { word: '', subtitle: '', color: '#f59e0b' }]);
  const updateWord = (i: number, patch: Partial<SlotWord>) =>
    setHero('slotWords', words.map((w, idx) => idx === i ? { ...w, ...patch } : w));
  const deleteWord = (i: number) => setHero('slotWords', words.filter((_, idx) => idx !== i));
  const moveWord = (i: number, dir: -1 | 1) => {
    const next = [...words]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setHero('slotWords', next);
  };

  return (
    <div className="space-y-4">
      {/* words */}
      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Type className="h-4 w-4 text-amber-400" /> Rotating Headline Words</p>
          <p className="mt-0.5 text-xs text-zinc-600">Slot-machine words that cycle in the hero. Add custom words to override defaults.</p>
        </div>
        <div className="space-y-2 p-4">
          {words.length === 0 && (
            <div className={infoBox}><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> Using 8 built-in default words. Add words below to override them.</div>
          )}
          {words.map((w, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-800/40 p-3">
              <GripVertical className="mt-2.5 h-4 w-4 flex-shrink-0 text-zinc-700" />
              <div className="flex-1 space-y-2">
                <input className={inp} value={w.word} onChange={e => updateWord(i, { word: e.target.value })} placeholder="Headline word" />
                <input className={inp} value={w.subtitle} onChange={e => updateWord(i, { subtitle: e.target.value })} placeholder="Subtitle for this word" />
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5 mt-2">
                <input type="color" value={w.color} onChange={e => updateWord(i, { color: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded-lg border border-zinc-700 bg-transparent p-0.5" />
                <button onClick={() => moveWord(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => moveWord(i, 1)} disabled={i === words.length - 1} className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => deleteWord(i)} className="rounded-lg p-1.5 text-zinc-700 transition hover:bg-red-900/30 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          <button onClick={addWord} className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200">
            <Plus className="h-3.5 w-3.5" /> Add Word
          </button>
        </div>
      </div>

      {/* CTAs */}
      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Type className="h-4 w-4 text-amber-400" /> CTA Button Labels</p>
          <p className="mt-0.5 text-xs text-zinc-600">Leave blank to use built-in defaults.</p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {([
            ['guestCtaPrimary',   'Guest Primary CTA',   'Get Started Free'],
            ['guestCtaSecondary', 'Guest Secondary CTA', 'See How It Works'],
            ['authCtaPrimary',    'Auth Primary CTA',    'New Document'],
            ['authCtaSecondary',  'Auth Secondary CTA',  'Open Workspace'],
          ] as [keyof HomepageConfig['hero'], string, string][]).map(([k, lbl, ph]) => (
            <div key={k}>
              <label className={label}>{lbl}</label>
              <input className={inp} value={config.hero[k] as string} onChange={e => setHero(k, e.target.value)} placeholder={ph} />
            </div>
          ))}
        </div>
      </div>

      {/* bg image */}
      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><ImageIcon className="h-4 w-4 text-amber-400" /> Background Image</p>
          <p className="mt-0.5 text-xs text-zinc-600">Leave empty to use the default hero background.</p>
        </div>
        <div className="p-5">
          {config.hero.backgroundImage ? (
            <div className="relative overflow-hidden rounded-xl border border-zinc-700" style={{ aspectRatio: '16/5' }}>
              <img src={config.hero.backgroundImage} alt="Hero bg" className="h-full w-full object-cover" />
              <button onClick={() => setHero('backgroundImage', '')}
                className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition hover:bg-black/90">
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          ) : (
            <button onClick={() => heroImgRef.current?.click()} disabled={uploadingField === 'hero.bg'}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-800/30 py-10 text-zinc-600 transition hover:border-amber-500/40 hover:bg-zinc-800/50 hover:text-zinc-500 disabled:opacity-60"
              style={{ aspectRatio: '16/5' }}>
              {uploadingField === 'hero.bg' ? <Loader2 className="h-6 w-6 animate-spin text-amber-500" /> : <ImageIcon className="h-6 w-6" />}
              <span className="text-sm font-medium">{uploadingField === 'hero.bg' ? 'Uploading…' : 'Click to upload background image'}</span>
            </button>
          )}
          <input ref={heroImgRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Navigation
════════════════════════════════════════════════════════════════════ */
function NavPanel({ config, setNav, uploadingField, logoFileRef, onUploadLogo }: {
  config: HomepageConfig; setNav: <K extends keyof HomepageConfig['nav']>(k: K, v: HomepageConfig['nav'][K]) => void;
  uploadingField: string | null; logoFileRef: React.RefObject<HTMLInputElement>; onUploadLogo: (f: File) => void;
}) {
  const addLink = () => setNav('links', [...config.nav.links, { id: `link_${config.nav.links.length}`, label: '', href: '', visible: true, order: config.nav.links.length }]);
  const updateLink = (i: number, patch: Partial<NavLink>) => setNav('links', config.nav.links.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const deleteLink = (i: number) => setNav('links', config.nav.links.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Navigation className="h-4 w-4 text-amber-400" /> Logo & Branding</p>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className={label}>Logo Text</label>
            <input className={inp} value={config.nav.logoText} onChange={e => setNav('logoText', e.target.value)} placeholder="docrud" />
          </div>
          <div>
            <label className={label}>Logo Image (overrides text)</label>
            {config.nav.logoUrl ? (
              <div className="flex items-center gap-3">
                <img src={config.nav.logoUrl} alt="Logo" className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 object-contain px-2" />
                <button onClick={() => setNav('logoUrl', '')} className="text-xs text-red-500 transition hover:text-red-400">Remove</button>
              </div>
            ) : (
              <button onClick={() => logoFileRef.current?.click()} disabled={uploadingField === 'nav.logo'}
                className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-800/30 px-4 py-2.5 text-xs font-medium text-zinc-500 transition hover:border-amber-500/40 hover:text-zinc-400 disabled:opacity-60">
                {uploadingField === 'nav.logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {uploadingField === 'nav.logo' ? 'Uploading…' : 'Upload logo image'}
              </button>
            )}
            <input ref={logoFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onUploadLogo(f); e.target.value = ''; }} />
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="text-sm font-semibold text-white">Auth Buttons</p>
        </div>
        <div className="space-y-4 p-5">
          <Toggle on={config.nav.showSignIn} onToggle={() => setNav('showSignIn', !config.nav.showSignIn)} label="Show Sign In button" />
          <Toggle on={config.nav.showSignUp} onToggle={() => setNav('showSignUp', !config.nav.showSignUp)} label="Show Sign Up button" />
        </div>
      </div>

      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Navigation className="h-4 w-4 text-amber-400" /> Custom Nav Links</p>
          <p className="mt-0.5 text-xs text-zinc-600">Leave empty to use built-in navigation. Custom links override all defaults.</p>
        </div>
        <div className="space-y-2.5 p-5">
          {config.nav.links.length === 0 && (
            <div className={infoBox}><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> Using built-in nav links. Add custom links to override.</div>
          )}
          {config.nav.links.map((link, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/40 p-2.5">
              <GripVertical className="h-4 w-4 flex-shrink-0 text-zinc-700" />
              <input className={`${inp} flex-1`} style={{ padding: '6px 12px', fontSize: 13 }} value={link.label} onChange={e => updateLink(i, { label: e.target.value })} placeholder="Label" />
              <input className={`${inp} flex-1`} style={{ padding: '6px 12px', fontSize: 13 }} value={link.href}  onChange={e => updateLink(i, { href: e.target.value })}  placeholder="/path" />
              <Toggle on={link.visible} onToggle={() => updateLink(i, { visible: !link.visible })} />
              <button onClick={() => deleteLink(i)} className="rounded-lg p-1.5 text-zinc-700 transition hover:bg-red-900/30 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button onClick={addLink} className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200">
            <Plus className="h-3.5 w-3.5" /> Add Link
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Feature Cards
════════════════════════════════════════════════════════════════════ */
function FeatureCardsPanel({ config, setConfig }: { config: HomepageConfig; setConfig: React.Dispatch<React.SetStateAction<HomepageConfig>> }) {
  const setIds = (aud: 'guestFeatureIds' | 'defaultFeatureIds', ids: string[]) =>
    setConfig(c => ({ ...c, featureCards: { ...c.featureCards, [aud]: ids } }));
  const toggle = (aud: 'guestFeatureIds' | 'defaultFeatureIds', id: string) => {
    const cur = config.featureCards[aud];
    setIds(aud, cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 4 ? [...cur, id] : cur);
  };

  return (
    <div className={card}>
      <div className="border-b border-zinc-800 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><Globe className="h-4 w-4 text-amber-400" /> Feature Cards (Quick-Action 2×2 Grid)</p>
        <p className="mt-0.5 text-xs text-zinc-600">Choose up to 4 features per audience. Leave empty to use platform defaults.</p>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-2">
        {(['guestFeatureIds', 'defaultFeatureIds'] as const).map(aud => {
          const lbl = aud === 'guestFeatureIds' ? 'Guest / Logged-Out Users' : 'Logged-In Users';
          const sel = config.featureCards[aud];
          return (
            <div key={aud} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{lbl}</p>
              <div className="min-h-[40px] flex flex-wrap gap-1.5 rounded-xl border border-zinc-800 bg-zinc-800/40 p-2.5">
                {sel.length === 0
                  ? <span className="text-xs italic text-zinc-700">Using platform defaults</span>
                  : sel.map(id => {
                      const f = ALL_FEATURE_IDS.find(x => x.id === id);
                      return f ? (
                        <span key={id} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 px-2.5 py-1 text-xs font-medium text-amber-400">
                          {f.label}
                          <button onClick={() => toggle(aud, id)} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
                        </span>
                      ) : null;
                    })
                }
              </div>
              {sel.length < 4 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_FEATURE_IDS.filter(f => !sel.includes(f.id)).map(f => (
                    <button key={f.id} onClick={() => toggle(aud, f.id)}
                      className="rounded-xl border border-zinc-800 bg-zinc-800/40 px-2.5 py-2 text-left text-xs font-medium text-zinc-500 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-300">
                      + {f.label}
                    </button>
                  ))}
                </div>
              )}
              {sel.length > 0 && (
                <button onClick={() => setIds(aud, [])} className="text-xs text-zinc-700 transition hover:text-zinc-500">Reset to defaults</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Content Discovery
════════════════════════════════════════════════════════════════════ */
function ContentDiscoveryPanel({ config, setConfig }: { config: HomepageConfig; setConfig: React.Dispatch<React.SetStateAction<HomepageConfig>> }) {
  const tabs = config.contentDiscovery.tabs;
  const setTabs = (next: ContentTab[]) => setConfig(c => ({ ...c, contentDiscovery: { tabs: next } }));
  const updateTab = (i: number, patch: Partial<ContentTab>) => setTabs(tabs.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...tabs]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]; setTabs(next);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Eye className="h-4 w-4 text-amber-400" /> Content Discovery Tabs</p>
          <p className="mt-0.5 text-xs text-zinc-600">Show, hide, or reorder the content category pills.</p>
        </div>
        {tabs.length > 0 && <span className="text-xs text-zinc-600">{tabs.filter(t => t.visible).length}/{tabs.length} visible</span>}
      </div>
      <div className="p-5 space-y-3">
        {tabs.length === 0 ? (
          <div className="space-y-4">
            <div className={infoBox}><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> Using all 20 built-in content tabs. Click "Customise" to take control.</div>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_TABS.map(t => (
                <span key={t.id} className="rounded-lg border border-zinc-800 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-500">{t.label}</span>
              ))}
            </div>
            <button onClick={() => setTabs([...DEFAULT_TABS])} className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-500/25 px-3.5 py-2 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/25">
              Customise Tabs
            </button>
          </div>
        ) : (
          <>
            <div className="max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
              {tabs.map((t, i) => (
                <div key={t.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${t.visible ? 'border-zinc-800 bg-zinc-800/40' : 'border-zinc-800/50 bg-zinc-900 opacity-50'}`}>
                  <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-zinc-700" />
                  <input className={`${inp} flex-1`} style={{ padding: '5px 10px', fontSize: 12 }} value={t.label} onChange={e => updateTab(i, { label: e.target.value })} />
                  <Toggle on={t.visible} onToggle={() => updateTab(i, { visible: !t.visible })} />
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-zinc-700 transition hover:text-zinc-400 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === tabs.length - 1} className="rounded p-0.5 text-zinc-700 transition hover:text-zinc-400 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setTabs(tabs.filter((_, idx) => idx !== i))} className="rounded p-0.5 text-zinc-700 transition hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setTabs([...tabs, { id: `custom_${tabs.length}`, label: 'New Tab', visible: true, order: tabs.length }])}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200">
                <Plus className="h-3.5 w-3.5" /> Add Tab
              </button>
              <button onClick={() => setTabs([])} className="rounded-xl border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-600 transition hover:text-zinc-400">
                Reset to Defaults
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Footer
════════════════════════════════════════════════════════════════════ */
function FooterPanel({ config, setConfig }: { config: HomepageConfig; setConfig: React.Dispatch<React.SetStateAction<HomepageConfig>> }) {
  const footer = config.footer;
  const setFooter = (patch: Partial<HomepageConfig['footer']>) => setConfig(c => ({ ...c, footer: { ...c.footer, ...patch } }));
  const [openCol, setOpenCol] = useState<string | null>(null);

  const isCustCols   = footer.columns.length > 0;
  const isCustBadges = footer.securityBadges.length > 0;
  const cols  = isCustCols   ? footer.columns        : DEFAULT_FOOTER_COLS;
  const badges = isCustBadges ? footer.securityBadges : DEFAULT_BADGES;

  const updateCol  = (id: string, patch: Partial<FooterColumn>) => setFooter({ columns: cols.map(c => c.id === id ? { ...c, ...patch } : c) });
  const updateLink = (colId: string, li: number, patch: Partial<FooterLink>) =>
    updateCol(colId, { links: (cols.find(c => c.id === colId)?.links ?? []).map((l, idx) => idx === li ? { ...l, ...patch } : l) });
  const addLink    = (colId: string) => updateCol(colId, { links: [...(cols.find(c => c.id === colId)?.links ?? []), { label: '', href: '', visible: true }] });
  const deleteLink = (colId: string, li: number) => updateCol(colId, { links: (cols.find(c => c.id === colId)?.links ?? []).filter((_, idx) => idx !== li) });
  const updateBadge = (i: number, patch: Partial<{ label: string; visible: boolean }>) =>
    setFooter({ securityBadges: badges.map((b, idx) => idx === i ? { ...b, ...patch } : b) });

  return (
    <div className="space-y-4">
      {/* branding */}
      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><AlignLeft className="h-4 w-4 text-amber-400" /> Footer Branding</p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {([['tagline','Tagline','The future of document creation'],['madeIn','Made In','India'],['copyrightEntity','Copyright Entity','Corescent Technologies Private Limited']] as [keyof typeof footer, string, string][]).map(([k, lbl, ph]) => (
            <div key={k}>
              <label className={label}>{lbl}</label>
              <input className={inp} value={(footer[k] as string) ?? ''} onChange={e => setFooter({ [k]: e.target.value })} placeholder={ph} />
            </div>
          ))}
        </div>
      </div>

      {/* columns */}
      <div className={card}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <p className="text-sm font-semibold text-white">Footer Columns & Links</p>
          {!isCustCols && (
            <button onClick={() => setFooter({ columns: JSON.parse(JSON.stringify(DEFAULT_FOOTER_COLS)) })}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-white">
              Customise
            </button>
          )}
        </div>
        {!isCustCols && <div className={`m-4 ${infoBox}`}><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> Using built-in footer columns. Click "Customise" to edit them.</div>}
        <div className="space-y-1.5 p-4">
          {cols.map(col => (
            <div key={col.id} className="overflow-hidden rounded-xl border border-zinc-800">
              <button type="button" onClick={() => setOpenCol(openCol === col.id ? null : col.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/40 transition">
                <span className="text-sm font-semibold text-zinc-300">{col.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-700">{col.links.filter(l => l.visible).length}/{col.links.length}</span>
                  {openCol === col.id ? <ChevronUp className="h-4 w-4 text-zinc-600" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
                </div>
              </button>
              {openCol === col.id && (
                <div className="space-y-1.5 border-t border-zinc-800 p-3">
                  {col.links.map((link, li) => (
                    <div key={li} className="flex items-center gap-2">
                      {isCustCols
                        ? <>
                            <input className={`${inp} flex-1`} style={{ padding: '6px 10px', fontSize: 12 }} value={link.label} onChange={e => updateLink(col.id, li, { label: e.target.value })} placeholder="Label" />
                            <input className={`${inp} flex-1`} style={{ padding: '6px 10px', fontSize: 12 }} value={link.href}  onChange={e => updateLink(col.id, li, { href: e.target.value })}  placeholder="/path" />
                          </>
                        : <span className="flex-1 text-sm text-zinc-400">{link.label}</span>
                      }
                      <Toggle on={link.visible} onToggle={() => isCustCols ? updateLink(col.id, li, { visible: !link.visible }) : undefined} />
                      {isCustCols && <button onClick={() => deleteLink(col.id, li)} className="rounded p-1 text-zinc-700 transition hover:text-red-400"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                  {isCustCols && (
                    <button onClick={() => addLink(col.id)} className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-300">
                      <Plus className="h-3 w-3" /> Add Link
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {isCustCols && (
            <button onClick={() => setFooter({ columns: [] })} className="text-xs text-zinc-700 transition hover:text-zinc-500">Reset to defaults</button>
          )}
        </div>
      </div>

      {/* badges */}
      <div className={card}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <p className="text-sm font-semibold text-white">Security Badges</p>
          {!isCustBadges && (
            <button onClick={() => setFooter({ securityBadges: JSON.parse(JSON.stringify(DEFAULT_BADGES)) })}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-white">
              Customise
            </button>
          )}
        </div>
        <div className="space-y-1.5 p-4">
          {badges.map((b, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-800/40 px-3 py-2.5">
              {isCustBadges
                ? <input className={`${inp} flex-1`} style={{ padding: '5px 10px', fontSize: 12 }} value={b.label} onChange={e => updateBadge(i, { label: e.target.value })} />
                : <span className="flex-1 text-sm text-zinc-400">{b.label}</span>
              }
              <Toggle on={b.visible} onToggle={() => updateBadge(i, { visible: !b.visible })} />
              {isCustBadges && <button onClick={() => setFooter({ securityBadges: badges.filter((_, idx) => idx !== i) })} className="rounded p-1 text-zinc-700 transition hover:text-red-400"><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
          {isCustBadges && (
            <div className="flex gap-2">
              <button onClick={() => setFooter({ securityBadges: [...badges, { label: 'New Badge', visible: true }] })} className="flex items-center gap-1 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-400 transition hover:text-zinc-200"><Plus className="h-3 w-3" /> Add Badge</button>
              <button onClick={() => setFooter({ securityBadges: [] })} className="rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-600 transition hover:text-zinc-400">Reset</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SEO
════════════════════════════════════════════════════════════════════ */
function SeoPanel({ config, setConfig }: { config: HomepageConfig; setConfig: React.Dispatch<React.SetStateAction<HomepageConfig>> }) {
  const titleLen = config.seoTitle.length;
  const descLen  = config.seoDescription.length;
  const displayTitle = config.seoTitle || 'docrud — Create, Sign & Publish Documents';
  const displayDesc  = config.seoDescription || 'The all-in-one platform for creating, signing, and publishing professional documents. Built in India.';

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Globe className="h-4 w-4 text-amber-400" /> SEO & Meta Tags</p>
          <p className="mt-0.5 text-xs text-zinc-600">Override the homepage title and meta description. Leave blank to use platform defaults.</p>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={label} style={{ margin: 0 }}>Page Title</label>
              <span className={`text-xs ${titleLen > 60 ? 'text-amber-400 font-semibold' : 'text-zinc-700'}`}>{titleLen}/70</span>
            </div>
            <input className={inp} value={config.seoTitle}
              onChange={e => setConfig(c => ({ ...c, seoTitle: e.target.value.slice(0, 70) }))}
              placeholder="docrud — Create, Sign & Publish Documents" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={label} style={{ margin: 0 }}>Meta Description</label>
              <span className={`text-xs ${descLen > 155 ? 'text-amber-400 font-semibold' : 'text-zinc-700'}`}>{descLen}/160</span>
            </div>
            <textarea className={`${inp} resize-none`} rows={3} value={config.seoDescription}
              onChange={e => setConfig(c => ({ ...c, seoDescription: e.target.value.slice(0, 160) }))}
              placeholder="The all-in-one platform for creating, signing, and publishing professional documents. Built in India." />
          </div>

          {/* Google snippet preview */}
          <div>
            <label className={label}>Search Result Preview</label>
            <div className="rounded-xl border border-zinc-700 bg-white p-4">
              <div className="mb-1 flex items-center gap-1.5">
                <div className="h-4 w-4 rounded-full bg-slate-200" />
                <span className="text-xs text-slate-500">docrud.com</span>
              </div>
              <p className="text-base font-medium leading-snug text-blue-700 hover:underline cursor-pointer line-clamp-1">{displayTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">{displayDesc}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`${infoBox}`}>
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        Title and description are injected into Next.js metadata. Open Graph and Twitter card tags are auto-generated from the same values. Changes take effect on next page load after saving.
      </div>
    </div>
  );
}
