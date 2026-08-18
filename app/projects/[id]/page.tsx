'use client';

/**
 * One project.
 *
 * Same visual language as the service detail page: a hero card, sectioned
 * panels, a poster sidebar and a related strip, all on one request to
 * /api/projects/detail. Nothing in the Services detail page is modified.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, MapPin, MessageSquare, Share2, Check } from 'lucide-react';
import {
  projectCategory, formatBudget, formatDeadline,
  BUDGET_TYPE_LABELS, PROJECT_TYPE_LABELS, WORK_MODE_LABELS, STATUS_LABELS,
} from '@/lib/projects-ui';
import { ProjectSummaryCard, type ProjectSummary } from '@/components/projects/ProjectSummaryCard';

type Detail = {
  project: ProjectSummary;
  poster: {
    id: string; name: string; type: string;
    avatarUrl: string | null; headline: string | null; location: string | null; projectCount: number;
  };
  others: ProjectSummary[];
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/28">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-white/85 truncate">{value}</p>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [data, setData] = useState<Detail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState('loading');
    fetch(`/api/projects/detail?projectId=${encodeURIComponent(id)}`)
      .then(async res => {
        if (!alive) return;
        if (res.status === 404) { setState('notfound'); return; }
        if (!res.ok) { setState('error'); return; }
        setData((await res.json()) as Detail);
        setState('ready');
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [id]);

  const share = useCallback(() => {
    if (typeof window === 'undefined') return;
    navigator.clipboard?.writeText(window.location.href)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
      .catch(() => {});
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0C] px-4 py-10">
        <div className="mx-auto max-w-5xl animate-pulse space-y-4">
          <div className="h-64 rounded-[20px] bg-white/[0.04]" />
          <div className="h-24 rounded-[20px] bg-white/[0.04]" />
          <div className="h-24 rounded-[20px] bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  if (state === 'notfound' || state === 'error' || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0C] px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-[17px] font-bold text-white/50">
            {state === 'notfound' ? 'Project not found' : 'Couldn’t load this project'}
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/25">
            {state === 'notfound'
              ? 'It may have been closed or removed by the person who posted it.'
              : 'Something went wrong. Try again in a moment.'}
          </p>
          <Link href="/projects"
            className="mt-6 inline-flex h-10 items-center rounded-[13px] border border-white/[0.10] bg-white/[0.04] px-6 text-[13.5px] font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all">
            Browse projects
          </Link>
        </div>
      </div>
    );
  }

  const { project: p, poster, others } = data;
  const cat = projectCategory(p.category);
  const deadline = formatDeadline(p.deadline);
  const workMode = p.workMode ? WORK_MODE_LABELS[p.workMode] : null;
  const isOpen = p.status === 'open';

  const statusStyle = isOpen
    ? { background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.30)', color: '#6ee7b7' }
    : p.status === 'in_progress'
      ? { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.30)', color: '#fcd34d' }
      : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.55)' };

  /* The existing messages deep link — a real destination, never a dead CTA. */
  const contactHref = `/messages?user=${poster.id}&init=${encodeURIComponent(`Hi ${poster.name}! I saw your project "${p.title}" on Docrud and I'd like to help.`)}`;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0A0A0C]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button type="button" onClick={() => router.back()} aria-label="Go back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Link href="/projects" className="text-[13px] font-semibold text-white/45 hover:text-white transition-colors">Projects</Link>
          <button type="button" onClick={share} aria-label="Copy link to this project"
            className="ml-auto flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-semibold text-white/50 hover:text-white hover:bg-white/[0.08] transition-all">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Share'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-28">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">

            {/* Hero */}
            <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[3.5px] text-[10.5px] font-semibold ${cat.bg} ${cat.color}`}>
                  <span aria-hidden>{cat.icon}</span>{cat.label}
                </span>
                <span className="rounded-full px-2.5 py-[3.5px] text-[10.5px] font-semibold" style={statusStyle}>
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
                <span className="rounded-full border border-white/[0.09] bg-white/[0.04] px-2.5 py-[3.5px] text-[10.5px] font-medium text-white/50">
                  {PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType}
                </span>
              </div>

              <h1 className="mt-3 text-[22px] sm:text-[26px] font-bold leading-tight tracking-[-0.01em]">{p.title}</h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-white/40">
                {(p.location || workMode) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{[p.location, workMode].filter(Boolean).join(' · ')}
                  </span>
                )}
                {deadline && (
                  <span className="inline-flex items-center gap-1" style={deadline.overdue ? { color: 'rgba(255,255,255,0.25)' } : undefined}>
                    <CalendarClock className="h-3 w-3" />{deadline.label}
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/[0.06] pt-4">
                <Fact label="Budget" value={formatBudget({ budgetType: p.budgetType as never, budgetMin: p.budgetMin, budgetMax: p.budgetMax ?? undefined, currency: p.currency })} />
                <Fact label="Basis" value={BUDGET_TYPE_LABELS[p.budgetType] ?? p.budgetType} />
                <Fact label="Type" value={PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType} />
                <Fact label="Deadline" value={p.deadline ?? 'Not set'} />
              </div>
            </div>

            <Section title="About this project">
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/65">{p.description}</p>
            </Section>

            {(p.skills ?? []).length > 0 && (
              <Section title="Skills required">
                <div className="flex flex-wrap gap-1.5">
                  {p.skills.map(s => (
                    <span key={s} className="rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1 text-[11.5px] font-medium text-white/60">{s}</span>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Poster sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Posted by</p>
              <Link href={`/u/${poster.id}`} className="flex items-center gap-3 group">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.10] bg-white/[0.08] text-[15px] font-bold text-white/65">
                  {poster.avatarUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={poster.avatarUrl} alt="" className="h-full w-full object-cover" data-no-invert />
                    : poster.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-white group-hover:underline">{poster.name}</span>
                  {poster.headline && <span className="block truncate text-[11.5px] text-white/40">{poster.headline}</span>}
                </span>
              </Link>
              {poster.location && (
                <p className="mt-3 flex items-center gap-1 text-[11.5px] text-white/32">
                  <MapPin className="h-3 w-3" />{poster.location}
                </p>
              )}
              <p className="mt-1.5 text-[11.5px] text-white/32">
                {poster.projectCount} project{poster.projectCount === 1 ? '' : 's'} posted
              </p>

              {isOpen ? (
                <Link href={contactHref}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[13px] text-[13.5px] font-bold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', boxShadow: '0 6px 24px rgba(139,92,246,0.26)' }}>
                  <MessageSquare className="h-4 w-4" /> Contact poster
                </Link>
              ) : (
                <p className="mt-4 rounded-[13px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center text-[12px] font-semibold text-white/35">
                  This project is {(STATUS_LABELS[p.status] ?? p.status).toLowerCase()}
                </p>
              )}

              <Link href={`/u/${poster.id}`}
                className="mt-2 flex h-10 w-full items-center justify-center rounded-[13px] border border-white/[0.10] text-[12.5px] font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white transition-all">
                View profile
              </Link>
            </div>
          </aside>
        </div>

        {others.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">More from this poster</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {others.map(o => <ProjectSummaryCard key={o.id} project={{ ...o, poster: { id: poster.id, name: poster.name, avatarUrl: poster.avatarUrl } }} />)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
