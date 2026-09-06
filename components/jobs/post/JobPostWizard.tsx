'use client';

/**
 * The job-posting wizard.
 *
 * WHAT THIS REPLACES. The composer was one page holding all thirteen fields in
 * a single scroll region. This is the same fields, the same state object and
 * the same request, presented as seven steps that each fit a viewport.
 *
 * WHAT IT DELIBERATELY DOES NOT CHANGE:
 *  · The endpoint. Still the one POST /api/hiring/jobs, still the same body
 *    (buildJobPayload), still `id` in the body for an edit with ownership
 *    decided server-side from the session.
 *  · The ?edit=<jobId> entry, which loads through the endpoint that already
 *    scopes jobs to the viewer.
 *  · The route. /jobs/post keeps its metadata and its place in the sitemap;
 *    the step lives in `?step=`, so browser Back/Forward walks the wizard and
 *    a refresh lands where the poster was.
 *
 * DRAFTS. Two mechanisms, deliberately distinct. The local draft (localStorage)
 * survives a refresh or a closed tab from the very first keystroke. The SERVER
 * draft is a real posting with status 'draft', and it cannot exist before the
 * server's own requirements — title AND description — are met, which is why
 * "Save draft" appears from the Requirements step and not before. No new
 * endpoint was invented for it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jobUrgencyLabel } from '@/lib/job-urgency';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Briefcase, Check, CloudUpload, Loader2 } from 'lucide-react';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS,
} from '@/lib/jobs-ui';
import {
  EMPTY_DRAFT, FIRST_SERVER_DRAFT_STEP, STEPS, buildJobPayload, canSaveServerDraft,
  clearLocalDraft, draftFromJob, draftHasContent, isStepId, readLocalDraft,
  saveLocalDraft, stepIndex, validateStep,
  type FieldErrors, type JobDraft, type StepId,
} from '@/lib/jobs/post-wizard';
import { applyColorMode, getStoredColorMode, type ColorMode } from '@/app/components/ThemeController';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import { formatSalary, type JobPreviewPoster } from '../JobPostPreview';
import { GLASS, MUTED, FAINT } from './ui';
import { StepArt } from './StepArt';
import { BTN_QUIET, WizardFooter, WizardProgress } from './WizardChrome';
import {
  BasicsHelp, CompensationHelp, JobBasicsStep, JobCompensationStep, JobDetailsStep,
  JobPreviewStep, JobPublishStep, JobRequirementsStep, JobScreeningStep,
  RequirementsHelp, ScreeningHelp,
} from './steps';

export default function JobPostWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params?.get('edit') ?? '';

  const [step, setStep] = useState<StepId>('basics');
  const [draft, setDraft] = useState<JobDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [poster, setPoster] = useState<JobPreviewPoster | null>(null);
  const [posted, setPosted] = useState<{ id: string; title: string; status: string } | null>(null);
  const [mode, setMode] = useState<ColorMode>('dark');
  /** How far the poster has actually reached — the rail may not jump past it. */
  const [furthest, setFurthest] = useState(0);

  /* A synchronous guard, not the busy flag: state updates are async, so two
     fast clicks can both observe `busy === false` and both submit. */
  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hydratedRef = useRef(false);

  const index = stepIndex(step);
  const current = STEPS[index];

  /* ── Theme ──────────────────────────────────────────────────────────────
     Reuses the app's existing colour-mode mechanism. Nothing local is stored
     and no second theme system is introduced: `applyColorMode` is the same
     function the global nav calls, so a change here changes the whole app. */
  useEffect(() => { setMode(getStoredColorMode()); }, []);
  const changeMode = (next: ColorMode) => { setMode(next); applyColorMode(next); };

  /* ── Step from the URL ──────────────────────────────────────────────────
     The URL is the source of truth, so browser Back/Forward moves the wizard
     rather than leaving the page. */
  useEffect(() => {
    const fromUrl = params?.get('step') ?? '';
    const next: StepId = isStepId(fromUrl) ? fromUrl : 'basics';
    setStep(next);
    setFurthest((f) => Math.max(f, stepIndex(next)));
  }, [params]);

  const goto = useCallback((next: StepId, replace = false) => {
    const query = new URLSearchParams();
    if (editId) query.set('edit', editId);
    query.set('step', next);
    const url = `/jobs/post?${query.toString()}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }, [editId, router]);

  /* ── Local restore ──────────────────────────────────────────────────────
     Runs once, before anything can be typed. On an edit the stored job is the
     authority and is fetched below; the local copy only carries UNSAVED
     changes to that same job, which is why it is namespaced by id. */
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = readLocalDraft(editId);
    if (!saved || !draftHasContent(saved.draft)) return;
    setDraft(saved.draft);
    setRestored(true);
    if (!params?.get('step')) goto(saved.step, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  /* Persist on every change. Cheap, synchronous, and wrapped so a blocked or
     full localStorage degrades to "no restore" rather than a broken page. */
  useEffect(() => {
    if (!hydratedRef.current || posted) return;
    saveLocalDraft(editId, step, draft);
  }, [draft, step, editId, posted]);

  /* ── The poster identity, read not typed ────────────────────────────────*/
  useEffect(() => {
    let active = true;
    fetch('/api/profile/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const name = String(data.user?.name ?? '').trim();
        if (!name) return;
        setPoster({
          name,
          headline: String(data.profile?.headline ?? '').trim() || undefined,
          location: String(data.profile?.location ?? '').trim() || undefined,
          avatarUrl: String(data.profile?.avatarUrl ?? '').trim() || undefined,
        });
      })
      .catch(() => { /* the wizard works without it; the card simply hides */ });
    return () => { active = false; };
  }, []);

  /* ── The edit flow, unchanged ───────────────────────────────────────────*/
  useEffect(() => {
    if (!editId) return;
    let active = true;
    fetch('/api/hiring/jobs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<Record<string, unknown>>) => {
        if (!active) return;
        const found = Array.isArray(list) ? list.find((j) => j?.id === editId) : null;
        if (!found) { setFormError('That job could not be loaded for editing.'); return; }
        /* Only seeds the form when nothing was restored locally — otherwise a
           reload would silently discard edits the poster had not yet saved. */
        setDraft((prev) => (draftHasContent(prev) ? prev : draftFromJob(found)));
      })
      .catch(() => { if (active) setFormError('That job could not be loaded for editing.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editId]);

  /* Focus and scroll move to the new step's heading. Without this a keyboard
     user stays on the old Continue button and a screen reader announces
     nothing at all. */
  useEffect(() => {
    if (posted) return;
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step, posted]);

  const set = useCallback(<K extends keyof JobDraft>(key: K, value: JobDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setFormError('');
  }, []);

  /* ── Submitting ─────────────────────────────────────────────────────────*/

  const submit = async (status?: string): Promise<boolean> => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setFormError('');
    try {
      const response = await fetch('/api/hiring/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildJobPayload(draft, { editId, status })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        /* The message the API returned, never an invented one — and a session
           that lapsed mid-wizard says so rather than reading "Unauthorized". */
        throw new Error(
          response.status === 401
            ? 'Your session expired. Sign in again — your draft is saved on this device.'
            : payload?.error || 'Unable to save this job.',
        );
      }
      return payload;
    } catch (error) {
      setFormError(
        error instanceof Error && error.message
          ? error.message
          : 'Could not reach the server. Check your connection and try again.',
      );
      return false;
    } finally {
      submittingRef.current = false;
    }
  };

  const onContinue = async () => {
    const found = validateStep(step, draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      /* Focus the first field that failed, so the error is not merely visible
         somewhere on the page. */
      const firstKey = Object.keys(found)[0];
      document.getElementById(`job-${firstKey.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)?.focus();
      return;
    }
    setErrors({});

    if (step !== 'publish') { goto(STEPS[index + 1].id); return; }

    setBusy(true);
    const result = await submit();
    setBusy(false);
    if (!result) return;
    const record = result as unknown as Record<string, unknown>;
    clearLocalDraft(editId);
    setPosted({
      id: String(record.id ?? ''),
      title: String(record.title ?? draft.title),
      status: String(record.status ?? draft.status),
    });
  };

  const onSaveDraft = async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    const result = await submit('draft');
    setSavingDraft(false);
    if (result) {
      setDraftSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }
  };

  const summary = useMemo(() => {
    const salary = formatSalary(draft);
    return [
      { label: 'Title', value: draft.title.trim() || '—' },
      { label: 'Location', value: draft.location.trim() || (draft.workMode === 'remote' ? 'Remote' : '—') },
      { label: 'Type', value: EMPLOYMENT_TYPE_LABELS[draft.employmentType] ?? draft.employmentType },
      { label: 'Work mode', value: WORK_MODE_LABELS[draft.workMode] ?? draft.workMode },
      { label: 'Experience', value: EXPERIENCE_LABELS[draft.experienceLevel] ?? draft.experienceLevel },
      /* Shown in the summary only when it was actually chosen — a dash here
         would read as "no urgency", which is not what leaving it blank means. */
      ...(jobUrgencyLabel(draft.hiringUrgency)
        ? [{ label: 'Urgency', value: jobUrgencyLabel(draft.hiringUrgency)! }]
        : []),
      { label: 'Pay', value: salary || 'Not stated' },
    ];
  }, [draft]);

  const stepProps = { draft, errors, set };
  const canDraft = index >= FIRST_SERVER_DRAFT_STEP && canSaveServerDraft(draft);

  /* ── Chrome ─────────────────────────────────────────────────────────────*/

  const shell = (children: React.ReactNode) => (
    <div className="relative min-h-[100dvh] bg-slate-50 text-slate-900 dark:bg-[#0A0A0C] dark:text-white">
      {/* The gradient ground. Fixed and behind everything, two very low-alpha
          orbs — enough to stop the page reading as flat grey, far short of the
          coloured wash that makes a form look like a landing page. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-slate-50 to-slate-100 dark:from-[#0d1018] dark:via-[#0A0A0C] dark:to-[#0A0A0C]" />
        <div className="absolute -left-32 top-[-10%] h-[min(420px,70vw)] w-[min(420px,70vw)] rounded-full bg-sky-400/[0.10] blur-[150px] dark:bg-sky-500/[0.07]" />
        <div className="absolute -right-24 top-[35%] h-[min(380px,65vw)] w-[min(380px,65vw)] rounded-full bg-indigo-400/[0.09] blur-[150px] dark:bg-indigo-500/[0.06]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[rgba(10,10,12,0.8)]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white/70 text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/50 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="truncate text-[15px] font-bold tracking-[-0.01em]">
            {editId ? 'Edit job' : 'Post a job'}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle value={mode} onChange={changeMode} compact />
            <Link href="/jobs" className={`hidden h-9 sm:inline-flex ${BTN_QUIET}`}>
              <Briefcase className="h-3.5 w-3.5" aria-hidden /> Browse jobs
            </Link>
          </div>
        </div>
      </header>

      {children}
    </div>
  );

  /* ── Success ────────────────────────────────────────────────────────────*/

  if (posted) {
    return shell(
      <main className="mx-auto w-full max-w-lg px-4 py-16">
        <div className={`${GLASS} px-6 py-10 text-center`} role="status" aria-live="polite">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.10]">
            <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
          </div>
          <h1 className="mt-5 text-[21px] font-bold tracking-[-0.01em]">
            {posted.status === 'published' ? 'Job published' : 'Job saved'}
          </h1>
          <p className={`mx-auto mt-2.5 max-w-sm text-[14px] leading-relaxed ${MUTED}`}>
            {posted.status === 'published'
              ? `“${posted.title}” is live and now appears in the Jobs feed.`
              : `“${posted.title}” was saved as ${posted.status}, so it stays out of the Jobs feed until you publish it.`}
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
            {posted.id && (
              <Link
                href={`/jobs/${posted.id}`}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-6 text-[14px] font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-white dark:text-[#0b1220] dark:hover:bg-white/90"
              >
                View job <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            <Link href="/jobs/my" className={`h-11 px-6 ${BTN_QUIET}`}>Manage jobs</Link>
          </div>
        </div>
      </main>,
    );
  }

  if (loading) {
    return shell(
      <main className="flex min-h-[60dvh] items-center justify-center" aria-busy>
        <p className={`flex items-center gap-2 text-[14px] ${MUTED}`}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading this job…
        </p>
      </main>,
    );
  }

  const help = {
    basics: <BasicsHelp />, requirements: <RequirementsHelp />,
    compensation: <CompensationHelp />, screening: <ScreeningHelp />,
  }[step as string] ?? null;

  return shell(
    <main className="mx-auto w-full max-w-[1400px] px-3 pb-28 pt-5 sm:px-5 lg:px-8 lg:pb-10">
      {/* `pb-28` above reserves the height of the fixed action bar below `lg`,
          so the last field can always be scrolled clear of it. */}
      <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[230px_minmax(0,1fr)_280px] xl:gap-10">
        {/* ── Rail ───────────────────────────────────────────────────────*/}
        <div className="lg:sticky lg:top-[76px] lg:self-start">
          <WizardProgress current={step} furthest={furthest} onJump={(id) => goto(id)} />
        </div>

        {/* ── The step ───────────────────────────────────────────────────*/}
        <div className="mt-5 min-w-0 lg:mt-0">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-[22px] font-bold tracking-[-0.02em] outline-none sm:text-[26px]"
                >
                  {current.title}
                </h1>
                <p className={`mt-1.5 text-[13.5px] leading-relaxed ${MUTED}`}>{current.caption}</p>
              </div>
              <StepArt step={step} className="hidden sm:block" />
            </div>

            {restored && index === 0 && (
              <p
                className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-3.5 py-2.5 text-[13px] text-sky-800 dark:text-sky-200/90"
                role="status"
              >
                We restored what you had already filled in on this device.
              </p>
            )}

            {formError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3.5 py-2.5 text-[13px] font-medium text-rose-700 dark:text-rose-200"
              >
                {formError}
              </p>
            )}

            {/* `key` on the step remounts it, which restarts the transition and
                guarantees no field keeps a value from the previous step. The
                animation is defined in globals-free inline CSS below and is
                disabled under prefers-reduced-motion. */}
            <div key={step} className="hh-step mt-6">
              {step === 'basics' && <JobBasicsStep {...stepProps} />}
              {step === 'details' && <JobDetailsStep {...stepProps} />}
              {step === 'requirements' && <JobRequirementsStep {...stepProps} />}
              {step === 'compensation' && <JobCompensationStep {...stepProps} />}
              {step === 'screening' && <JobScreeningStep {...stepProps} />}
              {step === 'preview' && <JobPreviewStep draft={draft} poster={poster} />}
              {step === 'publish' && <JobPublishStep draft={draft} editId={editId} summary={summary} />}
            </div>

            {/* The tip sits under the form below xl, where the third column is
                gone — it is never dropped silently, only relocated. */}
            {help && <div className="mt-6 xl:hidden [&>aside]:block">{help}</div>}
          </div>

          <WizardFooter
            onBack={() => goto(STEPS[index - 1].id)}
            onContinue={onContinue}
            showBack={index > 0}
            busy={busy}
            continueLabel={step === 'publish' ? (editId ? 'Update job' : 'Publish job') : 'Continue'}
            secondary={canDraft ? (
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={savingDraft}
                className={`hidden h-11 px-4 sm:inline-flex ${BTN_QUIET}`}
              >
                {savingDraft
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…</>
                  : <><CloudUpload className="h-4 w-4" aria-hidden /> Save draft</>}
              </button>
            ) : null}
          />

          {draftSavedAt && (
            <p className={`mx-auto mt-2 max-w-2xl text-right text-[12px] ${FAINT}`} role="status">
              Draft saved to your account at {draftSavedAt}.
            </p>
          )}
        </div>

        {/* ── Tips, widest layouts only ──────────────────────────────────*/}
        <div className="hidden xl:block xl:sticky xl:top-[76px] xl:self-start">{help}</div>
      </div>

      <style>{`
        .hh-step { animation: hh-step-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes hh-step-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hh-step { animation: none; }
        }
      `}</style>
    </main>,
  );
}
