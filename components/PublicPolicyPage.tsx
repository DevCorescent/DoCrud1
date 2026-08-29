'use client';

import { useEffect, useState } from 'react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { LandingSettings } from '@/types/document';
import { policyCompany, PolicyDefinition } from '@/lib/policies';

/**
 * The shared surface behind every legal page — Terms, the privacy and document
 * policies, and the rest. One component, so the set cannot drift apart.
 *
 * THEME: the page follows the app's own light/dark preference instead of being
 * permanently light. `PublicSiteChrome` already carries a complete dark
 * treatment behind its `darkMode` prop (28 branches); nothing here passed it,
 * so the legal pages rendered white regardless of what the rest of the product
 * was doing. This reads the same `.dark` marker `ThemeController` sets on
 * <html> and hands it to the chrome, then styles the document to match — one
 * boolean drives both, so the document and its chrome can never disagree.
 *
 * The legal TEXT is untouched: every section and paragraph is rendered exactly
 * as `lib/policies.ts` defines it. Only presentation changed.
 */

type PublicPolicyPageProps = {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
  policy: PolicyDefinition;
};

/**
 * Tracks the document's colour mode.
 *
 * Starts light so the server render and the first client render agree — the
 * value cannot be known during SSR, and guessing would be a hydration
 * mismatch. The observer keeps it in step when the visitor flips the theme,
 * without polling.
 */
function useDocumentDarkMode(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains('dark'));
    read();

    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

export default function PublicPolicyPage({ softwareName, accentLabel, settings, policy }: PublicPolicyPageProps) {
  const dark = useDocumentDarkMode();

  /* Surface tokens, in the two languages the product already speaks: the
     marketplace's near-black glass, and the existing light policy styling
     unchanged so nothing regresses for light-mode readers. */
  const shell = dark
    ? 'rounded-[1.6rem] border border-white/[0.07] bg-white/[0.025] px-4 py-5 sm:px-7 sm:py-8 lg:px-10'
    : 'rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.97)_45%,rgba(239,246,255,0.9)_100%)] px-4 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-7 sm:py-8 lg:px-10';

  const docShell = dark
    ? 'rounded-[1.6rem] border border-white/[0.07] bg-white/[0.02] px-4 py-5 sm:px-7 sm:py-8 lg:px-10'
    : 'rounded-[1.6rem] border border-slate-200/80 bg-white px-4 py-5 shadow-[0_18px_52px_rgba(15,23,42,0.05)] sm:px-7 sm:py-8 lg:px-10';

  const metaCard = dark
    ? 'rounded-[1.15rem] border border-white/[0.07] bg-white/[0.03] px-4 py-4'
    : 'rounded-[1.15rem] border border-slate-200 bg-white/92 px-4 py-4';

  const eyebrow = dark ? 'text-white/35' : 'text-slate-500';
  const heading = dark ? 'text-white' : 'text-slate-950';
  const bodyText = dark ? 'text-white/55' : 'text-slate-600';
  const metaLabel = dark ? 'text-white/35' : 'text-slate-500';
  const metaValue = dark ? 'text-white/85' : 'text-slate-950';
  const rule = dark ? 'border-white/[0.06]' : 'border-slate-200';

  const note = dark
    ? 'rounded-[1.25rem] border border-amber-400/20 bg-amber-400/[0.06] px-5 py-4 text-sm leading-6 text-amber-100/80'
    : 'rounded-[1.25rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950';

  return (
    <PublicSiteChrome
      softwareName={softwareName}
      accentLabel={accentLabel}
      settings={settings}
      darkMode={dark}
    >
      <section className={shell}>
        <div className="max-w-4xl">
          <p className={`text-[10px] font-medium uppercase tracking-[0.28em] sm:text-[11px] ${eyebrow}`}>Policy document</p>
          <h1 className={`mt-3 text-[1.8rem] font-medium tracking-[-0.03em] sm:text-[2.6rem] ${heading}`}>{policy.title}</h1>
          <p className={`mt-4 max-w-3xl text-sm leading-7 sm:text-base ${bodyText}`}>{policy.subtitle}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className={metaCard}>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${metaLabel}`}>Product</p>
              <p className={`mt-2 text-sm font-medium ${metaValue}`}>{policyCompany.productName}</p>
            </div>
            <div className={metaCard}>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${metaLabel}`}>Parent company</p>
              <p className={`mt-2 text-sm font-medium ${metaValue}`}>{policyCompany.parentCompanyName}</p>
            </div>
            <div className={metaCard}>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${metaLabel}`}>Version</p>
              <p className={`mt-2 text-sm font-medium ${metaValue}`}>{policyCompany.policyVersion}</p>
              <p className={`mt-1 text-xs ${metaLabel}`}>Effective {policyCompany.effectiveDateLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section className={docShell}>
        {/* One cohesive document rather than a card per section: sections are
            separated by a hairline rule, which reads as a legal document
            instead of a stack of boxes. The text itself is unchanged. */}
        <div className="max-w-4xl">
          {policy.sections.map((section, index) => (
            <article
              key={section.title}
              className={index === 0 ? '' : `mt-8 border-t pt-8 ${rule}`}
            >
              <h2 className={`text-xl font-medium tracking-[-0.02em] ${heading}`}>{section.title}</h2>
              <div className="mt-3 space-y-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className={`text-sm leading-7 ${bodyText}`}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}

          <div className={`mt-8 ${note}`}>
            These policy pages describe how {policyCompany.productName} is intended to operate as a software product. They do not replace independent legal, compliance, or professional advice for the user’s specific facts, industry, or jurisdiction.
          </div>
        </div>
      </section>
    </PublicSiteChrome>
  );
}
