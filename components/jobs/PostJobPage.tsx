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
 * The dark inputs are the marketplace's own tokens (the ones /people's
 * FilterPanel and the /jobs header use), not components/ui/input — that
 * primitive is theme-token based and renders light, which is why neither
 * /people nor /jobs uses it.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Briefcase, Check, Loader2 } from 'lucide-react';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS } from '@/lib/jobs-ui';

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

const INPUT_CLASS =
  'h-10 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white placeholder:text-white/20 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]';
const TEXTAREA_CLASS =
  'w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] leading-6 text-white placeholder:text-white/20 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]';
const SELECT_CLASS = `${INPUT_CLASS} cursor-pointer appearance-none pr-8`;
const ERROR_INPUT_CLASS = 'border-rose-500/40 bg-rose-500/[0.04]';

function Field({
  id, label, hint, error, children,
}: {
  id: string; label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[11.5px] font-semibold text-white/55">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[11.5px] font-medium text-rose-300/85">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[11px] text-white/25">{hint}</p>
      ) : null}
    </div>
  );
}

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/[0.06] px-4 py-5 first:border-t-0 sm:px-6 sm:py-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{title}</p>
      {caption && <p className="mt-1 text-[12px] text-white/28">{caption}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0A0A0C] text-white">
      <style>{`
        .no-sb::-webkit-scrollbar { display:none; }
        .no-sb { scrollbar-width:none; }
      `}</style>

      {/* ══ Header — the /jobs · /people marketplace chrome ═══════════════ */}
      <header className="shrink-0 z-30 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-white">Post a Job</span>
            <span className="hidden text-[12px] font-medium sm:inline" style={{ color: 'rgba(255,255,255,0.28)' }}>Jobs</span>
          </div>
          <Link href="/jobs"
            className="ml-auto hidden shrink-0 items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12.5px] font-semibold border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white/72 hover:bg-white/[0.08] transition-all sm:flex">
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

        <div className="mx-auto w-full max-w-3xl px-3 pb-16 pt-8 sm:px-5 sm:pt-10 lg:px-8">

          {posted ? (
            /* ── Success ─────────────────────────────────────────────── */
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-10 text-center sm:px-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.10]">
                <Check className="h-6 w-6 text-emerald-400" />
              </div>
              <h1 className="mt-5 text-[20px] font-bold tracking-[-0.01em] text-white">
                {posted.status === 'published' ? 'Job posted' : 'Job saved'}
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/35">
                {posted.status === 'published'
                  ? `“${posted.title}” is live and now appears in the Jobs feed.`
                  : `“${posted.title}” was saved as ${posted.status}. Publish it from the Hiring Desk to list it in the Jobs feed.`}
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                {posted.id && (
                  <Link href={`/jobs/${posted.id}`}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[13px] bg-white px-6 text-[13.5px] font-bold text-[#0A0A0C] transition hover:bg-white/90 sm:w-auto">
                    View job <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button type="button"
                  onClick={() => { setPosted(null); setJobForm(emptyJob); setErrors({}); setFormError(''); }}
                  className="inline-flex h-10 w-full items-center justify-center rounded-[13px] border border-white/[0.10] bg-white/[0.04] px-6 text-[13.5px] font-semibold text-white/52 transition hover:bg-white/[0.08] hover:text-white/72 sm:w-auto">
                  Post another
                </button>
                <Link href="/jobs"
                  className="inline-flex h-10 w-full items-center justify-center rounded-[13px] border border-white/[0.10] bg-white/[0.04] px-6 text-[13.5px] font-semibold text-white/52 transition hover:bg-white/[0.08] hover:text-white/72 sm:w-auto">
                  Back to Jobs
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* ── Title ──────────────────────────────────────────────── */}
              <div className="mb-6 sm:mb-8">
                <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white sm:text-[28px]">Post a job</h1>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/32">
                  Find the right person for your role. Published roles appear in the Jobs feed.
                </p>
              </div>

              {formError && (
                <div role="alert"
                  className="mb-5 rounded-[14px] border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-[12.5px] font-medium text-rose-200/90">
                  {formError}
                </div>
              )}

              {/* ── Form card ──────────────────────────────────────────── */}
              <form
                onSubmit={(e) => { e.preventDefault(); void saveJob(); }}
                noValidate
                className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]"
              >
                <Section title="Job details" caption="Basic information about the role.">
                  <Field id="job-title" label="Job title" error={errors.title}>
                    <input
                      id="job-title" value={jobForm.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder="Senior Frontend Engineer"
                      aria-invalid={!!errors.title}
                      aria-describedby={errors.title ? 'job-title-error' : undefined}
                      className={`${INPUT_CLASS} ${errors.title ? ERROR_INPUT_CLASS : ''}`}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
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

                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>

                  <Field id="job-experience" label="Experience level">
                    <select id="job-experience" value={jobForm.experienceLevel}
                      onChange={(e) => set('experienceLevel', e.target.value)} className={SELECT_CLASS}>
                      {Object.entries(EXPERIENCE_LABELS).map(([v, label]) => (
                        <option key={v} value={v} style={{ background: '#111116' }}>{label}</option>
                      ))}
                    </select>
                  </Field>
                </Section>

                <Section title="Role description" caption="What the role is and what it involves.">
                  <Field id="job-description" label="Description" error={errors.description}>
                    <textarea
                      id="job-description" value={jobForm.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="Role overview"
                      rows={5}
                      aria-invalid={!!errors.description}
                      aria-describedby={errors.description ? 'job-description-error' : undefined}
                      className={`${TEXTAREA_CLASS} min-h-[120px] ${errors.description ? ERROR_INPUT_CLASS : ''}`}
                    />
                  </Field>

                  <Field id="job-responsibilities" label="Responsibilities" hint="One per line.">
                    <textarea id="job-responsibilities" value={jobForm.responsibilities}
                      onChange={(e) => set('responsibilities', e.target.value)}
                      rows={4} placeholder={'Ship and own frontend features\nPartner with design on the marketplace surface'}
                      className={`${TEXTAREA_CLASS} min-h-[96px]`} />
                  </Field>

                  <Field id="job-requirements" label="Requirements" hint="One per line.">
                    <textarea id="job-requirements" value={jobForm.requirements}
                      onChange={(e) => set('requirements', e.target.value)}
                      rows={4} placeholder={'4+ years building production React\nStrong TypeScript fundamentals'}
                      className={`${TEXTAREA_CLASS} min-h-[96px]`} />
                  </Field>

                  <Field id="job-skills" label="Preferred skills" hint="One per line — these show as tags on the job card.">
                    <textarea id="job-skills" value={jobForm.preferredSkills}
                      onChange={(e) => set('preferredSkills', e.target.value)}
                      rows={3} placeholder={'React\nTypeScript\nNext.js'}
                      className={`${TEXTAREA_CLASS} min-h-[80px]`} />
                  </Field>
                </Section>

                <Section title="Application" caption="What applicants must attach. Leave empty to ask for a resume only.">
                  <Field id="job-documents" label="Requested documents" hint="One per line — applicants cannot submit until each is attached.">
                    <textarea id="job-documents" value={jobForm.requiredDocuments}
                      onChange={(e) => set('requiredDocuments', e.target.value)}
                      rows={3} placeholder={'Portfolio\nCover letter'}
                      className={`${TEXTAREA_CLASS} min-h-[80px]`} />
                  </Field>
                </Section>

                <Section title="Screening" caption="Applicants below the ATS cutoff cannot submit.">
                  <div className="grid gap-4 sm:grid-cols-2">
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

                {/* ── Footer ───────────────────────────────────────────── */}
                <div className="flex flex-col-reverse gap-2.5 border-t border-white/[0.06] bg-white/[0.01] px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
                  <Link href="/jobs"
                    className="inline-flex h-10 w-full items-center justify-center rounded-[13px] border border-white/[0.10] bg-white/[0.04] px-6 text-[13.5px] font-semibold text-white/52 transition hover:bg-white/[0.08] hover:text-white/72 sm:w-auto">
                    Cancel
                  </Link>
                  <button type="submit" disabled={savingJob}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[13px] bg-white px-6 text-[13.5px] font-bold text-[#0A0A0C] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                    {savingJob ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {savingJob ? 'Posting…' : 'Post Job'}
                    {!savingJob && <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </form>

              <p className="mt-4 text-center text-[11.5px] text-white/22">
                Manage posted roles, ATS cutoffs and applicants in the{' '}
                <Link href="/workspace?tab=hiring-desk" className="text-white/40 underline-offset-2 hover:text-white/70 hover:underline">
                  Hiring Desk
                </Link>.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
