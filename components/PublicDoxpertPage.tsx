'use client';

import Link from 'next/link';
import { ArrowRight, BrainCircuit, LockKeyhole, ShieldAlert, Sparkles } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import { DOXPERT_DISCLAIMER } from '@/lib/doxpert-report';

interface PublicDoxpertPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

const mockMessages = [
  {
    role: 'assistant',
    text: 'I can explain what this document says, where it feels risky, what is missing, and how you can respond more safely.',
  },
  {
    role: 'user',
    text: 'Review the weak areas, tell me the business risk, and suggest the smartest next reply.',
  },
  {
    role: 'assistant',
    text: 'Login required. DoXpert stays inside your docrud account so reports, history, and plan controls remain secure and traceable.',
  },
];

const doxpertBusinessOutcomes = [
  'Catch weak spots before the document goes out.',
  'Reply faster when something feels risky or unclear.',
  'Give teams a sharper read without a long manual review.',
];

const doxpertPersonas = [
  { title: 'Business owners', detail: 'Understand whether a draft could expose the business to avoidable risk before you approve or reply.' },
  { title: 'Operations teams', detail: 'Improve document quality, reduce rework, and move faster with clearer AI review guidance.' },
  { title: 'Client-facing teams', detail: 'Get stronger response suggestions and cleaner next-step guidance before anything is sent out.' },
];

const doxpertFlow = [
  {
    title: 'Read the document like a reviewer',
    description: 'Get a quick summary, score, and weak-spot scan.',
  },
  {
    title: 'Surface risks and weak areas',
    description: 'See risky clauses, missing protections, and weak wording.',
  },
  {
    title: 'Turn analysis into action',
    description: 'Use the guidance to fix, reply, or move forward with more confidence.',
  },
];

export default function PublicDoxpertPage({ softwareName, accentLabel, settings }: PublicDoxpertPageProps) {
  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.98)_42%,rgba(255,247,237,0.92)_72%,rgba(239,246,255,0.90)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <Sparkles className="h-4 w-4" />
              DoXpert AI
            </div>
            <h1 className="mt-4 max-w-3xl text-[1.9rem] font-medium leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-[2.7rem] lg:text-[3.5rem]">
              Understand documents faster with
              <span className="ml-2 text-slate-700">
                clearer AI review.
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              See what the document means, where it feels risky, and what to improve before you send or approve it.
            </p>
            <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {DOXPERT_DISCLAIMER}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                <Link href="/individual-signup">
                  Create Individual Profile
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/signup">Create Business Workspace</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/login">Login</Link>
              </Button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.2rem] border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Individual path</p>
                <p className="mt-2 text-lg font-medium tracking-[-0.03em] text-slate-950">Focused solo guidance</p>
              </div>
              <div className="rounded-[1.2rem] border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Business path</p>
                <p className="mt-2 text-lg font-medium tracking-[-0.03em] text-slate-950">Shared team-level control</p>
              </div>
              <div className="rounded-[1.2rem] border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Why login is required</p>
                <p className="mt-2 text-lg font-medium tracking-[-0.03em] text-slate-950">Secure reports and traceable history</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.6rem] border border-slate-200/70 bg-[linear-gradient(160deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,0.96)_48%,rgba(255,247,237,0.92)_100%)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem] sm:p-6">
            <div className="pointer-events-none absolute left-8 top-2 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.20)_0%,rgba(191,219,254,0.04)_50%,transparent_74%)] blur-3xl" />
            <div className="pointer-events-none absolute -right-8 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(254,215,170,0.18)_0%,rgba(254,215,170,0.03)_48%,transparent_72%)] blur-3xl" />
            <div className="relative rounded-[1.4rem] border border-white/70 bg-white/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.16)]">
                    <BrainCircuit className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-950">DoXpert conversation</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Secured AI review</p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Login required
                </div>
              </div>

              <div className="mt-4 space-y-3 rounded-[1.3rem] border border-slate-200/80 bg-white/72 p-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                {mockMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={message.role === 'assistant'
                      ? 'max-w-[92%] rounded-[1.1rem] border border-slate-200 bg-slate-50/95 px-4 py-3 text-sm leading-6 text-slate-700'
                      : 'ml-auto max-w-[88%] rounded-[1.1rem] bg-slate-950 px-4 py-3 text-sm leading-6 text-white'}
                  >
                    {message.text}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[1.2rem] border border-white/12 bg-white/92 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1rem] bg-slate-50 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Report outputs</p>
                    <p className="mt-2 text-sm font-medium text-slate-950">Summary, document score, trust signals</p>
                  </div>
                  <div className="rounded-[1rem] bg-slate-50 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Risk intelligence</p>
                    <p className="mt-2 text-sm font-medium text-slate-950">Warnings, mitigation, reply guidance</p>
                  </div>
                </div>
                <div className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <ShieldAlert className="h-4 w-4" />
                    <p className="text-sm font-medium">Business plans remain more powerful</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    Individual profiles are intentionally lighter. Shared workflows, approvals, admin controls, analytics, branding, and organization-level visibility remain part of business workspaces.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">How it helps the business</p>
          <div className="mt-5 space-y-3">
            {doxpertBusinessOutcomes.map((item) => (
              <div key={item} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.9)_100%)] px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">How teams use it</p>
          <div className="mt-5 space-y-4">
            {doxpertFlow.map((step, index) => (
              <div key={step.title} className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">0{index + 1}</p>
                <p className="mt-2 text-base font-medium tracking-[-0.02em] text-slate-950">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Who it is built for</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {doxpertPersonas.map((item) => (
            <article key={item.title} className="rounded-[1.25rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] p-5">
              <h3 className="text-lg font-medium tracking-[-0.02em] text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
