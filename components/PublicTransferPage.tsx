'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, BarChart3, Clock3, Download, LockKeyhole, ShieldCheck, Upload } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

interface PublicTransferPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

export default function PublicTransferPage({ softwareName, accentLabel, settings }: PublicTransferPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const transferUseCases = [
    { title: 'Client handoff', detail: 'Send files with cleaner access control and better visibility into recipient activity.' },
    { title: 'Internal controlled delivery', detail: 'Move important files across teams without losing the audit trail.' },
    { title: 'Governed link operations', detail: 'Keep revoke, expiry, foldering, and status inside one visible module.' },
  ];

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.98)_42%,rgba(255,247,237,0.92)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <Upload className="h-4 w-4" />
              Secure File Transfers
            </div>
            <h1 className="mt-4 max-w-3xl text-[1.9rem] font-medium leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-[2.7rem] lg:text-[3.5rem]">
              Share files with the kind of
              <span className="ml-2 text-slate-700">control business work actually needs.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              File Transfers gives teams a governed way to upload, send, protect, and monitor important files, so delivery stays professional and visible from the first share to the final download.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                <Link href={isAuthenticated ? '/workspace?tab=file-transfers' : '/login'}>
                  {isAuthenticated ? 'Open File Transfers' : 'Login to Use Transfers'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/signup">Create Business Workspace</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Access control', value: 'Password, email verification, or both', icon: LockKeyhole },
              { label: 'Tracking', value: 'Open counts, downloads, and last activity', icon: BarChart3 },
              { label: 'Expiry', value: 'Set time-bound sessions and download limits', icon: Clock3 },
              { label: 'Recipient flow', value: 'Preview, download, and controlled access history', icon: Download },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{item.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Why it is useful</p>
          <div className="mt-5 space-y-3">
            {[
              'Lets teams share business files without depending on generic links or scattered tracking.',
              'Shows what the recipient actually did after the file was sent.',
              'Gives the sender one governed place to revoke, expire, or reorganize shared files later.',
            ].map((point) => (
              <div key={point} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {point}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,247,237,0.92)_100%)] px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-sm font-medium">Governed sharing</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            File transfers stay inside the workspace so sharing state, access history, and recipient activity remain visible instead of disappearing into external mail or storage tools.
          </p>
        </article>
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Where it fits best</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {transferUseCases.map((item) => (
            <article key={item.title} className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
              <h3 className="text-base font-medium tracking-[-0.02em] text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
