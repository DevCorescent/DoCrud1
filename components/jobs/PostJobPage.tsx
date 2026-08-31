'use client';

/**
 * Post a Job — the marketplace-side composer for the same hiring role the
 * workspace Hiring Desk creates. Drawn in the SAME shell as /jobs and
 * app/people/page.tsx (56px fixed header with a back button, rigid 100dvh
 * frame, one scrolling content column) so `/jobs → + Post a Job` never leaves
 * the DoCrud marketplace.
 *
 * UI only. The form state, the payload shape and the submission are the ones
 * HiringDeskCenter already used: the same POST /api/hiring/jobs, the same
 * newline-split responsibilities / requirements / preferredSkills, the same
 * targetRoleKeywords derived from the title, the same numeric minimumAtsScore.
 * Nothing is added to the request that the server does not already read, and
 * every error shown is the message the API itself returned.
 *
 * THEMING: this page now renders in BOTH themes. It previously hardcoded the
 * marketplace's dark tokens, which meant a member on the light theme filled in
 * a black form. /jobs and /people remain dark-only — converting them is not
 * this task — so this page deliberately differs from its siblings in light
 * mode. components/ui/input is still not used: its theme tokens do not match
 * the marketplace's input geometry.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Briefcase, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS } from '@/lib/jobs-ui';
import JobPostPreview, { type JobPreviewPoster } from './JobPostPreview';

/* Same starting values HiringDeskCenter used. employmentType / workMode /
   experienceLevel default to exactly what upsertHiringJob already falls back
   to, so an untouched form posts the identical record it did before. */
const emptyJob = {
  title: '',
  department: '',
  location: '',
  employmentType: 'full_time',
  workMode: 'hybrid',
  experienceLevel: 'associate',
  description: '',
  responsibilities: '',
  requirements: '',
  preferredSkills: '',
  minimumAtsScore: '72',
  requiredDocuments: '',
  status: 'published',
};

type JobForm = typeof emptyJob;
type FieldErrors = Partial<Record<'title' | 'description', string>>;

/* One definition per control, each carrying a light value and a dark one.
   `focus-visible:ring` rather than a bare colour change: a focus state that is
   only a border tint is easy to miss and fails a keyboard-only pass. */
const CONTROL_BASE =
  'w-full rounded-[10px] border text-[13px] outline-none transition-colors '
  + 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 '
  + 'focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:border-sky-500 '
  + 'dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/20 '
  + 'dark:focus-visible:border-white/20 dark:focus-visible:bg-white/[0.06]';
const INPUT_CLASS = `h-10 px-3 ${CONTROL_BASE}`;
const TEXTAREA_CLASS = `px-3 py-2.5 leading-6 ${CONTROL_BASE}`;
const SELECT_CLASS = `${INPUT_CLASS} cursor-pointer appearance-none pr-8`;
const ERROR_INPUT_CLASS = 'border-rose-500 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/[0.04]';
const PANEL = 'rounded-2xl border border-slate-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.02]';
const MUTED = 'text-slate-600 dark:text-white/40';
/* `bg-[#ffffff]` rather than `bg-white`: app/globals.css has
   `:root[data-ui-mode='dark'] body a[class~='bg-white'] { color: rgb(2 6 23) !important }`,
   a rule meant to keep dark text legible on solid-white CTAs. It matches the
   EXACT token, so a ghost link that is white in light mode and translucent in
   dark mode was forced to near-black text on a near-black bar — measured at
   1.02:1, i.e. invisible. The arbitrary value is the same colour and matches
   neither that rule nor the `[class*='bg-white']` background rule's intent. */
const BTN_GHOST =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-slate-300 bg-[#ffffff] px-3.5 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white';

function Field({
  id, label, hint, error, required, children,
}: {
  id: string; label: string; hint?: string; error?: string; required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[11.5px] font-semibold text-slate-700 dark:text-white/55">
        {label}
        {/* The word, not just an asterisk: a lone * is a convention a first-time
            poster has to infer, and a screen reader announces it as "star". */}
        {required && (
          <span className="ml-1.5 font-medium text-rose-600 dark:text-rose-300/80">
            <span aria-hidden>*</span><span className="sr-only"> required</span>
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[11.5px] font-medium text-rose-600 dark:text-rose-300/85">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[11px] text-slate-500 dark:text-white/25">{hint}</p>
      ) : null}
    </div>
  );
}

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  /* Section rhythm: ~20px between major sections, ~14px between related
     controls. Tightened from py-6/gap-4 — that spacing was the single largest
     contributor to the page's height, ahead of the fields themselves. */
  return (
    <section className="border-t border-slate-200 px-4 py-4 first:border-t-0 sm:px-5 sm:py-5 dark:border-white/[0.06]">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-white/35">{title}</p>
      {caption && <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/28">{caption}</p>}
      <div className="mt-3 flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

export default function PostJobPage() {
  const router = useRouter();
  /* ?edit=<jobId> reuses this same composer to update an existing posting — the
     same form, the same POST /api/hiring/jobs, just carrying an id. The server
     refuses the write unless the session user owns that job, so arriving here
     with someone else's id yields a 403 rather than an edit. */
  const editId = useSearchParams()?.get('edit') ?? '';
  const [loadingJob, setLoadingJob] = useState(Boolean(editId));
  const [jobForm, setJobForm] = useState<JobForm>(emptyJob);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [savingJob, setSavingJob] = useState(false);
  const [posted, setPosted] = useState<{ id: string; title: string; status: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  /* Who this job will be posted as. Read once from the profile endpoint the
     app already uses — the poster is never typed, so it cannot be misstated. */
  const [poster, setPoster] = useState<JobPreviewPoster | null>(null);

  /* Escape closes the preview dialog, wherever focus happens to be. */
  useEffect(() => {
    if (!showPreview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPreview(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showPreview]);

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
      .catch(() => { /* the composer works without it; the card simply hides */ });
    return () => { active = false; };
  }, []);

  /* Loads the posting being edited from the endpoint that already scopes jobs
     to the viewer, so a job the user cannot manage never reaches the form. */
  useEffect(() => {
    if (!editId) return;
    let active = true;
    fetch('/api/hiring/jobs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<Record<string, unknown>>) => {
        if (!active) return;
        const found = Array.isArray(list) ? list.find((j) => j?.id === editId) : null;
        if (!found) { setFormError('That job could not be loaded for editing.'); return; }
        const lines = (v: unknown) => (Array.isArray(v) ? v.join('\n') : '');
        setJobForm({
          title: String(found.title ?? ''),
          department: String(found.department ?? ''),
          location: String(found.location ?? ''),
          employmentType: String(found.employmentType ?? 'full_time'),
          workMode: String(found.workMode ?? 'hybrid'),
          experienceLevel: String(found.experienceLevel ?? 'associate'),
          description: String(found.description ?? ''),
          responsibilities: lines(found.responsibilities),
          requirements: lines(found.requirements),
          preferredSkills: lines(found.preferredSkills),
          minimumAtsScore: String(found.minimumAtsScore ?? '72'),
          requiredDocuments: lines(found.requiredDocuments),
          status: String(found.status ?? 'published'),
        });
      })
      .catch(() => { if (active) setFormError('That job could not be loaded for editing.'); })
      .finally(() => { if (active) setLoadingJob(false); });
    return () => { active = false; };
  }, [editId]);

  const set = <K extends keyof JobForm>(key: K, value: JobForm[K]) => {
    setJobForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'title' || key === 'description') {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  /* Mirrors the server's own rule — POST /api/hiring/jobs rejects a missing
     title or description with 400 — so the check is caught inline instead of
     as a round-trip, and nothing else is gated that the API would accept. */
  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!jobForm.title.trim()) next.title = 'Job title is required.';
    if (!jobForm.description.trim()) next.description = 'Description is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveJob = async () => {
    if (savingJob) return;
    setFormError('');
    if (!validate()) return;
    try {
      setSavingJob(true);
      const response = await fetch('/api/hiring/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          /* On an edit the id travels with the payload; ownership is still
             decided server-side from the session, never from this request. */
          ...(editId ? { id: editId } : {}),
          ...jobForm,
          minimumAtsScore: Number(jobForm.minimumAtsScore || 0),
          responsibilities: jobForm.responsibilities.split('\n').map((item) => item.trim()).filter(Boolean),
          requirements: jobForm.requirements.split('\n').map((item) => item.trim()).filter(Boolean),
          preferredSkills: jobForm.preferredSkills.split('\n').map((item) => item.trim()).filter(Boolean),
          requiredDocuments: jobForm.requiredDocuments.split('\n').map((item) => item.trim()).filter(Boolean),
          targetRoleKeywords: jobForm.title.split(/\s+/).filter(Boolean),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save job.');
      }
      setPosted({ id: payload?.id ?? '', title: payload?.title ?? jobForm.title, status: payload?.status ?? jobForm.status });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save job.');
    } finally {
      setSavingJob(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0A0A0C] dark:text-white">
      <style>{`
        .no-sb::-webkit-scrollbar { display:none; }
        .no-sb { scrollbar-width:none; }
      `}</style>

      {/* ══ Header — the /jobs · /people marketplace chrome ═══════════════ */}
      <header
        className="shrink-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[rgba(10,10,12,0.96)]"
        style={{ height: 56 }}
      >
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-slate-300 bg-white text-slate-600 transition-all hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/48 dark:hover:bg-white/[0.08] dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[15px] font-bold tracking-[-0.01em]">{editId ? 'Edit job' : 'Post a Job'}</span>
            <span className={`hidden text-[12px] font-medium sm:inline ${MUTED}`}>Jobs</span>
          </div>
          <Link href="/jobs"
            className={`ml-auto hidden h-9 shrink-0 sm:inline-flex ${BTN_GHOST}`}>
            <Briefcase className="h-3.5 w-3.5" /> Browse jobs
          </Link>
        </div>
      </header>

      {/* ══ Content — the only scroll region ═════════════════════════════ */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {/* ambient glow, same restraint as the rest of the marketplace */}
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
          <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/[0.05] blur-[160px]" />
        </div>

        <div className="mx-auto w-full max-w-4xl px-3 pb-10 pt-5 sm:px-5 sm:pt-6 lg:px-8">

          {posted ? (
            /* ── Success ─────────────────────────────────────────────── */
            <div className={`${PANEL} px-5 py-10 text-center sm:px-8`} role="status" aria-live="polite">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.10]">
                <Check className="h-6 w-6 text-emerald-400" />
              </div>
              <h1 className="mt-5 text-[20px] font-bold tracking-[-0.01em]">
                {posted.status === 'published' ? 'Job posted' : 'Job saved'}
              </h1>
              <p className={`mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed ${MUTED}`}>
                {posted.status === 'published'
                  ? `“${posted.title}” is live and now appears in the Jobs feed.`
                  : `“${posted.title}” was saved as ${posted.status}. Publish it from the Hiring Desk to list it in the Jobs feed.`}
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                {posted.id && (
                  <Link href={`/jobs/${posted.id}`}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[13px] bg-slate-900 px-6 text-[13.5px] font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-white dark:text-[#020617] dark:hover:bg-white/90 sm:w-auto">
                    View job <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button type="button"
                  onClick={() => { setPosted(null); setJobForm(emptyJob); setErrors({}); setFormError(''); }}
                  className={`h-10 w-full px-6 sm:w-auto ${BTN_GHOST}`}>
                  Post another
                </button>
                <Link href="/jobs"
                  className={`h-10 w-full px-6 sm:w-auto ${BTN_GHOST}`}>
                  Back to Jobs
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* ── Title ──────────────────────────────────────────────── */}
              {/* One compact line, not a hero: the title and its one-line
                  explanation, with Preview beside them. */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-[19px] font-bold tracking-[-0.02em] sm:text-[22px]">
                    {editId ? 'Edit job' : 'Post a job'}
                  </h1>
                  <p className={`mt-0.5 text-[12.5px] ${MUTED}`}>
                    Published roles appear in the Jobs feed.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    aria-haspopup="dialog"
                    className={`h-9 ${BTN_GHOST}`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Preview
                  </button>
                  <Link href="/jobs/my" className={`h-9 ${BTN_GHOST}`}>My Jobs</Link>
                </div>
              </div>

              {/* Who the job is posted as. Shown so nobody discovers after
                  publishing that their own name is on the listing, and stated
                  as an individual rather than dressed up as a company. */}
              {poster && (
                <div className={`${PANEL} mb-3 flex items-center gap-2.5 px-3.5 py-2`}>
                  {poster.avatarUrl
                    ? <img src={poster.avatarUrl} alt="" aria-hidden className="h-7 w-7 shrink-0 rounded-full object-cover" />
                    : (
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white/50">
                        {poster.name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                    )}
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold">
                      Posting as {poster.name}
                      <span className={`ml-1.5 font-normal ${MUTED}`}>· Individual</span>
                    </p>
                    {(poster.headline || poster.location) && (
                      <p className={`truncate text-[11.5px] ${MUTED}`}>
                        {[poster.headline, poster.location].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {formError && (
                <div role="alert"
                  className="mb-3 rounded-[14px] border border-rose-500/40 bg-rose-50 px-4 py-3 text-[12.5px] font-medium text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/[0.07] dark:text-rose-200/90">
                  {formError}
                </div>
              )}

              {/* ── Form card ──────────────────────────────────────────── */}
              <form
                onSubmit={(e) => { e.preventDefault(); void saveJob(); }}
                noValidate
                className={`overflow-hidden ${PANEL}`}
              >
                <Section title="Job details" caption="Basic information about the role.">
                  <Field id="job-title" label="Job title" required error={errors.title}>
                    <input
                      id="job-title" value={jobForm.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder="Senior Frontend Engineer"
                      aria-invalid={!!errors.title}
                      aria-describedby={errors.title ? 'job-title-error' : undefined}
                      className={`${INPUT_CLASS} ${errors.title ? ERROR_INPUT_CLASS : ''}`}
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="job-department" label="Department">
                      <input id="job-department" value={jobForm.department}
                        onChange={(e) => set('department', e.target.value)}
                        placeholder="Engineering" className={INPUT_CLASS} />
                    </Field>
                    <Field id="job-location" label="Location">
                      <input id="job-location" value={jobForm.location}
                        onChange={(e) => set('location', e.target.value)}
                        placeholder="Bengaluru, India" className={INPUT_CLASS} />
                    </Field>
                  </div>

                  {/* Three short selects share one row from lg; two from sm. */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field id="job-employment" label="Employment type">
                      <select id="job-employment" value={jobForm.employmentType}
                        onChange={(e) => set('employmentType', e.target.value)} className={SELECT_CLASS}>
                        {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, label]) => (
                          <option key={v} value={v} style={{ background: '#111116' }}>{label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field id="job-workmode" label="Work mode">
                      <select id="job-workmode" value={jobForm.workMode}
                        onChange={(e) => set('workMode', e.target.value)} className={SELECT_CLASS}>
                        {Object.entries(WORK_MODE_LABELS).map(([v, label]) => (
                          <option key={v} value={v} style={{ background: '#111116' }}>{label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field id="job-experience" label="Experience level">
                      <select id="job-experience" value={jobForm.experienceLevel}
                        onChange={(e) => set('experienceLevel', e.target.value)} className={SELECT_CLASS}>
                        {Object.entries(EXPERIENCE_LABELS).map(([v, label]) => (
                          <option key={v} value={v} style={{ background: '#111116' }}>{label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title="Role description" caption="What the role is and what it involves.">
                  <Field id="job-description" label="Description" required error={errors.description}>
                    <textarea
                      id="job-description" value={jobForm.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="Role overview"
                      rows={5} style={{ minHeight: 150 }}
                      aria-invalid={!!errors.description}
                      aria-describedby={errors.description ? 'job-description-error' : undefined}
                      className={`${TEXTAREA_CLASS}${errors.description ? ERROR_INPUT_CLASS : ''}`}
                    />
                  </Field>

                  {/* Paired from lg. These four are the tallest controls on the
                      page, so pairing them removes roughly two textareas' worth
                      of height without shortening any single one. */}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <Field id="job-responsibilities" label="Responsibilities" hint="One per line.">
                      <textarea id="job-responsibilities" value={jobForm.responsibilities}
                        onChange={(e) => set('responsibilities', e.target.value)}
                        rows={4} style={{ minHeight: 120 }}
                        placeholder={'Ship and own frontend features\nPartner with design on the marketplace surface'}
                        className={TEXTAREA_CLASS} />
                    </Field>

                    <Field id="job-requirements" label="Requirements" hint="One per line.">
                      <textarea id="job-requirements" value={jobForm.requirements}
                        onChange={(e) => set('requirements', e.target.value)}
                        rows={4} style={{ minHeight: 120 }}
                        placeholder={'4+ years building production React\nStrong TypeScript fundamentals'}
                        className={TEXTAREA_CLASS} />
                    </Field>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <Field id="job-skills" label="Preferred skills" hint="One per line — these show as tags on the job card.">
                      <textarea id="job-skills" value={jobForm.preferredSkills}
                        onChange={(e) => set('preferredSkills', e.target.value)}
                        rows={3} style={{ minHeight: 105 }}
                        placeholder={'React\nTypeScript\nNext.js'}
                        className={TEXTAREA_CLASS} />
                    </Field>

                    {/* Moved up beside Preferred skills. The old "Application"
                        section held this one field; its caption is preserved
                        verbatim in the hint, so no guidance is lost. */}
                    <Field
                      id="job-documents"
                      label="Requested documents"
                      hint="One per line — applicants cannot submit until each is attached. Leave empty to ask for a resume only."
                    >
                      <textarea id="job-documents" value={jobForm.requiredDocuments}
                        onChange={(e) => set('requiredDocuments', e.target.value)}
                        rows={3} style={{ minHeight: 105 }}
                        placeholder={'Portfolio\nCover letter'}
                        className={TEXTAREA_CLASS} />
                    </Field>
                  </div>
                </Section>

                <Section title="Screening" caption="Applicants below the ATS cutoff cannot submit.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="job-ats" label="Minimum ATS score" hint="0–100.">
                      <input id="job-ats" type="number" min="0" max="100" inputMode="numeric"
                        value={jobForm.minimumAtsScore}
                        onChange={(e) => set('minimumAtsScore', e.target.value)}
                        placeholder="72" className={INPUT_CLASS} />
                    </Field>
                    <Field id="job-status" label="Status" hint="Published roles appear in the Jobs feed.">
                      <select id="job-status" value={jobForm.status}
                        onChange={(e) => set('status', e.target.value)} className={SELECT_CLASS}>
                        <option value="draft" style={{ background: '#111116' }}>Draft</option>
                        <option value="published" style={{ background: '#111116' }}>Published</option>
                        <option value="closed" style={{ background: '#111116' }}>Closed</option>
                      </select>
                    </Field>
                  </div>
                </Section>

                {/* ── Action bar ───────────────────────────────────────────
                    Sticky to the bottom of the scrolling form, so Post Job is
                    reachable without scrolling to the end. It sits INSIDE the
                    form card and the page carries matching bottom padding, so
                    it can never sit over an input. */}
                <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2.5 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-end sm:px-5 dark:border-white/[0.06] dark:bg-[#0d0d10]/95">
                  {/* The outcome is announced, not only shown: a saving state
                      that is purely visual is silent to a screen reader. */}
                  <p aria-live="polite" className="sr-only">
                    {savingJob ? 'Saving your job posting.' : ''}
                  </p>
                  <Link href="/jobs" className={`h-10 w-full px-6 sm:w-auto ${BTN_GHOST}`}>
                    Cancel
                  </Link>
                  <button type="submit" disabled={savingJob}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[13px] bg-slate-900 px-6 text-[13.5px] font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:bg-white dark:text-[#020617] dark:hover:bg-white/90">
                    {savingJob ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    {savingJob ? 'Saving…' : editId ? 'Save changes' : 'Post Job'}
                    {!savingJob && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                </div>
              </form>

              <p className={`mt-3 text-center text-[11.5px] ${MUTED}`}>
                Manage posted roles, ATS cutoffs and applicants in the{' '}
                <Link href="/workspace?tab=hiring-desk" className="font-semibold text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300">
                  Hiring Desk
                </Link>.
              </p>

              {/* Preview as a dialog, not a second copy of the page below the
                  form. It reads the live form state and makes no request. */}
              {showPreview && (
                <div
                  className="fixed inset-0 z-[10000] flex items-start justify-center overflow-hidden p-2 sm:items-center sm:p-6"
                  onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}
                >
                  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-black/70" aria-hidden />
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="job-preview-title"
                    className="relative flex max-h-[calc(100vh-16px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl sm:max-h-[88vh] sm:max-w-[720px] dark:border-white/[0.10] dark:bg-[#08080b]"
                  >
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                      <h2 id="job-preview-title" className="text-[15px] font-bold tracking-[-0.01em]">
                        Preview
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowPreview(false)}
                        aria-label="Close preview"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:text-white/60 dark:hover:bg-white/[0.06]"
                      >
                        <EyeOff className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {/* The dialog body is the only scrolling region. */}
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                      <JobPostPreview data={jobForm} poster={poster} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
