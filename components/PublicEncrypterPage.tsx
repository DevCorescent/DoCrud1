'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck, ShieldEllipsis, Sparkles } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

interface PublicEncrypterPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

export default function PublicEncrypterPage({ softwareName, accentLabel, settings }: PublicEncrypterPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const securityBenefits = [
    'Adds stronger protection when the file itself needs security beyond ordinary link access.',
    'Lets senders separate delivery secrets instead of relying on one shared password.',
    'Keeps decrypt, preview, and download activity visible so sensitive delivery still stays operationally governed.',
  ];
  const encrypterUseCases = [
    { title: 'Sensitive client files', detail: 'For documents that should not be exposed through a basic shared link alone.' },
    { title: 'High-control internal handoff', detail: 'For teams that need stronger gated delivery than ordinary file transfer.' },
    { title: 'Premium access workflows', detail: 'For businesses that want a visibly stronger delivery posture for selected records.' },
  ];

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.98)_44%,rgba(245,243,255,0.92)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <ShieldEllipsis className="h-4 w-4" />
              Document Encrypter
            </div>
            <h1 className="mt-4 max-w-3xl text-[1.9rem] font-medium leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-[2.7rem] lg:text-[3.5rem]">
              Protect the file itself,
              <span className="ml-2 text-slate-700">not only the link used to send it.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Document Encrypter is built for high-sensitivity delivery. The file is stored in encrypted form and only reconstructed after the receiver supplies the required credential set.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                <Link href={isAuthenticated ? '/workspace?tab=document-encrypter' : '/login'}>
                  {isAuthenticated ? 'Open Encrypter' : 'Login to Use Encrypter'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/pricing">View Plans</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/82 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem] sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Password 1', value: 'Transfer password', icon: KeyRound },
                { label: 'Password 2', value: 'Secure password', icon: LockKeyhole },
                { label: 'Password 3', value: 'Parser password', icon: ShieldCheck },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-[1.2rem] border border-slate-200 bg-slate-50/90 px-4 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{item.value}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-[1.2rem] border border-violet-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.92))] px-4 py-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Sparkles className="h-4 w-4" />
                <p className="text-sm font-medium">Encrypted delivery flow</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The sender can distribute the credentials separately, which makes the delivery flow materially stronger than a basic one-password share.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Why it is different</p>
          <div className="mt-5 space-y-3">
            {securityBenefits.map((point) => (
              <div key={point} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {point}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,243,255,0.92)_100%)] px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-sm font-medium">Premium security layer</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This feature is positioned as a premium control because it is meant for more sensitive delivery scenarios than standard file sharing.
          </p>
        </article>
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-sky-700">Where it fits best</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {encrypterUseCases.map((item) => (
            <article key={item.title} className="rounded-[1.2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] px-4 py-4">
              <h3 className="text-base font-medium tracking-[-0.02em] text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
