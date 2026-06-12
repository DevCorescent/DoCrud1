'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, Loader2, QrCode, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildAbsoluteAppUrl } from '@/lib/url';
import type { VirtualIdCard } from '@/types/document';

type WorkspacePayload = {
  cards: VirtualIdCard[];
  totals: {
    cards: number;
    opens: number;
    scans: number;
    downloads: number;
  };
  suggestedProfile: Partial<VirtualIdCard>;
};

const emptyForm = {
  title: '',
  headline: '',
  bio: '',
  company: '',
  department: '',
  roleLabel: '',
  phone: '',
  website: '',
  location: '',
  avatarUrl: '',
  skills: '',
  highlights: '',
  theme: 'slate',
  visibility: 'public',
};

export default function VirtualIdCenter() {
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/virtual-id', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load Virtual ID.');
      }
      const typed = payload as WorkspacePayload;
      setData(typed);
      if (!editingId && !form.title) {
        setForm((current) => ({
          ...current,
          title: typed.suggestedProfile.title || '',
          headline: typed.suggestedProfile.headline || '',
          bio: typed.suggestedProfile.bio || '',
          company: typed.suggestedProfile.company || '',
          roleLabel: typed.suggestedProfile.roleLabel || '',
        }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Virtual ID.');
    } finally {
      setLoading(false);
    }
  }, [editingId, form.title]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentPreview = useMemo(() => ({
    ...form,
    skills: form.skills.split(',').map((item) => item.trim()).filter(Boolean),
    highlights: form.highlights.split('\n').map((item) => item.trim()).filter(Boolean),
  }), [form]);

  const saveCard = async () => {
    try {
      setSaving(true);
      setMessage('');
      const payload = {
        title: form.title.trim(),
        headline: form.headline.trim(),
        bio: form.bio.trim(),
        company: form.company.trim(),
        department: form.department.trim(),
        roleLabel: form.roleLabel.trim(),
        phone: form.phone.trim(),
        website: form.website.trim(),
        location: form.location.trim(),
        avatarUrl: form.avatarUrl.trim(),
        skills: form.skills.split(',').map((item) => item.trim()).filter(Boolean),
        highlights: form.highlights.split('\n').map((item) => item.trim()).filter(Boolean),
        theme: form.theme,
        visibility: form.visibility,
      };
      const response = await fetch('/api/virtual-id', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(editingId ? { cardId: editingId, updates: payload } : payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to save Virtual ID.');
      }
      setMessage(editingId ? 'Virtual ID updated.' : 'Virtual ID created.');
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Virtual ID.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (card: VirtualIdCard) => {
    setEditingId(card.id);
    setForm({
      title: card.title,
      headline: card.headline || '',
      bio: card.bio || '',
      company: card.company || '',
      department: card.department || '',
      roleLabel: card.roleLabel || '',
      phone: card.phone || '',
      website: card.website || '',
      location: card.location || '',
      avatarUrl: card.avatarUrl || '',
      skills: (card.skills || []).join(', '),
      highlights: (card.highlights || []).join('\n'),
      theme: card.theme || 'slate',
      visibility: card.visibility,
    });
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      const response = await fetch(`/api/virtual-id?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to delete Virtual ID.');
      }
      setMessage('Virtual ID removed.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete Virtual ID.');
    } finally {
      setDeletingId('');
    }
  };

  if (loading) {
    return <div className="rounded-[1.6rem] border border-slate-200 bg-white p-10 text-center shadow-sm"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Cards', value: data?.totals.cards || 0 },
          { label: 'Opens', value: data?.totals.opens || 0 },
          { label: 'QR scans', value: data?.totals.scans || 0 },
          { label: 'Downloads', value: data?.totals.downloads || 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="builder" className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="builder" className="rounded-xl text-xs sm:text-sm">Builder</TabsTrigger>
          <TabsTrigger value="cards" className="rounded-xl text-xs sm:text-sm">History</TabsTrigger>
          <TabsTrigger value="insights" className="rounded-xl text-xs sm:text-sm">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-4">
          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-3">
                <Input placeholder="Card title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                <Input placeholder="Headline" value={form.headline} onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))} />
                <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900" placeholder="Bio" value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Company" value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} />
                  <Input placeholder="Department" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Role label" value={form.roleLabel} onChange={(event) => setForm((current) => ({ ...current, roleLabel: event.target.value }))} />
                  <Input placeholder="Phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Website" value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} />
                  <Input placeholder="Location" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
                </div>
                <Input placeholder="Avatar image URL" value={form.avatarUrl} onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))} />
                <Input placeholder="Skills (comma separated)" value={form.skills} onChange={(event) => setForm((current) => ({ ...current, skills: event.target.value }))} />
                <textarea className="min-h-[96px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900" placeholder="Highlights (one per line)" value={form.highlights} onChange={(event) => setForm((current) => ({ ...current, highlights: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={form.theme} onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}>
                    <option value="slate">Slate</option>
                    <option value="amber">Amber</option>
                    <option value="emerald">Emerald</option>
                    <option value="sky">Sky</option>
                    <option value="rose">Rose</option>
                  </select>
                  <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => void saveCard()} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {editingId ? 'Update card' : 'Create card'}
                  </Button>
                  {editingId ? (
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                      Reset
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.15),transparent_26%),linear-gradient(180deg,#0f172a,#111827)] p-5 text-white shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Live preview</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{currentPreview.title || 'Your virtual ID'}</h3>
              {currentPreview.headline ? <p className="mt-2 text-white/75">{currentPreview.headline}</p> : null}
              {currentPreview.bio ? <p className="mt-4 text-sm leading-7 text-white/70">{currentPreview.bio}</p> : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[currentPreview.company, currentPreview.roleLabel, currentPreview.phone, currentPreview.website].filter(Boolean).map((item) => (
                  <div key={item} className="rounded-[1rem] border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/82">{item}</div>
                ))}
              </div>
              {currentPreview.skills.length ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {currentPreview.skills.map((skill) => (
                    <span key={skill} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/80">{skill}</span>
                  ))}
                </div>
              ) : null}
              {currentPreview.highlights.length ? (
                <div className="mt-5 space-y-2">
                  {currentPreview.highlights.map((item) => (
                    <div key={item} className="rounded-[1rem] border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/82">{item}</div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="cards" className="space-y-4">
          {data?.cards.length ? data.cards.map((card) => {
            const shareUrl = buildAbsoluteAppUrl(`/id/${card.slug}`, typeof window !== 'undefined' ? window.location.origin : undefined);
            return (
              <div key={card.id} className="grid gap-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-950">{card.title}</h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-600">{card.visibility}</span>
                  </div>
                  <p className="text-sm text-slate-600">{card.headline || 'Public digital profile page with QR access.'}</p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Opens: {card.analytics.openCount}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Scans: {card.analytics.scanCount}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Downloads: {card.analytics.downloadCount}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Visitors: {card.analytics.uniqueVisitors}</div>
                  </div>
                  <p className="break-all text-xs text-slate-500">{shareUrl}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleEdit(card)}>Edit</Button>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(shareUrl)}><Copy className="mr-2 h-4 w-4" />Copy link</Button>
                    <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Open profile</a>
                    <Button type="button" variant="outline" className="rounded-xl text-rose-600" onClick={() => void handleDelete(card.id)} disabled={deletingId === card.id}>
                      {deletingId === card.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Delete
                    </Button>
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    <QrCode className="h-3.5 w-3.5" />
                    QR access
                  </div>
                  <img src={card.qrUrl} alt={`${card.title} QR`} className="mt-3 h-36 w-36 rounded-xl bg-white p-2 object-contain" />
                  <a href={card.qrUrl} download={`${card.slug}-qr.png`} className="mt-3 inline-flex items-center text-xs font-medium text-slate-700 hover:text-slate-950">
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Download QR
                  </a>
                </div>
              </div>
            );
          }) : <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">Your first Virtual ID will appear here.</div>}
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">AI-style insight</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Virtual IDs are strongest when headline, company, and two clear action points are filled.</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">Cards with stronger identity signals are easier to trust after a QR scan. Add company, role, website, and 3-5 skills so the profile feels complete immediately on mobile.</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Best next move</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Publish one public card and use that same QR on resumes, certificates, and hiring workflows.</p>
              <Button type="button" variant="outline" className="mt-4 rounded-xl" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh stats
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
