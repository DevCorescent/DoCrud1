'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FeatureGuideProps {
  title: string;
  purpose?: string;
  whyItMatters?: string[];
  tutorial: string[];
  examples: string[];
}

export default function FeatureGuide({ title, purpose, whyItMatters = [], tutorial, examples }: FeatureGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="clay-chip" onClick={() => setOpen((prev) => !prev)}>
          <BookOpen className="mr-2 h-4 w-4" />
          {open ? 'Hide Help' : 'How to use this'}
          {open ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
        </Button>
      </div>

      {open && (
        <Card className="clay-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Lightbulb className="h-5 w-5 text-orange-600" />
              {title}
            </CardTitle>
            {purpose && <p className="text-sm text-slate-600">{purpose}</p>}
          </CardHeader>
          <CardContent className="space-y-6">
            {whyItMatters.length > 0 && (
              <div className="rounded-2xl border border-orange-100 bg-orange-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">Why Teams Use This</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {whyItMatters.map((item) => (
                    <div key={item} className="rounded-2xl bg-white/90 p-4 text-sm text-slate-700 shadow-[inset_4px_4px_10px_rgba(255,255,255,0.9),inset_-4px_-4px_10px_rgba(251,146,60,0.12)]">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">How to get value from it</p>
              <div className="mt-3 space-y-3">
                {tutorial.map((step, index) => (
                  <div key={step} className="rounded-2xl bg-white/70 p-4 text-sm text-slate-700 shadow-[inset_4px_4px_10px_rgba(255,255,255,0.9),inset_-4px_-4px_10px_rgba(203,213,225,0.4)]">
                    <span className="mr-2 font-semibold text-slate-900">{index + 1}.</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">What good usage looks like</p>
              <div className="mt-3 space-y-3">
                {examples.map((example) => (
                  <div key={example} className="rounded-2xl bg-slate-950/95 p-4 text-sm text-slate-100 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                    {example}
                  </div>
                ))}
              </div>
            </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
