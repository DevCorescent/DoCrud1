'use client';

import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { VirtualIdCard } from '@/types/document';

type PublicVirtualIdPageProps = {
  card: VirtualIdCard;
};

function themeClasses(theme: VirtualIdCard['theme']) {
  switch (theme) {
    case 'amber':
      return 'from-amber-500 via-orange-500 to-stone-950';
    case 'emerald':
      return 'from-emerald-500 via-teal-500 to-slate-950';
    case 'sky':
      return 'from-sky-500 via-blue-500 to-slate-950';
    case 'rose':
      return 'from-rose-500 via-fuchsia-500 to-slate-950';
    default:
      return 'from-slate-700 via-slate-900 to-black';
  }
}

export default function PublicVirtualIdPage({ card }: PublicVirtualIdPageProps) {
  const profileUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }, []);

  useEffect(() => {
    void fetch(`/api/public/virtual-id/${card.slug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'open', source: 'direct' }),
    });
  }, [card.slug]);

  const handleSavePdf = () => {
    void fetch(`/api/public/virtual-id/${card.slug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'download', source: 'download' }),
    });
    window.print();
  };

  const handleCopy = async () => {
    const lines = [
      card.title,
      card.headline,
      card.bio,
      card.website,
      profileUrl,
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(lines);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.16),transparent_24%),linear-gradient(180deg,#020617_0%,#111827_100%)] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <section className={`overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${themeClasses(card.theme)} p-6 shadow-[0_28px_80px_rgba(2,6,23,0.42)] sm:p-8`}>
          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div className="rounded-[1.8rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
              {card.avatarUrl ? (
                <img src={card.avatarUrl} alt={card.ownerName} className="h-32 w-32 rounded-[1.6rem] object-cover" />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-[1.6rem] bg-white/12 text-3xl font-semibold">
                  {card.ownerName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-white/55">Virtual ID</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{card.ownerName}</h1>
              <p className="mt-2 text-sm text-white/75">{card.roleLabel || card.title}</p>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/55">{card.company || card.organizationName || 'docrud profile'}</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{card.title}</h2>
                {card.headline ? <p className="mt-3 text-lg text-white/82">{card.headline}</p> : null}
                {card.bio ? <p className="mt-4 max-w-3xl text-sm leading-7 text-white/72">{card.bio}</p> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[card.department, card.location, card.phone, card.website].filter(Boolean).map((item) => (
                  <div key={item} className="rounded-[1.1rem] border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/82 backdrop-blur-xl">
                    {item}
                  </div>
                ))}
              </div>

              {card.skills?.length ? (
                <div className="flex flex-wrap gap-2">
                  {card.skills.map((skill) => (
                    <span key={skill} className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white/82">
                      {skill}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button type="button" className="rounded-xl bg-white text-slate-950 hover:bg-white/90" onClick={handleSavePdf}>
                  Save as PDF
                </Button>
                <Button type="button" variant="outline" className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/12" onClick={handleCopy}>
                  Copy Profile
                </Button>
                {card.website ? (
                  <a href={card.website} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/12">
                    Open Website
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {card.highlights?.length || card.socialLinks?.length ? (
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {card.highlights?.length ? (
              <div className="rounded-[1.6rem] border border-white/10 bg-white/6 p-5 text-white/82 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/52">Highlights</p>
                <div className="mt-4 space-y-3">
                  {card.highlights.map((item) => (
                    <div key={item} className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {card.socialLinks?.length ? (
              <div className="rounded-[1.6rem] border border-white/10 bg-white/6 p-5 text-white/82 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/52">Links</p>
                <div className="mt-4 grid gap-3">
                  {card.socialLinks.map((link) => (
                    <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm hover:bg-white/10">
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
