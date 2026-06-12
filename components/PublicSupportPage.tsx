'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleHelp, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import { LandingSettings } from '@/types/document';
import { supportFaqs, supportQuickPrompts } from '@/lib/support-faqs';

type PublicSupportPageProps = {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
};

type SupportResponse = {
  answer: string;
  bullets?: string[];
  suggestedActions?: string[];
  relatedFaqs?: Array<{
    id: string;
    category: string;
    question: string;
    answer: string;
    actions: string[];
  }>;
  confidenceLabel?: string;
  provider?: string;
};

export default function PublicSupportPage({ softwareName, accentLabel, settings }: PublicSupportPageProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SupportResponse | null>(null);
  const [error, setError] = useState('');

  const submitQuestion = async (preset?: string) => {
    const value = (preset ?? query).trim();
    if (!value) {
      return;
    }

    setLoading(true);
    setError('');
    if (!preset) {
      setQuery('');
    }

    try {
      const apiResponse = await fetch('/api/ai/public-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value }),
      });
      const payload = await apiResponse.json().catch(() => null);
      if (!apiResponse.ok) {
        throw new Error(payload?.error || 'Support is unavailable right now.');
      }

      setResponse(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Support is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6 rounded-[2rem] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.9)_55%,rgba(239,246,255,0.84)_100%)] p-6 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-slate-900" />
            AI Support
          </div>
          <div>
            <h1 className="text-[2rem] font-medium leading-[1.03] tracking-[-0.045em] text-slate-950 sm:text-[3rem]">
              Understand docrud faster,
              <span className="ml-2 text-slate-600">with guided answers before you even log in.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              This support page helps visitors understand plans, onboarding, AI tools, file workflows, sheet workflows, and business use cases so it is easier to decide whether docrud fits their work.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Coverage', value: 'Plans, AI tools, files, docs', icon: CircleHelp },
              { label: 'Guidance', value: 'Clear next steps', icon: ArrowRight },
              { label: 'Trust', value: 'FAQ plus AI support', icon: ShieldCheck },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.25rem] border border-white/80 bg-white/78 p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] backdrop-blur">
                <item.icon className="h-4 w-4 text-slate-900" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-[1.35rem] border border-slate-200 bg-white/82 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Popular questions</p>
            <div className="mt-4 space-y-3">
              {supportFaqs.slice(0, 5).map((faq) => (
                <button
                  key={faq.id}
                  type="button"
                  onClick={() => void submitQuestion(faq.question)}
                  className="w-full rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  <p className="font-medium text-slate-900">{faq.question}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{faq.category}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6 rounded-[2rem] border border-white/80 bg-white/82 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:p-8">
          <div className="rounded-[1.5rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.94))] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
            <div className="flex flex-wrap gap-2">
              {supportQuickPrompts.map((prompt) => (
                <Button key={prompt} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void submitQuestion(prompt)} disabled={loading}>
                  {prompt}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask about pricing, onboarding, DoXpert, Visualizer, DocSheet, secure transfers, or how docrud helps your workflow"
                className="min-h-[140px] w-full rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
              />
              <Button type="button" className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => void submitQuestion()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ask Support
              </Button>
            </div>
          </div>

          {error ? <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/85 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Support response</p>
            {response ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[1.2rem] border border-white/80 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                  {response.confidenceLabel ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{response.confidenceLabel}</p> : null}
                  <p className="mt-2 text-sm leading-7 text-slate-700">{response.answer}</p>
                </div>

                {response.bullets?.length ? (
                  <div className="space-y-2">
                    {response.bullets.map((bullet) => (
                      <div key={bullet} className="flex items-start gap-2 rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-900" />
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {response.relatedFaqs?.length ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Related topics</p>
                    {response.relatedFaqs.map((faq) => (
                      <div key={faq.id} className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3">
                        <p className="text-sm font-medium text-slate-900">{faq.question}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-[1.2rem] border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-sm text-slate-500">
                Ask a question to see guided product support, feature direction, and recommended next steps here.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-xl border-slate-300 bg-white text-slate-950 hover:bg-slate-950 hover:text-white">
              <Link href="/login">Login for workspace support</Link>
            </Button>
            <Button asChild className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
              <Link href="/signup">Start with docrud</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicSiteChrome>
  );
}
