'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import DailyToolsCenter from '@/components/DailyToolsCenter';

interface PublicFormsBuilderPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

export default function PublicFormsBuilderPage({ softwareName, accentLabel, settings }: PublicFormsBuilderPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="space-y-5">
        <div className="flex flex-col gap-4 rounded-[1.5rem] border border-slate-200/80 bg-white/86 px-4 py-4 shadow-[0_22px_60px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Forms Builder
            </div>
            <h1 className="mt-3 text-[1.25rem] font-medium tracking-[-0.03em] text-slate-950 sm:text-[1.55rem]">Full-screen form workspace</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10 rounded-xl border-slate-300 bg-white px-4 text-slate-950 hover:bg-slate-950 hover:text-white">
              <Link href="/forms">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Forms
              </Link>
            </Button>
          </div>
        </div>

        {isAuthenticated ? (
          <DailyToolsCenter mode="forms" initialCategory="forms" initialTool="form-builder" />
        ) : (
          <div className="rounded-[1.5rem] border border-slate-200 bg-white/86 p-8 text-center shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
            <p className="text-lg font-semibold text-slate-950">Login required for Forms Builder</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to open the full-screen builder, publish forms, and manage submissions.</p>
            <div className="mt-5">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800">
                <Link href="/login">Login to continue</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </PublicSiteChrome>
  );
}
