'use client';

/**
 * Superadmin — sponsored campaigns and feed configuration.
 *
 * Approval is mandatory: a paid advertiser campaign only becomes servable when
 * approved here, and the server refuses to approve anything unpaid. Legacy
 * banners appear read-only and continue to be edited in the Ad Banners tab.
 */

import { useCallback, useEffect, useState } from 'react';

type Ad = {
  id: string; ownerId: string; ownerName?: string; advertiserType: string;
  title: string; imageUrl: string; durationDays: number; feeInPaise: number;
  paymentStatus: string; status: string; rejectionReason?: string;
  impressions: number; clicks: number; ctr: number;
  startAt?: string; endAt?: string; createdAt: string; legacy?: boolean;
  targetDomain?: string[]; targetSkills?: string[]; targetLocation?: string[];
};

type Config = {
  people: { enabled: boolean; maxCards: number; mutualWeight: number; interestWeight: number; skillWeight: number; domainWeight: number; locationWeight: number; discoveryEnabled: boolean };
  jobs: { enabled: boolean; maxCards: number; domainWeight: number; skillWeight: number; locationWeight: number; recencyWeight: number };
  ads: { enabled: boolean; minGap: number; maxGap: number; maxPerFeed: number; targetingEnabled: boolean };
  composition: { minLeadPosts: number; minModuleGap: number; maxModulesPerPage: number };
  publication: { maxChars: number };
};

const CARD = 'rounded-xl border border-white/10 bg-white/[0.03] p-4';
const NUM = 'h-9 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[13px] text-white outline-none focus:border-white/25';
const BTN = 'rounded-lg px-3 py-1.5 text-[12px] font-semibold transition';

export default function SponsoredAdsTab() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  /* Create-modal state. The list/config flow above is unchanged. */
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([
      fetch('/api/super-admin/ads').then(r => r.ok ? r.json() : { ads: [] }).catch(() => ({ ads: [] })),
      fetch('/api/super-admin/feed-config').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setAds(Array.isArray(a.ads) ? a.ads : []);
    if (c && c.config) setConfig(c.config);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (adId: string, action: string, reason?: string) => {
    setBusy(adId); setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/ads/${adId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error || 'Action failed.');
      await load();
    } finally { setBusy(null); }
  };

  const saveConfig = async () => {
    if (!config) return;
    setBusy('config'); setMsg(null);
    try {
      const res = await fetch('/api/super-admin/feed-config', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error || 'Could not save configuration.');
      else { setConfig(d.config); setMsg('Configuration saved.'); }
    } finally { setBusy(null); }
  };

  const setC = (group: keyof Config, key: string, value: number | boolean) =>
    setConfig(c => (c ? { ...c, [group]: { ...(c[group] as object), [key]: value } } as Config : c));

  const pending = ads.filter(a => a.status === 'pending_approval');
  const rest = ads.filter(a => a.status !== 'pending_approval');

  const row = (ad: Ad) => (
    <div key={ad.id} className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] py-3 last:border-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ad.imageUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white">{ad.title}</p>
        <p className="text-[11.5px] text-white/45">
          {ad.legacy ? 'Legacy banner' : (ad.advertiserType === 'superadmin' ? 'House' : (ad.ownerName || 'Advertiser'))}
          {' · '}{ad.status}{' · payment: '}{ad.paymentStatus}
          {!ad.legacy ? ` · ₹${(ad.feeInPaise / 100).toLocaleString()} · ${ad.durationDays}d` : ''}
        </p>
        <p className="text-[11px] text-white/30">
          {ad.impressions.toLocaleString()} impr · {ad.clicks.toLocaleString()} clicks · {ad.ctr}% CTR
          {ad.endAt ? ` · ends ${new Date(ad.endAt).toLocaleDateString()}` : ''}
        </p>
        {ad.rejectionReason ? <p className="text-[11px] text-rose-300/70">Rejected: {ad.rejectionReason}</p> : null}
      </div>
      {!ad.legacy && (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {ad.status === 'pending_approval' && (
            <button disabled={busy === ad.id} onClick={() => act(ad.id, 'approve')}
              className={`${BTN} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`}>Approve</button>
          )}
          {['pending_approval', 'active'].includes(ad.status) && (
            <button disabled={busy === ad.id}
              onClick={() => act(ad.id, 'reject', window.prompt('Reason for rejection?') || undefined)}
              className={`${BTN} bg-rose-500/15 text-rose-300 hover:bg-rose-500/25`}>Reject</button>
          )}
          {ad.status === 'active' && (
            <button disabled={busy === ad.id} onClick={() => act(ad.id, 'disable')}
              className={`${BTN} bg-white/10 text-white/70 hover:bg-white/20`}>Disable</button>
          )}
          {['disabled', 'rejected'].includes(ad.status) && (
            <button disabled={busy === ad.id} onClick={() => act(ad.id, 'reactivate')}
              className={`${BTN} bg-white/10 text-white/70 hover:bg-white/20`}>Reactivate</button>
          )}
        </div>
      )}
    </div>
  );

  const numField = (label: string, value: number, onChange: (n: number) => void) => (
    <label className="block">
      <span className="mb-1 block text-[11px] text-white/45">{label}</span>
      <input type="number" className={NUM} value={value} onChange={e => onChange(Number(e.target.value) || 0)} />
    </label>
  );
  const toggle = (label: string, value: boolean, onChange: (b: boolean) => void) => (
    <label className="flex items-center gap-2 text-[12.5px] text-white/70">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} /> {label}
    </label>
  );

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-[12.5px] text-white/70">{msg}</p>}

      {/* Create — wired to the existing POST /api/super-admin/ads. The old tab
          only moderated, so a superadmin had no way to reach the house-ad
          endpoint that already existed. */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Sponsored Ads</h2>
          <p className="text-[11.5px] text-white/40">Create house ads and moderate advertiser campaigns.</p>
        </div>
        <button
          type="button"
          onClick={() => { setMsg(null); setCreateOpen(true); }}
          className={`${BTN} shrink-0 bg-white/[0.10] text-white hover:bg-white/[0.16] border border-white/15`}
        >
          + Add Advertisement
        </button>
      </div>

      <div className={CARD}>
        <h3 className="mb-1 text-[14px] font-semibold text-white">Awaiting approval ({pending.length})</h3>
        <p className="mb-3 text-[11.5px] text-white/40">A paid campaign stays here until approved. Payment alone never publishes an ad.</p>
        {pending.length === 0 ? <p className="text-[12.5px] text-white/35">Nothing waiting.</p> : pending.map(row)}
      </div>

      <div className={CARD}>
        <h3 className="mb-3 text-[14px] font-semibold text-white">All campaigns ({rest.length})</h3>
        {rest.length === 0 ? <p className="text-[12.5px] text-white/35">No campaigns yet.</p> : rest.map(row)}
      </div>

      {config && (
        <div className={CARD}>
          <h3 className="mb-1 text-[14px] font-semibold text-white">Feed &amp; recommendation configuration</h3>
          <p className="mb-4 text-[11.5px] text-white/40">Stored server-side. The feed and rankers read these at request time — no deploy needed.</p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">People</p>
              {toggle('Enabled', config.people.enabled, v => setC('people', 'enabled', v))}
              {numField('Max cards', config.people.maxCards, v => setC('people', 'maxCards', v))}
              {numField('Mutual weight', config.people.mutualWeight, v => setC('people', 'mutualWeight', v))}
              {numField('Interest weight', config.people.interestWeight, v => setC('people', 'interestWeight', v))}
              {numField('Skill weight', config.people.skillWeight, v => setC('people', 'skillWeight', v))}
              {numField('Domain weight', config.people.domainWeight, v => setC('people', 'domainWeight', v))}
              {numField('Location weight', config.people.locationWeight, v => setC('people', 'locationWeight', v))}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Jobs</p>
              {toggle('Enabled', config.jobs.enabled, v => setC('jobs', 'enabled', v))}
              {numField('Max cards', config.jobs.maxCards, v => setC('jobs', 'maxCards', v))}
              {numField('Domain weight', config.jobs.domainWeight, v => setC('jobs', 'domainWeight', v))}
              {numField('Skill weight', config.jobs.skillWeight, v => setC('jobs', 'skillWeight', v))}
              {numField('Location weight', config.jobs.locationWeight, v => setC('jobs', 'locationWeight', v))}
              {numField('Recency weight', config.jobs.recencyWeight, v => setC('jobs', 'recencyWeight', v))}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Ads &amp; placement</p>
              {toggle('Ads enabled', config.ads.enabled, v => setC('ads', 'enabled', v))}
              {toggle('Targeting enabled', config.ads.targetingEnabled, v => setC('ads', 'targetingEnabled', v))}
              {numField('Min gap (posts)', config.ads.minGap, v => setC('ads', 'minGap', v))}
              {numField('Max gap (posts)', config.ads.maxGap, v => setC('ads', 'maxGap', v))}
              {numField('Max ads per feed', config.ads.maxPerFeed, v => setC('ads', 'maxPerFeed', v))}
              {numField('Lead posts before first module', config.composition.minLeadPosts, v => setC('composition', 'minLeadPosts', v))}
              {numField('Min gap between modules', config.composition.minModuleGap, v => setC('composition', 'minModuleGap', v))}
              {numField('Max modules per page', config.composition.maxModulesPerPage, v => setC('composition', 'maxModulesPerPage', v))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Publication</div>
            <div className="grid grid-cols-2 gap-3">
              {numField('Maximum publication characters', config.publication.maxChars, v => setC('publication', 'maxChars', v))}
            </div>
          </div>

          <button disabled={busy === 'config'} onClick={saveConfig}
            className="mt-4 rounded-lg bg-white px-4 py-2 text-[12.5px] font-bold text-neutral-900 disabled:opacity-60">
            Save configuration
          </button>
        </div>
      )}

      {createOpen && (
        <CreateAdModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); setMsg('Advertisement created successfully.'); void load(); }}
        />
      )}
    </div>
  );
}

/* ── Create Advertisement ──────────────────────────────────────────────────
   Every field maps 1:1 to what POST /api/super-admin/ads already accepts. The
   server owns id, owner, advertiserType, status, fee and timestamps — this
   only collects the editorial content and targeting. Image goes through the
   existing /api/ads/upload (multipart, field `file`, returns { url }). */
function CreateAdModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaHref, setCtaHref] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* Comma-separated in the UI, arrays on the wire — the API expects arrays. */
  const [section, setSection] = useState('');
  const [domain, setDomain] = useState('');
  const [profession, setProfession] = useState('');
  const [skills, setSkills] = useState('');
  const [location, setLocation] = useState('');

  const toList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

  const upload = async (file: File) => {
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/ads/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) { setErr(d.error || 'Image upload failed.'); return; }
      setImageUrl(String(d.url));
      setImageName(file.name);
    } catch {
      setErr('Image upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!imageUrl) { setErr('An advertisement image is required.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/super-admin/ads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        /* Only editorial + targeting fields. The endpoint fills in the rest. */
        body: JSON.stringify({
          title: title.trim(),
          imageUrl,
          subtitle: subtitle.trim() || undefined,
          description: description.trim() || undefined,
          ctaLabel: ctaLabel.trim() || undefined,
          ctaHref: ctaHref.trim() || undefined,
          durationDays,
          targetSection: toList(section),
          targetDomain: toList(domain),
          targetProfession: toList(profession),
          targetSkills: toList(skills),
          targetLocation: toList(location),
        }),
      });
      if (res.status === 401 || res.status === 403) { setErr('Your Super Admin session has expired. Sign in again.'); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Could not create the advertisement.'); return; }
      onCreated();
    } catch {
      setErr('Network error — the advertisement was not created.');
    } finally {
      setSubmitting(false);
    }
  };

  const FIELD = 'w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/25';
  const LABEL = 'mb-1 block text-[11px] text-white/45';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create Advertisement"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0e0f13] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3 className="text-[15px] font-semibold text-white">Create Advertisement</h3>
          <p className="mt-0.5 text-[11.5px] text-white/40">
            Create a sponsored advertisement that can appear in the DoCrud feed.
          </p>
        </div>

        {err && (
          <p className="mb-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200/90">
            {err}
          </p>
        )}

        <div className="space-y-3">
          {/* Image */}
          <div>
            <span className={LABEL}>Advertisement image *</span>
            {imageUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="h-14 w-24 shrink-0 rounded-md object-cover" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/50">{imageName}</span>
                <label className="shrink-0 cursor-pointer rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[12px] font-semibold text-white/70 hover:bg-white/[0.10]">
                  Replace
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-6 text-[12.5px] text-white/45 hover:border-white/25 hover:text-white/65">
                {uploading ? 'Uploading…' : 'Click to upload an image (JPEG, PNG, WebP, GIF · max 4 MB)'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
              </label>
            )}
          </div>

          <div>
            <span className={LABEL}>Title *</span>
            <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Try DoCrud Infinity" maxLength={120} />
          </div>
          <div>
            <span className={LABEL}>Subtitle</span>
            <input className={FIELD} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} />
          </div>
          <div>
            <span className={LABEL}>Description</span>
            <textarea className={`${FIELD} min-h-[64px] resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={LABEL}>CTA label</span>
              <input className={FIELD} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Learn more" maxLength={40} />
            </div>
            <div>
              <span className={LABEL}>CTA link</span>
              <input className={FIELD} value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/pricing" />
            </div>
          </div>

          <div>
            <span className={LABEL}>Duration (days)</span>
            <input type="number" min={1} className={FIELD} value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value) || 30)} />
          </div>

          <details className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-semibold text-white/55">Targeting (optional)</summary>
            <p className="mt-1 mb-2 text-[11px] text-white/35">Comma-separated. Leave blank to show to everyone.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div><span className={LABEL}>Section</span><input className={FIELD} value={section} onChange={(e) => setSection(e.target.value)} /></div>
              <div><span className={LABEL}>Domain</span><input className={FIELD} value={domain} onChange={(e) => setDomain(e.target.value)} /></div>
              <div><span className={LABEL}>Profession</span><input className={FIELD} value={profession} onChange={(e) => setProfession(e.target.value)} /></div>
              <div><span className={LABEL}>Skills</span><input className={FIELD} value={skills} onChange={(e) => setSkills(e.target.value)} /></div>
              <div className="sm:col-span-2"><span className={LABEL}>Location</span><input className={FIELD} value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            </div>
          </details>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[12.5px] font-semibold text-white/60 hover:text-white/85 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={submitting || uploading || !title.trim() || !imageUrl}
            className="rounded-lg bg-white px-4 py-2 text-[12.5px] font-bold text-neutral-900 disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create advertisement'}
          </button>
        </div>
      </div>
    </div>
  );
}
