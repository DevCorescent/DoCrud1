'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, BarChart3, BrainCircuit, FileSpreadsheet, LockKeyhole, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

interface PublicVisualizerPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

const visualizerSteps = [
  {
    title: 'Paste structured content',
    description: 'Bring in spreadsheet rows, report exports, MIS summaries, or dense business text.',
    icon: FileSpreadsheet,
  },
  {
    title: 'AI reads the document shape',
    description: 'The visualizer detects patterns, numeric columns, category groups, and business signals worth paying attention to.',
    icon: BrainCircuit,
  },
  {
    title: 'Get charts and executive takeaways',
    description: 'Get charts, anomalies, trends, and practical insights that are easier to share with teams or leadership.',
    icon: TrendingUp,
  },
];

const trustPoints = [
  'Built to visualize real document structure instead of creating decorative charts with no operational value.',
  'Falls back to local heuristics when AI is unavailable, so teams still get usable outputs during real work.',
  'Best for spreadsheet exports, trackers, MIS reports, performance tables, and structured business notes.',
];

const visualizerCapabilities = [
  {
    label: 'What it does',
    value: 'Detects structured data and turns it into categories, totals, patterns, and trends.',
  },
  {
    label: 'Narrative handling',
    value: 'Turns dense business text into structure, readability, and insight-led visuals.',
  },
  {
    label: 'Decision support',
    value: 'Surfaces anomalies, weak spots, and takeaways people can act on faster.',
  },
  {
    label: 'Reliability',
    value: 'Keeps outputs usable through fallback analysis even when AI is unavailable.',
  },
];

const visualizerSnapshot = [
  { label: 'Outputs', value: 'Charts, metrics, anomalies, trends' },
  { label: 'Best for', value: 'MIS, trackers, reports, exports' },
  { label: 'Value', value: 'Faster business understanding' },
];

const businessReasons = [
  'Turns sheet-heavy reporting into visuals leadership can understand quickly.',
  'Helps teams find outliers, weak areas, and movement trends without reading every row manually.',
  'Works especially well when the business already has exports and reports but lacks a cleaner interpretation layer.',
];

const visualizerUseCases = [
  { title: 'MIS review', detail: 'Turn trackers and monthly reporting into visuals that management can review faster.' },
  { title: 'Performance reporting', detail: 'See distribution, concentration, and movement trends that would otherwise stay buried in rows.' },
  { title: 'Decision support', detail: 'Use anomalies and deep insight cues to decide what should be investigated next.' },
];

export default function PublicVisualizerPage({ softwareName, accentLabel, settings }: PublicVisualizerPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.98)_52%,rgba(239,246,255,0.92)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <BarChart3 className="h-4 w-4" />
              Visualizer AI
            </div>
            <h1 className="mt-4 max-w-3xl text-[1.9rem] font-medium leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-[2.7rem] lg:text-[3.5rem]">
              Make complex reports easier to
              <span className="ml-2 bg-[linear-gradient(135deg,#0f172a_0%,#334155_42%,#2563eb_100%)] bg-clip-text text-transparent">
                read, explain, and act on.
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Visualizer AI helps teams turn rows, reports, and dense structured information into visuals and insights that make decisions easier, meetings shorter, and analysis more practical.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                <Link href={isAuthenticated ? '/workspace' : '/login'}>
                  {isAuthenticated ? 'Open Workspace' : 'Login to Use Visualizer'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/individual-signup">Create Individual Profile</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/signup">Create Business Workspace</Link>
              </Button>
            </div>
            <div className="mt-6 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Visualizer AI works only inside a logged-in docrud account so history, usage, and analysis remain secure and connected to the workspace.
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.6rem] border border-slate-200/70 bg-[linear-gradient(160deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.96)_48%,rgba(226,232,240,0.94)_100%)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem] sm:p-6">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-32 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16)_0%,rgba(59,130,246,0.06)_42%,transparent_74%)] blur-3xl" />
            <div className="pointer-events-none absolute -right-10 bottom-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(15,23,42,0.12)_0%,rgba(15,23,42,0.03)_52%,transparent_76%)] blur-3xl" />
            <div className="relative rounded-[1.4rem] border border-white/70 bg-white/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-2xl sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.22)]">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium tracking-[-0.01em] text-slate-950">Visualizer AI</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Document intelligence view</p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Login required
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {visualizerCapabilities.map((item, index) => (
                  <div
                    key={item.label}
                    className={`rounded-[1.15rem] border px-4 py-4 text-slate-900 shadow-[0_16px_40px_rgba(15,23,42,0.05)] ${
                      index === 0
                        ? 'border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,255,0.88))]'
                        : 'border-slate-200/80 bg-white/84'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[1.25rem] border border-slate-200/80 bg-white/82 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Quick snapshot</p>
                    <p className="mt-1 text-sm font-medium tracking-[-0.01em] text-slate-950">A faster way to understand data-heavy documents</p>
                  </div>
                  <div className="hidden h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-white sm:flex">
                    <Sparkles className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {visualizerSnapshot.map((item) => (
                    <div key={item.label} className="rounded-[1rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">How it works</p>
          <div className="mt-5 space-y-4">
            {visualizerSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex gap-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-base font-medium tracking-[-0.02em] text-slate-950">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.9)_100%)] px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Why it is useful</p>
          <div className="mt-5 rounded-[1.25rem] border border-sky-100 bg-white/90 p-4">
            <p className="text-lg font-medium tracking-[-0.02em] text-slate-950">Faster understanding for document-heavy work.</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Instead of reading large tables or dense reports line by line, teams can see the overall picture faster and spot patterns that deserve action.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {trustPoints.map((point) => (
              <div key={point} className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                {point}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="flex items-center gap-2 text-emerald-900">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-sm font-medium">Built for governed usage</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-950">
              Visualizer AI stays inside docrud accounts so analysis remains linked to user identity, workspace controls, and the wider workflow system.
            </p>
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">How it helps the business</p>
          <div className="mt-5 space-y-3">
            {businessReasons.map((item) => (
              <div key={item} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.9)_100%)] px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Where it fits best</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {visualizerUseCases.map((item) => (
              <article key={item.title} className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4">
                <h3 className="text-base font-medium tracking-[-0.02em] text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </PublicSiteChrome>
  );
}
