'use client';

/**
 * Super Admin → Promotions.
 *
 * ═══ WHY IT IS ITS OWN SCREEN ═══
 *
 * The announcement bar lived nine panels down inside the Homepage screen,
 * between "Top Companies" and "Hero Banner". It is not homepage layout — it is
 * a message to everybody, often a time-critical one, and the person writing it
 * at 2am is not there to arrange the hero. This screen is for the things the
 * product SAYS rather than how it is arranged, and the announcement bar is the
 * first of them.
 *
 * ═══ IT WRITES ONE FIELD ═══
 *
 * The bar is stored in the homepage config, because that is where it already
 * was and moving the storage would strand every banner already written. This
 * screen therefore POSTs `{ config: { announcementBanner } }` and nothing else:
 * saveHomepageConfig merges over the current config, so an admin editing an
 * announcement here can never clobber the hero, the nav or the footer that
 * somebody has open on the other screen.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Check, Info, Loader2, Megaphone, Plus, RefreshCw, Save, Trash2, X,
} from 'lucide-react';
import { card, infoBox, inp, label, Toggle } from '@/components/HomepageCommandCenter';

/* Mirrors lib/server/homepage-config.ts. Kept as a local structural type
   rather than an import because this file's HomepageConfig is its own editing
   shape — but the FIELDS must match, or the server normaliser drops what this
   screen writes. */
type AnnouncementKind = 'announcement' | 'alert' | 'reminder';
type AnnouncementTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'promo';
type AnnouncementBanner = {
  id: string;
  kind: AnnouncementKind;
  text: string;
  tone: AnnouncementTone;
  ctaLabel: string; ctaHref: string;
  ctaLabel2: string; ctaHref2: string;
  dismissible: boolean;
  active: boolean;
};

/* The six tones, with the SAME channels the bar itself uses
   (components/home/announcement-bar.css). The preview below is built from
   these, so what an admin approves here is what a visitor sees. */
const AB_TONES = [
  { id: 'neutral' as const, label: 'Neutral', accent: '226,232,240', fg: 'rgba(255,255,255,0.94)',  dot: 'bg-slate-200' },
  { id: 'info'    as const, label: 'Info',    accent: '96,150,240',  fg: 'rgba(198,219,255,0.96)',  dot: 'bg-blue-400' },
  { id: 'success' as const, label: 'Success', accent: '52,199,123',  fg: 'rgba(199,245,220,0.96)',  dot: 'bg-emerald-400' },
  { id: 'warning' as const, label: 'Warning', accent: '240,180,80',  fg: 'rgba(253,231,190,0.96)',  dot: 'bg-amber-400' },
  { id: 'danger'  as const, label: 'Danger',  accent: '238,110,110', fg: 'rgba(255,213,213,0.96)',  dot: 'bg-rose-400' },
  { id: 'promo'   as const, label: 'Promo',   accent: '168,130,240', fg: 'rgba(228,213,255,0.96)',  dot: 'bg-purple-400' },
];

/* What the message IS, which is separate from how it looks: an alert can be
   calm and an announcement can be urgent. */
const AB_KINDS = [
  { id: 'announcement' as const, label: 'Announcement', help: 'Something new — a launch, a change, news.' },
  { id: 'alert'        as const, label: 'Alert',        help: 'Something happening now that people must know.' },
  { id: 'reminder'     as const, label: 'Reminder',     help: 'Something coming up, or something still to do.' },
];

/* 'announcement' is gone from here: the bar is edited in Super Admin →
   Promotions, which writes the same config store through the same endpoint.
   It was never homepage LAYOUT, and it was buried nine panels down a screen
   nobody opens to write an alert. */

type Panel = 'announcement';

const PANELS: { id: Panel; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'announcement', label: 'Announcement Bar', icon: <Megaphone className="h-4 w-4" />, desc: 'The strip under the navigation' },
];

export default function PromotionsCommandCenter() {
  const [banner, setBanner] = useState<AnnouncementBanner | null>(null);
  const [savedBanner, setSavedBanner] = useState<string>('null');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [panel, setPanel] = useState<Panel>('announcement');

  const flash = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/homepage-config', { cache: 'no-store' });
      const d = await r.json() as { config?: { announcementBanner?: AnnouncementBanner | null } };
      const ab = d.config?.announcementBanner ?? null;
      setBanner(ab);
      setSavedBanner(JSON.stringify(ab));
    } catch { flash(false, 'Could not load the announcement'); }
    setLoading(false);
  }, [flash]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/super-admin/homepage-config', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        /* Only this field. Everything else on the homepage config is left to
           whoever is editing it. */
        body: JSON.stringify({ config: { announcementBanner: banner } }),
      });
      const d = await r.json() as { config?: { announcementBanner?: AnnouncementBanner | null }; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Save failed');
      /* The server's version, not the one just sent: the normaliser may have
         dropped a link it could not vouch for, and this screen should show
         what is actually stored rather than what was typed. */
      const ab = d.config?.announcementBanner ?? null;
      setBanner(ab);
      setSavedBanner(JSON.stringify(ab));
      flash(true, ab?.active ? 'Saved — the bar is live on the homepage' : 'Saved');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Save failed'); }
    setSaving(false);
  };

  const dirty = JSON.stringify(banner) !== savedBanner;

  /* What a visitor would see right now, stated plainly. An announcement that
     silently does not appear is the failure this screen exists to prevent. */
  const status = (() => {
    if (dirty) return { tone: 'warn' as const, text: 'Unsaved changes — nothing on the homepage has changed yet.' };
    if (!banner) return { tone: 'off' as const, text: 'No announcement. The strip under the navigation is hidden.' };
    if (!banner.active) return { tone: 'off' as const, text: 'Saved but switched off. Turn on Active to show it.' };
    if (!banner.text.trim()) return { tone: 'warn' as const, text: 'No message written, so nothing renders.' };
    return { tone: 'live' as const, text: 'Live on the homepage now, under the navigation bar.' };
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-600">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">Promotions</p>
          <p className="mt-0.5 text-xs text-zinc-600">Announcements, alerts and reminders shown across the product.</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              msg.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {msg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {msg.text}
            </span>
          )}
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Reload
          </button>
          <button onClick={() => void save()} disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>

      {/* ── Status ──
          Says what a visitor sees, not what is in the form. */}
      <div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-medium ${
        status.tone === 'live' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : status.tone === 'warn' ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
        : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${
          status.tone === 'live' ? 'bg-emerald-400' : status.tone === 'warn' ? 'bg-amber-400' : 'bg-zinc-700'}`} />
        {status.text}
        <a href="/" target="_blank" rel="noreferrer" className="ml-auto shrink-0 underline underline-offset-2 hover:text-white">
          Open the homepage
        </a>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* ── The sidebar ── */}
        <div className="flex gap-2 overflow-x-auto lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {PANELS.map(p => (
            <button key={p.id} onClick={() => setPanel(p.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition lg:w-full ${
                panel === p.id
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'}`}>
              {p.icon}
              <span className="min-w-0">
                <span className="block">{p.label}</span>
                <span className="block text-[11px] font-normal text-zinc-600">{p.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          {panel === 'announcement' && <AnnouncementPanel banner={banner} setBanner={setBanner} />}
        </div>
      </div>
    </div>
  );
}

function AnnouncementPanel({ banner, setBanner }: {
  banner: AnnouncementBanner | null;
  setBanner: React.Dispatch<React.SetStateAction<AnnouncementBanner | null>>;
}) {
  const ab = banner;
  const setAb = (patch: Partial<AnnouncementBanner>) =>
    setBanner(b => (b ? { ...b, ...patch } : b));
  const create = () => setBanner({
    id: `ab-${Date.now().toString(36)}`,
    kind: 'announcement', text: '', tone: 'neutral',
    ctaLabel: '', ctaHref: '', ctaLabel2: '', ctaHref2: '',
    dismissible: true, active: true,
  });
  const remove = () => setBanner(null);
  /* A new id is a new message as far as every browser is concerned, so the
     people who closed the last one see this one. The only way back from a
     dismissal, and the reason the id is not derived from the text. */
  const reshow = () => setAb({ id: `ab-${Date.now().toString(36)}` });

  const tone = AB_TONES.find(t => t.id === ab?.tone) ?? AB_TONES[0];
  const kind = AB_KINDS.find(k => k.id === ab?.kind) ?? AB_KINDS[0];

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Megaphone className="h-4 w-4 text-amber-400" /> Announcement Bar</p>
          <p className="mt-0.5 text-xs text-zinc-600">The strip under the navigation. Alerts, reminders and announcements.</p>
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
              <p className="text-sm font-medium text-zinc-400">No announcement bar</p>
              <p className="mt-0.5 text-xs text-zinc-600">Create one to show a strip under the navigation</p>
            </div>
            <button onClick={create} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400">
              <Plus className="h-4 w-4" /> Create Announcement
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <Toggle on={ab.active} onToggle={() => setAb({ active: !ab.active })} label="Active — show the bar" />

            {/* ── What kind of message ── */}
            <div>
              <label className={label}>Type</label>
              <div className="flex flex-wrap gap-2">
                {AB_KINDS.map(k => (
                  <button key={k.id} type="button" onClick={() => setAb({ kind: k.id })}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                      ab.kind === k.id
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}>
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-zinc-600">{kind.help}</p>
            </div>

            <div>
              <label className={label}>Message <span className="text-red-500 lowercase normal-case font-normal">*</span></label>
              <textarea value={ab.text} onChange={e => setAb({ text: e.target.value })}
                placeholder="Scheduled maintenance on Sunday 02:00–04:00 IST. Documents stay available; publishing is paused."
                rows={2} className={`${inp} resize-none`} />
              <p className="mt-1.5 text-xs text-zinc-600">{ab.text.trim().length}/400 · one or two lines reads best</p>
            </div>

            {/* ── Colour ── */}
            <div>
              <label className={label}>Colour</label>
              <div className="flex flex-wrap gap-2">
                {AB_TONES.map(t => (
                  <button key={t.id} type="button" onClick={() => setAb({ tone: t.id })}
                    style={ab.tone === t.id ? {
                      background: `rgba(${t.accent},0.16)`,
                      borderColor: `rgba(${t.accent},0.45)`,
                      color: t.fg,
                    } : undefined}
                    className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                      ab.tone === t.id ? '' : 'border-zinc-700 bg-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}>
                    <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── The buttons on it ── */}
            <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Buttons</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label}>Primary label</label>
                  <input className={inp} value={ab.ctaLabel} onChange={e => setAb({ ctaLabel: e.target.value })} placeholder="Read the details" />
                </div>
                <div>
                  <label className={label}>Primary link</label>
                  <input className={inp} value={ab.ctaHref} onChange={e => setAb({ ctaHref: e.target.value })} placeholder="/status  or  https://…" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label}>Secondary label</label>
                  <input className={inp} value={ab.ctaLabel2} onChange={e => setAb({ ctaLabel2: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <label className={label}>Secondary link</label>
                  <input className={inp} value={ab.ctaHref2} onChange={e => setAb({ ctaHref2: e.target.value })} placeholder="/help" />
                </div>
              </div>

              {/* Said here rather than discovered later: the server drops an
                  href it cannot vouch for, and a button that silently vanished
                  would look like a bug in this screen. */}
              <div className={infoBox}>
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                A button appears only when it has both a label and a link. Links must be a path on this site (/jobs) or an https address.
              </div>
            </div>

            {/* ── Dismissal ── */}
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-800/30 p-4">
              <Toggle on={ab.dismissible} onToggle={() => setAb({ dismissible: !ab.dismissible })}
                label="Let people close it" />
              <p className="text-xs text-zinc-600">
                {ab.dismissible
                  ? 'Closing hides this message for that person, in that browser. Editing the wording does not bring it back for them.'
                  : 'The bar has no close button. Use this only for something everyone has to see.'}
              </p>
              {ab.dismissible && (
                <button onClick={reshow}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white">
                  <RefreshCw className="h-3.5 w-3.5" /> Show again to everyone
                </button>
              )}
            </div>

            {/* ── Preview ──
                Built from the same channels the real bar uses, so this is what
                gets shipped rather than an impression of it. */}
            {ab.text.trim() && (
              <div>
                <label className={label}>Preview</label>
                <div
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 12,
                    overflow: 'hidden', padding: '11px 12px 11px 15px', borderRadius: 16,
                    border: `1px solid rgba(${tone.accent},0.16)`,
                    background: `linear-gradient(180deg, rgba(${tone.accent},0.11), rgba(${tone.accent},0.05)), linear-gradient(180deg, rgba(14,14,18,0.9), rgba(10,10,13,0.9))`,
                  }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `rgba(${tone.accent},0.85)` }} />
                  <span style={{
                    flex: '0 0 auto', borderRadius: 999, padding: '4px 10px',
                    border: `1px solid rgba(${tone.accent},0.30)`, background: `rgba(${tone.accent},0.13)`,
                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: tone.fg,
                  }}>{kind.label}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45, color: 'rgba(255,255,255,0.88)' }}>{ab.text}</span>
                  {ab.ctaLabel2 && ab.ctaHref2 && (
                    <span style={{ flex: '0 0 auto', height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.13)', background: 'rgba(255,255,255,0.05)', fontSize: 12, fontWeight: 650, color: 'rgba(255,255,255,0.78)' }}>{ab.ctaLabel2}</span>
                  )}
                  {ab.ctaLabel && ab.ctaHref && (
                    <span style={{ flex: '0 0 auto', height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 13px', borderRadius: 999, border: `1px solid rgba(${tone.accent},0.42)`, background: `rgba(${tone.accent},0.20)`, fontSize: 12, fontWeight: 650, color: tone.fg }}>{ab.ctaLabel}</span>
                  )}
                  {ab.dismissible && <X className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

