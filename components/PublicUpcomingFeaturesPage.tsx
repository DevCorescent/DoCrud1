'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, Rocket, Sparkles } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

interface PublicUpcomingFeaturesPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

const roadmapItems = [
  {
    date: 'April 15, 2026',
    title: 'Approval Command Center',
    summary: 'One inbox for approvals, escalations, pending reviews, and stuck operational work.',
    outcome: 'Helps business teams act faster without hunting across multiple modules.',
    tone: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.92))] border-sky-100',
  },
  {
    date: 'April 20, 2026',
    title: 'Contract Obligations Tracker',
    summary: 'Automatic extraction of obligations, deadlines, renewal items, and accountable owners.',
    outcome: 'Makes signed and active documents useful after execution, not just at the drafting stage.',
    tone: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,253,245,0.92))] border-emerald-100',
  },
  {
    date: 'April 25, 2026',
    title: 'Client Board Room',
    summary: 'A branded space for proposals, contracts, files, comments, signatures, and client handoff.',
    outcome: 'Gives businesses a cleaner client-facing delivery layer with better control and visibility.',
    tone: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(250,245,255,0.92))] border-violet-100',
  },
  {
    date: 'April 30, 2026',
    title: 'Workflow Builder',
    summary: 'No-code approval, reminder, escalation, and operational routing builder.',
    outcome: 'Lets businesses design repeatable document and team processes without engineering help.',
    tone: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,247,237,0.92))] border-amber-100',
  },
  {
    date: 'May 5, 2026',
    title: 'Vendor Onboarding Hub',
    summary: 'Due diligence, compliance docs, vendor verification, and renewal-readiness in one flow.',
    outcome: 'Makes procurement and vendor operations much easier to control from the same workspace.',
    tone: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,241,242,0.92))] border-rose-100',
  },
  {
    date: 'May 10, 2026',
    title: 'AI Meeting-to-Document Assistant',
    summary: 'Turn meeting notes, decisions, and action points into drafts, trackers, and follow-up documents.',
    outcome: 'Reduces manual conversion work and helps teams move from discussion to execution faster.',
    tone: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(243,244,246,0.94))] border-slate-200',
  },
];

export default function PublicUpcomingFeaturesPage({ softwareName, accentLabel, settings }: PublicUpcomingFeaturesPageProps) {
  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.98)_38%,rgba(239,246,255,0.92)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <Rocket className="h-4 w-4" />
              Upcoming Features
            </div>
            <h1 className="mt-4 max-w-3xl text-[1.9rem] font-medium leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-[2.7rem] lg:text-[3.5rem]">
              See how docrud is evolving,
              <span className="ml-2 text-slate-700">in a roadmap buyers can actually understand.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              This roadmap shows where the platform is going next, why those upgrades matter to businesses, and how product depth is being added in a visible, timed rollout.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                <Link href="/signup">
                  Start With docrud
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/pricing">See Plans</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Start date', value: 'April 15, 2026' },
              { label: 'Cadence', value: 'Every 5 days' },
              { label: 'Focus', value: 'Business-first product depth' },
            ].map((item, index) => (
              <div key={item.label} className={`rounded-[1.25rem] border px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)] ${index === 1 ? 'border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.9))]' : 'border-slate-200 bg-white'}`}>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-base font-medium leading-6 text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[1.6rem] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(236,253,245,0.98)_52%,rgba(239,246,255,0.94)_100%)] px-4 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] sm:rounded-[2rem] sm:px-7 sm:py-7 lg:px-10 xl:px-12">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-emerald-700 sm:text-[11px]">Launch window offer</p>
            <h2 className="mt-3 text-[1.45rem] font-medium tracking-[-0.03em] text-slate-950 sm:text-[1.8rem] lg:text-[2.1rem]">
              Purchase a plan today and get all new upgrades free for 3 months.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Any user who signs up or logs in on or before April 14, 2026 is tagged for the roadmap launch window and gets the incoming product upgrades unlocked through July 14, 2026.
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-white/80 bg-white/88 p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Offer terms</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <p>Cutoff to qualify: April 14, 2026</p>
              <p>Roadmap unlock period: April 15 to July 14, 2026</p>
              <p>Applies to login-qualified and purchase-ready accounts created in the launch window</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[1.6rem] border border-slate-200/80 bg-white px-4 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500 sm:text-[11px]">Roadmap timeline</p>
            <h2 className="mt-3 text-[1.45rem] font-medium tracking-[-0.03em] text-slate-950 sm:text-[1.85rem] lg:text-[2.15rem]">Six planned product updates, sequenced for momentum.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Each release is framed around how it improves speed, control, visibility, or business execution, not just around adding more buttons.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            Rolling every 5 days
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {roadmapItems.map((item, index) => (
            <article key={item.date} className={`rounded-[1.45rem] border p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)] ${item.tone}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">Release 0{index + 1}</p>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
                  <Sparkles className="h-3.5 w-3.5" />
                  {item.date}
                </div>
              </div>
              <h3 className="mt-4 text-xl font-medium tracking-[-0.02em] text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
              <div className="mt-4 rounded-[1.1rem] border border-white/70 bg-white/88 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Why it matters</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.outcome}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
