'use client';

import { ArrowLeft, ArrowRight, Compass, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';
import type { WorkspaceTourStep } from '@/lib/workspace-tour';

type WorkspaceTourProps = {
  open: boolean;
  title: string;
  summary: string;
  steps: WorkspaceTourStep[];
  currentStepIndex: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
};

export default function WorkspaceTour({
  open,
  title,
  summary,
  steps,
  currentStepIndex,
  onClose,
  onPrevious,
  onNext,
  onFinish,
}: WorkspaceTourProps) {
  if (!open || steps.length === 0) {
    return null;
  }

  const step = steps[Math.max(0, Math.min(currentStepIndex, steps.length - 1))];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex min-h-full items-start justify-center sm:items-center">
      <div className="my-3 w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.9))] shadow-[0_35px_120px_rgba(15,23,42,0.28)] backdrop-blur-2xl">
        <div className="border-b border-slate-200/80 bg-white/70 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-800">
                <Compass className="h-3.5 w-3.5" />
                Virtual Tour
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{summary}</p>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={onClose} className="shrink-0 rounded-full bg-white/80">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-0 lg:max-h-[78vh] lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200/80 bg-slate-50/80 p-5 lg:max-h-[78vh] lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tour Progress</p>
            <div className="mt-4 space-y-2">
              {steps.map((item, index) => {
                const active = index === currentStepIndex;
                const done = index < currentStepIndex;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border px-3 py-3 text-sm ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                        : done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">Step {index + 1}</p>
                    <p className="mt-1 font-medium">{item.title}</p>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="max-h-[78vh] overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-800">
                {step.feature.replace('-', ' ')}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {currentStepIndex + 1} of {steps.length}
              </span>
            </div>

            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{step.title}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{step.description}</p>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">What This Feature Does</p>
                <p className="mt-3 text-sm leading-7 text-slate-700">{step.whatItDoes}</p>
                <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">Practical Example</p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">{step.example}</p>
                </div>
                <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-800">Best Use Case</p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">{step.bestFor}</p>
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">What To Focus On</p>
                <div className="mt-4 space-y-3">
                  {step.highlights.map((item) => (
                    <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.95))] p-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Pro Tip
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-700">{step.tip}</p>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white/85 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">How To Read This Tour</p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                    <p>1. Read what the feature does so you understand its purpose before using it.</p>
                    <p>2. Review the example to see how a real user would apply it inside docrud.</p>
                    <p>3. Follow the focus points while exploring the feature tab in the background.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                The workspace switches to the relevant tab automatically while this tour runs.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={onPrevious} disabled={isFirst}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                {!isLast ? (
                  <Button type="button" onClick={onNext} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                    Next Step
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={onFinish} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                    Finish Tour
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
