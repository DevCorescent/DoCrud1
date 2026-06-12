'use client';

import Link from 'next/link';
import { ArrowRight, LockKeyhole, ShieldCheck, Unlock } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import SecureAccessCenter from '@/components/SecureAccessCenter';
import { Button } from '@/components/ui/button';
import type { LandingSettings } from '@/types/document';

type PublicOfflineUnlockPageProps = {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
};

export default function PublicOfflineUnlockPage({ softwareName, accentLabel, settings }: PublicOfflineUnlockPageProps) {
  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="space-y-8">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6 rounded-[2rem] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94)_0%,rgba(248,250,252,0.9)_55%,rgba(255,247,237,0.86)_100%)] p-6 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/78 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 backdrop-blur">
              <LockKeyhole className="h-3.5 w-3.5 text-slate-900" />
              Public Unlock
            </div>
            <div>
              <h1 className="text-[2rem] font-medium leading-[1.03] tracking-[-0.045em] text-slate-950 sm:text-[3rem]">
                Unlock protected files,
                <span className="ml-2 text-slate-600">without opening the workspace.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Upload the locked package, enter the password shared by the sender, and download the original file securely from this public page.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Formats', value: '.docrudlock, .securedoc, .dlock', icon: Unlock },
                { label: 'Security', value: 'Password required', icon: ShieldCheck },
                { label: 'Access', value: 'No login needed', icon: ArrowRight },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.25rem] border border-white/80 bg-white/78 p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] backdrop-blur">
                  <item.icon className="h-4 w-4 text-slate-900" />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" className="rounded-xl border-slate-300 bg-white text-slate-950 hover:bg-slate-950 hover:text-white">
                <Link href="/login">Open workspace</Link>
              </Button>
              <Button asChild className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                <Link href="/document-encrypter">Explore secure delivery</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/80 bg-white/82 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:p-8">
            <SecureAccessCenter mode="offline-locker" variant="unlock-only" />
          </div>
        </div>
      </section>
    </PublicSiteChrome>
  );
}
