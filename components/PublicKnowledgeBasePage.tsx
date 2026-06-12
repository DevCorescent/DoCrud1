'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Filter, Search } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { LandingSettings } from '@/types/document';

type KnowledgeEntry = {
  id: string;
  title: string;
  query: string;
  category: string;
  tags: string[];
  summary: string;
  keyPoints: string[];
  sentiment: { label?: string; notes?: string };
  sources: Array<{ title: string; url: string; snippet?: string }>;
  createdAt: string;
};

export default function PublicKnowledgeBasePage(props: {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
}) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([]);

  const activeCategoryLabel = useMemo(() => category || 'All', [category]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      try {
        const url = new URL('/api/knowledge', window.location.origin);
        if (q.trim()) url.searchParams.set('q', q.trim());
        if (category.trim()) url.searchParams.set('category', category.trim());
        url.searchParams.set('limit', '24');
        const response = await fetch(url.toString(), { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!active || !payload) return;
        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      } catch {
        if (!active) return;
        setEntries([]);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [category, q]);

  return (
    <PublicSiteChrome softwareName={props.softwareName} accentLabel={props.accentLabel} settings={props.settings}>
      <section className="cloud-panel relative overflow-hidden rounded-[2rem] border border-white/60 p-5 shadow-[0_22px_60px_rgba(148,163,184,0.14)] sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(14,165,233,0.38),transparent_36%),radial-gradient(circle_at_84%_12%,rgba(168,85,247,0.28),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.88),rgba(236,244,255,0.82),rgba(255,255,255,0.76))]" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 backdrop-blur-xl">
              <BookOpen className="h-4 w-4 text-slate-700" />
              Knowledge Base
            </div>
            <Link href="/" className="text-sm font-semibold text-slate-700 hover:text-slate-950">
              Back to home
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search published summaries"
                className="h-11 w-full rounded-full border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,248,255,0.72))] pl-11 pr-4 text-sm font-medium text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_36px_rgba(148,163,184,0.10)] outline-none backdrop-blur-2xl transition placeholder:text-slate-500 focus:border-slate-300"
              />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-[12px] font-semibold text-slate-700 backdrop-blur-xl">
              <Filter className="h-4 w-4" />
              {activeCategoryLabel}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('')}
              className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                !category ? 'bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]' : 'bg-white/70 text-slate-700 hover:bg-white hover:text-slate-950'
              }`}
            >
              All
            </button>
            {categories.slice(0, 10).map((item) => (
              <button
                key={item.category}
                type="button"
                onClick={() => setCategory(item.category)}
                className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                  category === item.category
                    ? 'bg-[linear-gradient(135deg,rgba(37,99,235,0.95),rgba(168,85,247,0.9))] text-white shadow-[0_14px_30px_rgba(37,99,235,0.18)]'
                    : 'bg-white/70 text-slate-700 hover:bg-white hover:text-slate-950'
                }`}
              >
                {item.category} <span className="ml-1 text-white/80">{category === item.category ? '' : `(${item.count})`}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, idx) => (
            <div key={`kb-skel-${idx}`} className="cloud-card rounded-[1.6rem] border border-white/60 bg-white/55 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
              <div className="h-3 w-24 rounded bg-slate-200/70" />
              <div className="mt-4 h-4 w-4/5 rounded bg-slate-200/70" />
              <div className="mt-3 h-4 w-3/5 rounded bg-slate-200/70" />
              <div className="mt-5 h-12 w-full rounded bg-slate-200/50" />
            </div>
          ))
        ) : entries.length ? (
          entries.map((entry) => (
            <div key={entry.id} className="cloud-card rounded-[1.6rem] border border-white/60 bg-white/55 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                  {entry.category}
                </span>
                {entry.sentiment?.label ? (
                  <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                    {entry.sentiment.label}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-4 text-[1.05rem] font-semibold tracking-[-0.03em] text-slate-950">{entry.title}</h3>
              <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-600">{entry.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {entry.sources.slice(0, 2).map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white hover:text-slate-950"
                  >
                    Source
                  </a>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="cloud-card col-span-full rounded-[1.6rem] border border-white/60 bg-white/55 p-7 text-center text-sm text-slate-600 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
            No published entries yet for this filter.
          </div>
        )}
      </section>
    </PublicSiteChrome>
  );
}

