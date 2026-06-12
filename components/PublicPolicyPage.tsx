'use client';

import PublicSiteChrome from '@/components/PublicSiteChrome';
import { LandingSettings } from '@/types/document';
import { policyCompany, PolicyDefinition } from '@/lib/policies';

type PublicPolicyPageProps = {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
  policy: PolicyDefinition;
};

export default function PublicPolicyPage({ softwareName, accentLabel, settings, policy }: PublicPolicyPageProps) {
  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.97)_45%,rgba(239,246,255,0.9)_100%)] px-4 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-7 sm:py-8 lg:px-10">
        <div className="max-w-4xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500 sm:text-[11px]">Policy document</p>
          <h1 className="mt-3 text-[1.8rem] font-medium tracking-[-0.03em] text-slate-950 sm:text-[2.6rem]">{policy.title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{policy.subtitle}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.15rem] border border-slate-200 bg-white/92 px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Product</p>
              <p className="mt-2 text-sm font-medium text-slate-950">{policyCompany.productName}</p>
            </div>
            <div className="rounded-[1.15rem] border border-slate-200 bg-white/92 px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Parent company</p>
              <p className="mt-2 text-sm font-medium text-slate-950">{policyCompany.parentCompanyName}</p>
            </div>
            <div className="rounded-[1.15rem] border border-slate-200 bg-white/92 px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Version</p>
              <p className="mt-2 text-sm font-medium text-slate-950">{policyCompany.policyVersion}</p>
              <p className="mt-1 text-xs text-slate-500">Effective {policyCompany.effectiveDateLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-slate-200/80 bg-white px-4 py-5 shadow-[0_18px_52px_rgba(15,23,42,0.05)] sm:px-7 sm:py-8 lg:px-10">
        <div className="max-w-4xl space-y-6">
          {policy.sections.map((section) => (
            <article key={section.title} className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.94))] px-5 py-5">
              <h2 className="text-xl font-medium tracking-[-0.02em] text-slate-950">{section.title}</h2>
              <div className="mt-3 space-y-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-7 text-slate-650 text-slate-600">
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}

          <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            These policy pages describe how {policyCompany.productName} is intended to operate as a software product. They do not replace independent legal, compliance, or professional advice for the user’s specific facts, industry, or jurisdiction.
          </div>
        </div>
      </section>
    </PublicSiteChrome>
  );
}
