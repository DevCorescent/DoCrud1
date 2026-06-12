'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileStack, PencilRuler, ShieldCheck, Sparkles } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

interface PublicPdfEditorPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

export default function PublicPdfEditorPage({ softwareName, accentLabel, settings }: PublicPdfEditorPageProps) {
  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="premium-surface overflow-hidden rounded-[1.7rem] bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.16),transparent_22%),radial-gradient(circle_at_top_right,rgba(251,146,60,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-5 sm:rounded-[2rem] sm:px-6 sm:py-7 lg:px-8 xl:px-10">
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white">
              <PencilRuler className="h-4 w-4" />
              PDF Editor
            </div>
            <h1 className="mt-4 max-w-4xl text-[1.85rem] font-medium leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[2.5rem] lg:text-[3.4rem]">
              Edit PDFs in a full workspace, not a tiny utility box.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Upload a PDF, then reorder pages, merge files, rotate, split, watermark, clean metadata, and export from one polished editor.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="premium-button h-11 rounded-xl px-6 text-white hover:opacity-95">
                <Link href="/pdf-editor/workspace">
                  Try Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/daily-tools">Open Daily Tools</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: FileStack, title: 'Core editing', text: 'Merge, split, reorder, remove, duplicate, and extract pages.' },
              { icon: Sparkles, title: 'Advanced polish', text: 'Add watermarks, page numbers, blank pages, and cleaner metadata.' },
              { icon: ShieldCheck, title: 'Free flow', text: 'Runs in-browser for quick edits without a paid gate.' },
              { icon: PencilRuler, title: 'Full workspace', text: 'Big preview, side controls, and a proper export flow.' },
            ].map((item, index) => {
              const Icon = item.icon;
              const tone = index === 0 ? 'premium-card-smoke' : index === 1 ? 'premium-card-warm' : index === 2 ? 'premium-card-ivory' : 'premium-card-rose';
              return (
                <div key={item.title} className={`${tone} rounded-[1.3rem] p-5 shadow-[0_14px_32px_rgba(15,23,42,0.06)]`}>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/75 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                    <Icon className="h-5 w-5 text-slate-900" />
                  </div>
                  <p className="mt-4 text-base font-medium tracking-[-0.02em] text-slate-950">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="premium-surface rounded-[1.5rem] px-4 py-5 sm:rounded-[2rem] sm:px-6 sm:py-7 lg:px-8 xl:px-10">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            'Upload and preview any PDF',
            'Keep only the pages you need',
            'Rotate or reorder before export',
            'Download the updated PDF instantly',
          ].map((item, index) => (
            <div key={item} className={`${index % 2 === 0 ? 'premium-card-ivory' : 'premium-card-smoke'} rounded-[1.2rem] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]`}>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
                <p className="text-sm leading-6 text-slate-700">{item}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
