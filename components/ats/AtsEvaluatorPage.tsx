'use client';

/**
 * ATS Resume Evaluator — the client for POST /api/ats/evaluate.
 *
 * A NEW page at /ats/evaluate. The existing /resume-ats and its LLM-scored
 * engine are untouched and still work exactly as before; nothing here imports
 * them and they do not import this.
 *
 * THE API IS THE ONLY SOURCE OF TRUTH FOR THE SCORE. No number on this page is
 * computed in the browser — every figure is read from the response, and the
 * only arithmetic is Math.round for display. Presentation logic that has a
 * right answer (colour thresholds, error messages, filters, the request body)
 * lives in ./ats-view-model.ts so it can be tested.
 *
 * All resume and job-description text returned by the API is rendered as
 * ordinary React text. There is no dangerouslySetInnerHTML anywhere in this
 * file: evidence quotes come from an uploaded document and are untrusted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, History, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import {
  buildRequestBody, canAnalyze, errorMessageForStatus, NETWORK_ERROR_MESSAGE,
  uploadErrorMessageForStatus,
  type AtsApiResponse,
} from './ats-view-model';
import { AtsResults } from './AtsResults';
import { RESUME_ACCEPT_ATTRIBUTE } from '@/lib/ats-upload-limits';

/** One card surface, defined once, theme-aware. Not five variants of a box. */
const PANEL = 'rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]';
const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/40';
const MUTED = 'text-slate-600 dark:text-white/45';

const MAX_JD_CHARS = 30_000;

interface StoredResume { id: string; fileName: string; uploadedAt?: string }

export default function AtsEvaluatorPage() {
  const [resumes, setResumes] = useState<StoredResume[]>([]);
  const [resumesLoaded, setResumesLoaded] = useState(false);
  const [resumeId, setResumeId] = useState('');
  const [resumeText, setResumeText] = useState('');
  /* An uploaded resume lives here for the session only. It is never written to
     the profile — see app/api/ats/upload/route.ts. */
  const [uploaded, setUploaded] = useState<{ fileName: string; parsedResume: unknown; resumeText: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');

  const [result, setResult] = useState<AtsApiResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  /* One in-flight request at a time. A second submit aborts the first rather
     than racing it, so a slow response can never overwrite a newer one. */
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  /* Resumes already on the profile, via the endpoint the job-application flow
     already uses — no new endpoint, and nothing re-uploaded or re-parsed. */
  useEffect(() => {
    let active = true;
    fetch('/api/profile/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        const files: StoredResume[] = (data?.profile?.resumeFiles ?? [])
          .filter((f: StoredResume) => f?.id && f?.fileName);
        setResumes(files);
        if (files[0]) setResumeId(files[0].id);
      })
      .catch(() => { /* pasting a resume still works */ })
      .finally(() => { if (active) setResumesLoaded(true); });
    return () => { active = false; };
  }, []);

  const draft = useMemo(
    () => ({
      resumeId: resumeId || undefined,
      /* An uploaded resume's text stands in for pasted text, so the enable rule
         and the request body stay one rule rather than two. */
      resumeText: uploaded?.resumeText ?? resumeText,
      jobDescription,
      jobTitle,
    }),
    [resumeId, resumeText, uploaded, jobDescription, jobTitle],
  );
  const ready = canAnalyze(draft, running);

  /* Only ever called from the button. Nothing here runs on a keystroke. */
  const analyze = useCallback(async () => {
    const base = buildRequestBody(draft);
    if (!base || running) return;
    /* An uploaded file was parsed once by /api/ats/upload; posting its parsed
       form back means the same document is never parsed twice. */
    const body = uploaded && !resumeId
      ? { parsedResume: uploaded.parsedResume, resumeText: uploaded.resumeText,
          jobDescription: draft.jobDescription.trim(), jobTitle: draft.jobTitle?.trim() || undefined,
          resumeName: uploaded.fileName }
      : resumeId
        ? { ...base, resumeName: resumes.find((r) => r.id === resumeId)?.fileName }
        : base;

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setRunning(true);
    setError('');
    try {
      const response = await fetch('/api/ats/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        /* The server's own message is deliberately not shown. */
        setError(errorMessageForStatus(response.status));
        return;
      }
      setResult((await response.json()) as AtsApiResponse);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setRunning(false);
      }
    }
  }, [draft, running, uploaded, resumeId, resumes]);

  /* Upload → parse → hold in memory. Nothing is saved to the profile. */
  const upload = useCallback(async (file: File) => {
    setUploadError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('resume', file);
      const response = await fetch('/api/ats/upload', { method: 'POST', body: form });
      if (!response.ok) {
        setUploadError(uploadErrorMessageForStatus(response.status));
        return;
      }
      const data = await response.json();
      setUploaded({ fileName: data.fileName, parsedResume: data.parsedResume, resumeText: data.resumeText });
      setResumeId('');
      setResumeText('');
    } catch {
      setUploadError(NETWORK_ERROR_MESSAGE);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }, []);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setRunning(false);
    setResult(null);
    setError('');
    setUploadError('');
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#08080b] dark:text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">

        {/* ── Header ── */}
        <header className="mb-8">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] sm:text-[32px]">ATS Resume Evaluator</h1>
          <p className={`mt-2 max-w-2xl text-[14px] leading-relaxed ${MUTED}`}>
            See how well your resume matches a specific job before you apply.
          </p>
          <p className={`mt-1 text-[12px] ${MUTED}`}>
            The score measures compatibility with the job description you provide. It is not a prediction of being hired.
          </p>
          <Link
            href="/ats/history"
            className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
          >
            <History className="h-3.5 w-3.5" aria-hidden /> View past evaluations
          </Link>
        </header>

        {/* ── Inputs ── */}
        <section className="grid gap-4 lg:grid-cols-2">

          {/* Resume */}
          <div className={`${PANEL} p-5`}>
            <h2 className={LABEL}>Resume</h2>

            {/* An uploaded file wins while it is held. It is parsed once, kept
                in memory for this session, and never written to the profile. */}
            {uploaded ? (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3.5">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <FileText className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{uploaded.fileName}</span>
                </p>
                <p className="mt-1.5 text-[12px] text-emerald-800 dark:text-emerald-300">
                  Parsed and ready — {uploaded.resumeText.length.toLocaleString('en-US')} characters read.
                </p>
                <p className={`mt-1 text-[11.5px] ${MUTED}`}>
                  This file is used for this evaluation only. Your profile, skills and resume history are not changed.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="text-[12px] font-semibold text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
                  >
                    Replace file
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUploaded(null); if (resumes[0]) setResumeId(resumes[0].id); }}
                    className="text-[12px] font-semibold text-slate-600 hover:underline dark:text-white/50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : resumes.length > 0 ? (
              <div className="mt-3">
                <label htmlFor="ats-resume" className="mb-1.5 block text-[13px] font-semibold">
                  Select a saved resume
                </label>
                <select
                  id="ats-resume"
                  value={resumeId}
                  onChange={(e) => setResumeId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white"
                >
                  {resumes.map((file) => (
                    <option key={file.id} value={file.id}>{file.fileName}</option>
                  ))}
                  <option value="">Upload or paste a different resume…</option>
                </select>

                {resumeId && (
                  <p className="mt-2.5 flex items-center gap-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Parsed and ready — already on your profile, so nothing is uploaded or parsed again.
                  </p>
                )}
              </div>
            ) : (
              <p className={`mt-3 text-[13px] ${MUTED}`}>
                {resumesLoaded
                  ? 'No saved resume found on your profile. Upload one below, or paste your resume text.'
                  : 'Checking your profile for a saved resume…'}
              </p>
            )}

            {/* Upload + paste, shown whenever no saved resume is selected. */}
            {!uploaded && !resumeId && (
              <div className="mt-4">
                <input
                  ref={fileInput}
                  id="ats-file"
                  type="file"
                  accept={RESUME_ACCEPT_ATTRIBUTE}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[13px] font-semibold transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:border-white/[0.14] dark:hover:bg-white/[0.05]"
                >
                  {uploading
                    ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading resume…</>
                    : <><Upload className="h-4 w-4" aria-hidden /> Upload a resume</>}
                </button>
                <p className={`mt-1.5 text-[11.5px] ${MUTED}`}>
                  PDF, DOCX, DOC, RTF, MD or TXT, up to 10&nbsp;MB. Used for this evaluation only — your profile is not changed.
                </p>

                <div aria-live="polite">
                  {uploadError && (
                    <p role="alert" className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
                      {uploadError}
                    </p>
                  )}
                </div>

                <label htmlFor="ats-resume-text" className="mb-1.5 mt-4 block text-[13px] font-semibold">
                  Or paste your resume text
                </label>
                <textarea
                  id="ats-resume-text"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  rows={7}
                  placeholder="Paste the full text of your resume…"
                  className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
                />
              </div>
            )}
          </div>

          {/* Job description */}
          <div className={`${PANEL} p-5`}>
            <h2 className={LABEL}>Job description</h2>

            <div className="mt-3">
              <label htmlFor="ats-title" className="mb-1.5 block text-[13px] font-semibold">
                Job title <span className={`font-normal ${MUTED}`}>(optional)</span>
              </label>
              <input
                id="ats-title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Senior Backend Engineer"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
              />
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label htmlFor="ats-jd" className="text-[13px] font-semibold">Paste the job description</label>
                <span className={`text-[11px] tabular-nums ${jobDescription.length > MAX_JD_CHARS ? 'text-rose-600 dark:text-rose-300' : MUTED}`}>
                  {jobDescription.length.toLocaleString('en-US')} / {MAX_JD_CHARS.toLocaleString('en-US')}
                </span>
              </div>
              <textarea
                id="ats-jd"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={10}
                placeholder="Paste the full posting, including its requirements section…"
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
              />
              {jobDescription && (
                <button
                  type="button"
                  onClick={() => setJobDescription('')}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 hover:underline dark:text-white/50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden /> Clear job description
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Action ── */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={analyze}
            disabled={!ready}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-[#020617] dark:hover:bg-white/90 dark:focus-visible:ring-offset-[#08080b]"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {running ? 'Analyzing resume…' : result ? 'Re-analyze' : 'Analyze Resume'}
          </button>

          {result && !running && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-[13px] font-semibold transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
            </button>
          )}

          {!ready && !running && (
            <span className={`text-[12px] ${MUTED}`}>
              {!resumeId && !resumeText.trim()
                ? 'Select a resume before analyzing.'
                : 'Add the job description to analyze your match.'}
            </span>
          )}
        </div>

        {/* Status region. aria-live so a screen reader hears the outcome. */}
        <div aria-live="polite" className="mt-4">
          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {running && (
            <p className={`text-[13px] ${MUTED}`}>Analyzing resume against this job description…</p>
          )}
        </div>

        {/* ── Results ── */}
        {running && !result && <LoadingSkeleton />}

        {!result && !running && !error && (
          <section className={`${PANEL} mt-6 px-6 py-14 text-center`}>
            <h2 className="text-[17px] font-bold">Match your resume to a job</h2>
            <p className={`mx-auto mt-2 max-w-md text-[13px] leading-relaxed ${MUTED}`}>
              Add a resume and job description to see your ATS compatibility.
            </p>
          </section>
        )}

        {result && (
          <div className={running ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'}>
            <AtsResults result={result} />
          </div>
        )}
      </div>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-hidden>
      <div className={`${PANEL} h-40 animate-pulse`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${PANEL} h-56 animate-pulse lg:col-span-2`} />
        <div className={`${PANEL} h-56 animate-pulse`} />
      </div>
    </div>
  );
}
