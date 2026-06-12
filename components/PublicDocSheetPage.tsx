'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, BarChart3, BrainCircuit, FileSpreadsheet, ShieldCheck, Sparkles, TableProperties } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

interface PublicDocSheetPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

const docsheetSteps = [
  {
    title: 'Create or import a sheet',
    description: 'Start fresh, upload an existing spreadsheet, or begin with a ready business sheet pack.',
    icon: FileSpreadsheet,
  },
  {
    title: 'Edit with AI and formulas',
    description: 'Use formulas, smart sheet packs, and AI-assisted changes to keep important operational sheets reliable.',
    icon: BrainCircuit,
  },
  {
    title: 'Turn data into decisions',
    description: 'Take the same sheet into charts, insights, and visual explanations without leaving the product.',
    icon: BarChart3,
  },
];

const docsheetBusinessBenefits = [
  'Keeps spreadsheet work inside the same governed product as documents, AI, sharing, and audit history.',
  'Lets teams use formulas, imports, AI edits, and ready sheet packs without jumping across disconnected tools.',
  'Brings operational sheets closer to reporting and decision support because visuals stay linked to the same workbook.',
];

const docsheetUseCases = [
  { title: 'Finance and ops trackers', detail: 'Budgets, reconciliations, collections, and review sheets that change often.' },
  { title: 'Service delivery planning', detail: 'Workbooks for project tracking, staffing plans, and operational review grids.' },
  { title: 'Leadership reporting', detail: 'Sheets that need to stay editable while also becoming easier to explain later.' },
];

export default function PublicDocSheetPage({ softwareName, accentLabel, settings }: PublicDocSheetPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.98)_46%,rgba(239,246,255,0.92)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <FileSpreadsheet className="h-4 w-4" />
              DocSheet
            </div>
            <h1 className="mt-4 max-w-3xl text-[1.9rem] font-medium leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-[2.7rem] lg:text-[3.5rem]">
              Spreadsheet work that feels
              <span className="ml-2 text-slate-700">more useful, connected, and business-ready.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              DocSheet gives teams one place to manage trackers, MIS sheets, reconciliations, planning workbooks, and AI-assisted spreadsheet operations without losing control, context, or visual clarity.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                <Link href={isAuthenticated ? '/docsheet' : '/login'}>
                  {isAuthenticated ? 'Open DocSheet' : 'Login to Use DocSheet'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/signup">Create Business Workspace</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/82 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem] sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
                {[
                { label: 'Studio mode', value: 'Multi-sheet workbooks, formulas, and imports' },
                { label: 'AI layer', value: 'Ask for changes or generate new sheets' },
                { label: 'Visual sync', value: 'Keep charts tied to sheet changes' },
                { label: 'Business use', value: 'MIS, budgets, collections, planning' },
              ].map((item, index) => (
                <div
                  key={item.label}
                  className={`rounded-[1.2rem] border px-4 py-4 ${index === 0 ? 'border-sky-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.9))]' : 'border-slate-200 bg-slate-50/90'}`}
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">How it works</p>
          <div className="mt-5 space-y-4">
            {docsheetSteps.map((step) => {
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
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Why it is powerful</p>
          <div className="mt-5 space-y-3">
            {[
              'Keeps spreadsheet work in the same governed environment as documents, sharing, and AI workflows.',
              'Lets operations teams edit real workbooks instead of working in static tables or disconnected chart tools.',
              'Connects sheet operations to visual understanding, so the same data becomes easier to explain to leadership.',
            ].map((point) => (
              <div key={point} className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                {point}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="flex items-center gap-2 text-emerald-900">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-sm font-medium">Built for operational sheets</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-950">
              DocSheet is designed for repeat business work like trackers, budgets, reviews, reconciliations, and controlled sheet sharing.
            </p>
          </div>
          <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center gap-2 text-slate-900">
              <TableProperties className="h-4 w-4" />
              <p className="text-sm font-medium">Why teams use it</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              It removes the split between editing sheet data and understanding what the numbers are actually saying.
            </p>
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">How it helps the business</p>
          <div className="mt-5 space-y-3">
            {docsheetBusinessBenefits.map((item) => (
              <div key={item} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.9)_100%)] px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Where teams use it</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {docsheetUseCases.map((item) => (
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
