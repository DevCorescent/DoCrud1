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
};

const CARD = 'rounded-xl border border-white/10 bg-white/[0.03] p-4';
const NUM = 'h-9 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[13px] text-white outline-none focus:border-white/25';
const BTN = 'rounded-lg px-3 py-1.5 text-[12px] font-semibold transition';

export default function SponsoredAdsTab() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

          <button disabled={busy === 'config'} onClick={saveConfig}
            className="mt-4 rounded-lg bg-white px-4 py-2 text-[12.5px] font-bold text-neutral-900 disabled:opacity-60">
            Save configuration
          </button>
        </div>
      )}
    </div>
  );
}
