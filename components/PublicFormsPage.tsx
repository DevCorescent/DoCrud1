'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, FileSpreadsheet, LockKeyhole, QrCode, Sparkles } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

interface PublicFormsPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

const formHighlights = [
  { label: 'Builder', value: 'Full screen' },
  { label: 'Access', value: 'Free with login' },
  { label: 'Share', value: 'Link, QR, WhatsApp' },
  { label: 'Control', value: 'Open or secure' },
];

const formCapabilities = [
  'Live builder with instant preview',
  'Media, CTAs, and branded styling',
  'QR sharing, security, and response history',
];

export default function PublicFormsPage({ softwareName, accentLabel, settings }: PublicFormsPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.98)_54%,rgba(255,247,237,0.92)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <FileSpreadsheet className="h-4 w-4" />
              Forms
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">FREE</span>
            </div>
            <h1 className="mt-4 max-w-3xl text-[1.9rem] font-medium leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-[2.7rem] lg:text-[3.5rem]">
              Build forms that look
              <span className="ml-2 text-slate-700">clean, modern, and ready to share.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Design fast, share by link or QR, and keep responses in one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                <Link href={isAuthenticated ? '/forms/builder' : '/login'}>
                  {isAuthenticated ? 'Open Forms Builder' : 'Login to Build Forms'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/signup">Create Workspace</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/82 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem] sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {formHighlights.map((item, index) => (
                <div
                  key={item.label}
                  className={`rounded-[1.2rem] border px-4 py-4 ${index === 0 ? 'border-amber-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,247,237,0.9))]' : 'border-slate-200 bg-slate-50/90'}`}
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              {formCapabilities.map((point) => (
                <div key={point} className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                  {point}
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                { icon: Sparkles, title: 'Experience', text: 'Premium layout controls' },
                { icon: LockKeyhole, title: 'Security', text: 'Protected or open access' },
                { icon: QrCode, title: 'Sharing', text: 'Instant QR handoff' },
              ].map((item) => (
                <div key={item.title} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <item.icon className="h-4 w-4 text-slate-900" />
                  <p className="mt-3 text-sm font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PublicSiteChrome>
  );
}
