'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchTracker, SEARCH_CONTEXTS } from '@/lib/search-tracking';
import { BookOpen, ExternalLink, Lightbulb, Rocket, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TutorialSection = {
  id: string;
  title: string;
  subtitle: string;
  audience: string;
  purpose: string;
  whyItMatters: string[];
  steps: string[];
  examples: string[];
};

const tutorials: TutorialSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard & Document Summary',
    subtitle: 'Use the analytics surfaces to understand usage, delivery, signature events, and feedback volume.',
    audience: 'All internal users',
    purpose: 'This is the command layer for monitoring what needs action, what is already progressing, and where teams are losing momentum.',
    whyItMatters: [
      'Teams use it to prioritize follow-ups instead of checking history and reports one by one.',
      'Leaders use it to spot stalled signatures, high-interest documents, and rising feedback before delays compound.',
    ],
    steps: [
      'Open Dashboard to review total documents, weekly activity, emails sent, top templates, and location-based signature patterns.',
      'Use the global search box to search by template name, reference number, device label, or recent activity and jump into the related summary.',
      'Move to Document Summary to see per-document opens, downloads, pending feedback, and recipient interaction data before you follow up.',
      'Use these views first each day to identify what is blocked, what is already progressing, and which workflows need intervention.',
    ],
    examples: [
      'Example: a sales coordinator checks Dashboard and sees one proposal with high opens but no signature. They move into Document Summary and follow up on that hot lead first.',
      'Example: HR notices rising feedback on onboarding packets and uses the summary table to identify which offer links are still pending review.',
    ],
  },
  {
    id: 'document-generation',
    title: 'Generate Documents',
    subtitle: 'Create signed, trackable documents with mandatory workflow controls and collaboration settings.',
    audience: 'Internal users with template access',
    purpose: 'This is the production workspace for creating final shareable documents, controlled intake forms, and governed recipient journeys.',
    whyItMatters: [
      'Teams use it to standardize outgoing documents so every letter, contract, or onboarding pack follows the same approved process.',
      'It reduces manual drafting errors by combining templates, signatures, access controls, and delivery from one place.',
    ],
	    steps: [
	      'Choose a template from the left sidebar. The form, readiness tracker, signature selector, and workflow settings are shown automatically.',
	      'Select a saved signature, fill all required fields, then choose whether recipient signing, recipient access, and required-document checks should apply.',
	      'Generate Preview to create the shareable record. After preview creation you can download PDF, open the share link, copy it, or send the document by email.',
	      'Use Restore Last Values to quickly prepare a new document from a previous run, especially for recurring HR, legal, or sales workflows.',
	    ],
    examples: [
      'Example: legal generates an NDA, sets recipient access to comment, emails the link, then tracks edits and review feedback from the same record.',
      'Example: HR generates an offer letter, requires recipient signature and pre-sign document verification, and uses the shared link for a controlled onboarding flow.',
    ],
  },
  {
    id: 'history',
    title: 'History & Reuse',
    subtitle: 'Use the history archive as an operational ledger for generation, delivery, and signing.',
    audience: 'Internal users',
    purpose: 'This is the running ledger for what was created, sent, opened, edited, and signed across the organization.',
    whyItMatters: [
      'Operations teams use it to verify what happened before escalating support or compliance questions.',
      'Frequent issuers use it to reuse successful runs and shorten turnaround for repeat document cycles.',
    ],
	    steps: [
	      'Open History to review all generated documents, delivery outcomes, required-document status, comments, and recipient signatures.',
	      'Use Reuse on any successful document to repopulate the template form and speed up repetitive drafting.',
	      'Open or copy the live document link directly from History when you need to resend, verify, or troubleshoot the recipient workflow.',
	      'Treat History as the audit trail for operational follow-up before moving to deeper review and governance work.',
	    ],
    examples: [
      'Example: operations reuses a previous vendor contract to issue a near-identical contract for a new supplier in under a minute.',
      'Example: support opens History to verify whether a recipient actually received and signed a document before escalating the case.',
    ],
  },
  {
	    id: 'onboarding',
	    title: 'Employee Onboarding & Background Verification',
	    subtitle: 'Run onboarding with employee account creation, verification submission, reviewer checks, and gated offer signing.',
	    audience: 'HR, Reviewer, Employee',
	    purpose: 'This workflow turns onboarding into a controlled multi-step process instead of a scattered email-and-attachment exchange.',
	    whyItMatters: [
	      'HR teams use it to collect KYC and joining documents before final signing without losing review visibility.',
	      'Workspace owners use it to gate offer completion until verification is complete, reducing compliance risk.',
	    ],
	    steps: [
	      'Generate an HR onboarding document and fill the Employee Onboarding Access section with employee name, email, department, designation, and code.',
	      'The platform automatically creates a protected employee account, enables mandatory background verification, and attaches the required BGV document checklist.',
	      'The employee logs into Employee Portal, completes the verification profile, uploads KYC and employment documents, tracks onboarding progress, and asks questions.',
	      'A workspace reviewer checks the onboarding record, verifies or rejects the BGV package, and only verified records unlock final offer signing.',
	    ],
	    examples: [
	      'Example: HR creates an internship letter for a new intern. The intern receives temporary credentials, uploads Aadhaar, PAN, resume, and college documents, then signs only after verification approval.',
	      'Example: a reviewer rejects a BGV package because the last employer proof is missing, adds notes, and the employee sees the issue immediately in their portal.',
	    ],
	  },
	];

type TutorialCategory = 'Core' | 'Workflow';

function getTutorialCategory(id: string): TutorialCategory {
  if (id === 'dashboard' || id === 'document-generation' || id === 'history') return 'Core';
  return 'Workflow';
}

function getWorkspaceLinkForTutorial(id: string): string | null {
  if (id === 'dashboard') return '/workspace?tab=dashboard';
  if (id === 'document-generation') return '/workspace?tab=generate';
  if (id === 'history') return '/workspace?tab=history';
  if (id === 'onboarding') return '/workspace?tab=generate';
  return null;
}

export default function TutorialsCenter() {
  const [openId, setOpenId] = useState<string>(tutorials[0].id);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TutorialCategory | 'All'>('All');
  const [mobilePane, setMobilePane] = useState<'topics' | 'guide'>('topics');

  const selected = useMemo(
    () => tutorials.find((item) => item.id === openId) || tutorials[0],
    [openId],
  );

  const categories = useMemo(() => {
    const items = new Set<TutorialCategory>();
    tutorials.forEach((item) => items.add(getTutorialCategory(item.id)));
    return ['All', ...Array.from(items)] as const;
  }, []);

  const trackSearch = useSearchTracker(SEARCH_CONTEXTS.TUTORIALS);
  const filteredTutorials = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tutorials.filter((item) => {
      if (category !== 'All' && getTutorialCategory(item.id) !== category) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q)
        || item.subtitle.toLowerCase().includes(q)
        || item.audience.toLowerCase().includes(q)
        || item.purpose.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  useEffect(() => {
    if (query.trim()) trackSearch(query, filteredTutorials.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filteredTutorials.length]);

  const workspaceLink = useMemo(() => getWorkspaceLinkForTutorial(selected.id), [selected.id]);

  return (
    <div className="space-y-6">
      <Card className="cloud-panel overflow-hidden">
        <CardContent className="p-5 sm:p-6">
	          <div className="flex items-center justify-between">
	            <p className="text-sm font-semibold text-slate-950">Tutorial Center</p>
	            <div />
	          </div>
	        </CardContent>
	      </Card>

      <div className="lg:hidden">
        <Tabs value={mobilePane} onValueChange={(value) => setMobilePane(value as typeof mobilePane)}>
          <TabsList className="w-full justify-start rounded-2xl bg-white/60 p-1 backdrop-blur">
            <TabsTrigger value="topics" className="flex-1 rounded-xl">Topics</TabsTrigger>
            <TabsTrigger value="guide" className="flex-1 rounded-xl">Guide</TabsTrigger>
          </TabsList>
          <TabsContent value="topics" className="mt-4 space-y-4">
            <Card className="cloud-panel">
              <CardContent className="space-y-3 p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tutorials" className="pl-9" />
                </div>
                <div className="flex gap-2 overflow-auto pb-1">
                  {categories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${category === item ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/70 text-slate-700'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="cloud-panel">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-slate-900" />
                  Topics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredTutorials.map((item) => {
                  const isOpen = item.id === selected.id;
                  const itemCategory = getTutorialCategory(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setOpenId(item.id);
                        setMobilePane('guide');
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isOpen
                          ? 'border-slate-900 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white/70 text-slate-900 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className={`mt-1 text-xs ${isOpen ? 'text-slate-300' : 'text-slate-500'}`}>{itemCategory} · {item.audience}</p>
                      <p className={`mt-2 line-clamp-2 text-xs leading-5 ${isOpen ? 'text-slate-200' : 'text-slate-600'}`}>{item.subtitle}</p>
                    </button>
                  );
                })}
                {filteredTutorials.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
                    No tutorials match your search.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guide" className="mt-4 space-y-4">
            <Card className="cloud-panel">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 backdrop-blur">
                    <Rocket className="h-3.5 w-3.5 text-slate-900" />
                    {getTutorialCategory(selected.id)}
                  </div>
                  {workspaceLink ? (
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => window.open(workspaceLink, '_self')}>
                      Open feature
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <CardTitle className="text-xl">{selected.title}</CardTitle>
                <p className="text-sm text-slate-600">{selected.subtitle}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="overview">
                  <TabsList className="w-full justify-start rounded-2xl bg-white/60 p-1 backdrop-blur">
                    <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
                    <TabsTrigger value="steps" className="rounded-xl">Steps</TabsTrigger>
                    <TabsTrigger value="examples" className="rounded-xl">Examples</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Purpose</p>
                      <p className="mt-2 text-sm leading-6 text-slate-800">{selected.purpose}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Why it matters</p>
                      <div className="mt-3 space-y-2">
                        {selected.whyItMatters.map((item) => (
                          <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-900" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="steps" className="mt-4 space-y-2">
                    {selected.steps.map((step, index) => (
                      <div key={`${selected.id}-m-step-${index}`} className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-800">
                        <span className="mr-2 font-semibold text-slate-900">{index + 1}.</span>
                        {step}
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="examples" className="mt-4 space-y-2">
                    {selected.examples.map((example, index) => (
                      <div key={`${selected.id}-m-example-${index}`} className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                          <Lightbulb className="h-4 w-4" />
                          Example
                        </div>
                        {example}
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="hidden lg:grid lg:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="cloud-panel">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5 text-slate-900" />
              Topics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tutorials" className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${category === item ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/70 text-slate-700'}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
              {filteredTutorials.map((item) => {
                const isOpen = item.id === selected.id;
                const itemCategory = getTutorialCategory(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isOpen
                        ? 'border-slate-900 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white/70 text-slate-900 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className={`mt-1 text-xs ${isOpen ? 'text-slate-300' : 'text-slate-500'}`}>{itemCategory} · {item.audience}</p>
                    <p className={`mt-2 line-clamp-2 text-xs leading-5 ${isOpen ? 'text-slate-200' : 'text-slate-600'}`}>{item.subtitle}</p>
                  </button>
                );
              })}
              {filteredTutorials.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
                  No tutorials match your search.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="cloud-panel">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 backdrop-blur">
                <Rocket className="h-3.5 w-3.5 text-slate-900" />
                {getTutorialCategory(selected.id)} · {selected.audience}
              </div>
              {workspaceLink ? (
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => window.open(workspaceLink, '_self')}>
                  Open feature
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <CardTitle className="text-2xl">{selected.title}</CardTitle>
            <p className="text-sm text-slate-600">{selected.subtitle}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="overview">
              <TabsList className="w-full justify-start rounded-2xl bg-white/60 p-1 backdrop-blur">
                <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
                <TabsTrigger value="steps" className="rounded-xl">Steps</TabsTrigger>
                <TabsTrigger value="examples" className="rounded-xl">Examples</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Purpose</p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{selected.purpose}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Why it matters</p>
                  <div className="mt-3 space-y-2">
                    {selected.whyItMatters.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-900" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="steps" className="mt-4 space-y-2">
                {selected.steps.map((step, index) => (
                  <div key={`${selected.id}-d-step-${index}`} className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-800">
                    <span className="mr-2 font-semibold text-slate-900">{index + 1}.</span>
                    {step}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="examples" className="mt-4 space-y-2">
                {selected.examples.map((example, index) => (
                  <div key={`${selected.id}-d-example-${index}`} className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                      <Lightbulb className="h-4 w-4" />
                      Example
                    </div>
                    {example}
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
