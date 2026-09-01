'use client';

/**
 * Phase 10 — one applicant, in full.
 *
 * Everything an employer can do to an application lives here: read the
 * profile, open the résumé, move the status, schedule an interview, set an
 * assignment, propose an offer, and start a conversation.
 *
 * EVERY CONTROL CALLS A REAL PHASE 9 ENDPOINT. There is no button in this file
 * whose only effect is local state — a control that appears to hire someone
 * and does not is worse than no control.
 *
 * The résumé is fetched ONLY when asked for, never as part of the list. The
 * browser receives a same-origin URL to our own endpoint; storage credentials
 * and object paths stay on the server.
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type ApiStatus, atsBandLabel, atsMatchLabel, atsPercent, buildTimeline,
  candidateStatusActions, eligibilityLabel, eligibilityTone, employerStatusActions,
  formatDateTime, formatOfferSalary, rejectionOutcome, safeExternalUrl,
  resumeCanPreview, statusLabel, statusTone,
} from '@/lib/job-ui-status';
import {
  Avatar, DANGER_BTN, ErrorNote, FAINT, FIELD, FOCUS, Field, GHOST_BTN, HEADING,
  MUTED, PRIMARY_BTN, Pill, Sheet,
} from './ui';

export interface ApplicantSubject {
  applicationId: string;
  candidateUserId?: string;
  candidateName: string;
  headline?: string;
  location?: string;
  skills?: string[];
  atsScore: number;
  atsBand?: string;
  eligibility?: string;
  status: string;
  appliedAt: string;
  hasResume?: boolean;
  resumeFileName?: string;
  jobTitle?: string;
  organizationName?: string;
}

interface Stages {
  interview: { scheduledAt?: string; mode?: string; notes?: string } | null;
  assignment: {
    title?: string; instructions?: string; dueAt?: string;
    submissionUrl?: string; submittedAt?: string;
  } | null;
  offer: {
    salaryAmount?: number; salaryCurrency?: string; salaryPeriod?: string;
    startDate?: string; notes?: string; response?: string | null; respondedAt?: string;
  } | null;
}

type Tab = 'profile' | 'status' | 'stages';

export default function ApplicantDetail({ subject, viewer, open, onClose, onChanged }: {
  subject: ApplicantSubject | null;
  /** Which side of the hire is looking. Controls what may be written. */
  viewer: 'employer' | 'candidate';
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('profile');
  const [status, setStatus] = useState<string>(subject?.status ?? '');
  const [history, setHistory] = useState<Array<{ from?: string | null; to?: string; changedAt?: string }>>([]);
  const [stages, setStages] = useState<Stages | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<{ wire: string; label: string } | null>(null);

  const applicationId = subject?.applicationId ?? '';

  useEffect(() => {
    setTab('profile');
    setStatus(subject?.status ?? '');
    setError('');
    setNotice('');
    setHistory([]);
    setStages(null);
  }, [subject?.applicationId, subject?.status]);

  /* Stage records are loaded once the sheet opens — not with the list. A
     200-row listing must not make 200 stage requests. */
  const loadStages = useCallback(async () => {
    if (!applicationId) return;
    try {
      const res = await fetch(`/api/hiring/applications/${encodeURIComponent(applicationId)}/stage`,
        { cache: 'no-store' });
      if (!res.ok) return;
      setStages(await res.json());
    } catch { /* A missing stage panel is not worth an error banner. */ }
  }, [applicationId]);

  useEffect(() => { if (open) loadStages(); }, [open, loadStages]);

  /* ── Status ─────────────────────────────────────────────────────────────*/

  const actions = viewer === 'employer'
    ? employerStatusActions(status)
    : candidateStatusActions(status);

  const applyStatus = async (wire: string) => {
    if (busy) return;
    setBusy('status');
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/hiring/applications/${encodeURIComponent(applicationId)}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: wire }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'That status change was refused.');
      setStatus(String(body?.status ?? wire));
      setHistory(Array.isArray(body?.statusHistory) ? body.statusHistory : []);
      /* Rejection reports its own outcome, because the email may have failed
         and the employer must not be told it went out when it did not. */
      setNotice(wire === 'rejected' ? rejectionOutcome(body ?? {}) : 'Status updated.');
      setConfirm(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That status change was refused.');
      setConfirm(null);
    } finally {
      setBusy('');
    }
  };

  /* ── Stages ─────────────────────────────────────────────────────────────*/

  const postStage = async (payload: Record<string, unknown>, tag: string) => {
    if (busy) return;
    setBusy(tag);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/hiring/applications/${encodeURIComponent(applicationId)}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(readableStageError(body?.error));
      setStages(body?.stages ?? null);
      setNotice('Saved.');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.');
    } finally {
      setBusy('');
    }
  };

  /* ── Chat ───────────────────────────────────────────────────────────────*/

  const openChat = async () => {
    if (busy) return;
    setBusy('chat');
    setError('');
    try {
      const res = await fetch(`/api/hiring/applications/${encodeURIComponent(applicationId)}/contact`,
        { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'A conversation could not be opened.');
      /* The existing messaging surface, not a second chat UI. */
      router.push(`/messages?conversation=${encodeURIComponent(String(body?.conversationId ?? ''))}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A conversation could not be opened.');
    } finally {
      setBusy('');
    }
  };

  if (!subject) return null;

  const resumeHref = `/api/hiring/applications/${encodeURIComponent(applicationId)}/resume`;
  const timeline = buildTimeline({
    status,
    appliedAt: subject.appliedAt,
    statusHistory: history,
    stages,
  });
  const band = atsBandLabel(subject.atsBand);

  return (
    <Sheet open={open} title={subject.candidateName || 'Application'} onClose={onClose} wide
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={openChat} disabled={Boolean(busy)}
            className={`${GHOST_BTN} ${FOCUS}`}>
            {busy === 'chat' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              : <MessageSquare className="h-3.5 w-3.5" aria-hidden />}
            {viewer === 'employer' ? 'Message candidate' : 'Message employer'}
          </button>
          <button type="button" onClick={onClose} className={`${PRIMARY_BTN} ${FOCUS}`}>Done</button>
        </div>
      }>

      {/* ── Identity ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Avatar name={subject.candidateName} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-slate-900 dark:text-white">
            {subject.candidateName || 'Candidate'}
          </p>
          {subject.headline ? (
            <p className={`mt-0.5 truncate text-[12.5px] ${MUTED}`}>{subject.headline}</p>
          ) : null}
          {subject.location ? (
            <p className={`mt-0.5 truncate text-[11.5px] ${FAINT}`}>{subject.location}</p>
          ) : null}
        </div>
      </div>

      {/* ── The three numbers that matter, stated honestly ──────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* "ATS Match", always. Never a chance, probability or likelihood. */}
        <Pill tone="progress">{atsMatchLabel(subject.atsScore)}{band ? ` · ${band}` : ''}</Pill>
        {/* Only drawn when the API returned an eligibility. Phase 5 computes it,
            but it is not persisted on the application, so most rows have none —
            and a permanent "Not stated" chip would be noise pretending to be data. */}
        {subject.eligibility ? (
          <Pill tone={eligibilityTone(subject.eligibility)}>{eligibilityLabel(subject.eligibility)}</Pill>
        ) : null}
        <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
      </div>

      <nav className="mt-4 flex gap-1 border-b border-slate-200 dark:border-white/[0.07]" role="tablist"
        aria-label="Application sections">
        {(['profile', 'status', 'stages'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`${FOCUS} -mb-px border-b-2 px-3 py-2 text-[12.5px] font-semibold transition ${
              tab === t
                ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/70'
            }`}>
            {t === 'profile' ? 'Profile' : t === 'status' ? 'Status' : 'Next steps'}
          </button>
        ))}
      </nav>

      <div className="mt-4 space-y-4">
        <ErrorNote message={error} />
        {notice ? (
          <p role="status"
            className="rounded-[12px] border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/[0.08] dark:text-emerald-200/90">
            {notice}
          </p>
        ) : null}

        {tab === 'profile' ? (
          <ProfileTab subject={subject} resumeHref={resumeHref} />
        ) : tab === 'status' ? (
          <StatusTab
            timeline={timeline}
            actions={actions}
            busy={busy === 'status'}
            onPick={(a) => (a.destructive ? setConfirm({ wire: a.wire, label: a.label }) : applyStatus(a.wire))}
          />
        ) : (
          <StagesTab
            stages={stages} viewer={viewer} busy={busy}
            onSubmit={postStage}
          />
        )}
      </div>

      {/* Terminal moves are irreversible, so each one is confirmed. */}
      <Sheet open={Boolean(confirm)} title={confirm?.label ?? ''} onClose={() => setConfirm(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className={`${GHOST_BTN} ${FOCUS}`}>
              Cancel
            </button>
            <button type="button" onClick={() => confirm && applyStatus(confirm.wire)}
              disabled={busy === 'status'} className={`${DANGER_BTN} ${FOCUS}`}>
              {busy === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {confirm?.label}
            </button>
          </div>
        }>
        <p className={`text-[13px] leading-relaxed ${MUTED}`}>
          {confirm?.wire === 'rejected'
            ? 'This cannot be undone. The candidate is notified in the app, and an email is sent to them once.'
            : confirm?.wire === 'hired'
              ? 'This cannot be undone. The application is closed as hired.'
              : 'This cannot be undone.'}
        </p>
      </Sheet>
    </Sheet>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────────*/

function ProfileTab({ subject, resumeHref }: { subject: ApplicantSubject; resumeHref: string }) {
  const applied = formatDateTime(subject.appliedAt);
  return (
    <div className="space-y-4">
      {subject.skills && subject.skills.length > 0 ? (
        <section>
          <h3 className={HEADING}>Skills</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {subject.skills.slice(0, 40).map((s) => (
              <li key={s}
                className="rounded-full border border-slate-200 bg-[#f8fafc] px-2.5 py-1 text-[11.5px] font-medium text-[#334155] dark:border-white/[0.07] dark:bg-[rgba(255,255,255,0.03)] dark:text-white/60">
                {s}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className={HEADING}>Application</h3>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Applied" value={applied} />
          <Field label="ATS Match" value={`${atsPercent(subject.atsScore)}%`} />
          <Field label="Eligibility" value={subject.eligibility ? eligibilityLabel(subject.eligibility) : null} />
          <Field label="Status" value={statusLabel(subject.status)} />
          {subject.jobTitle ? <Field label="Role" value={subject.jobTitle} /> : null}
          {subject.organizationName ? <Field label="Company" value={subject.organizationName} /> : null}
        </dl>
      </section>

      <section>
        <h3 className={HEADING}>Résumé</h3>
        {subject.hasResume ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Both point at our own endpoint. The browser never sees a storage
                URL or a credential, and neither is fetched until clicked — a
                listing of 200 applicants touches storage zero times.
                "View" is drawn only for PDFs, because that is the only type the
                server will serve inline; offering it for a .docx would open a
                download dialog and look broken. */}
            {resumeCanPreview(subject.resumeFileName) ? (
              <a href={`${resumeHref}?inline=1`} target="_blank" rel="noopener noreferrer"
                className={`${GHOST_BTN} ${FOCUS}`}>
                <FileText className="h-3.5 w-3.5" aria-hidden /> View résumé
                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
              </a>
            ) : null}
            <a href={resumeHref} className={`${GHOST_BTN} ${FOCUS}`}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Download résumé
            </a>
            {subject.resumeFileName ? (
              <span className={`text-[11.5px] ${FAINT}`}>{subject.resumeFileName}</span>
            ) : null}
          </div>
        ) : (
          <p className={`mt-2 text-[12.5px] ${MUTED}`}>No résumé was attached to this application.</p>
        )}
      </section>
    </div>
  );
}

function StatusTab({ timeline, actions, busy, onPick }: {
  timeline: ReturnType<typeof buildTimeline>;
  actions: ReturnType<typeof employerStatusActions>;
  busy: boolean;
  onPick: (a: ReturnType<typeof employerStatusActions>[number]) => void;
}) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className={HEADING}>Timeline</h3>
        {timeline.length === 0 ? (
          <p className={`mt-2 text-[12.5px] ${MUTED}`}>No status changes have been recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-0">
            {timeline.map((e, i) => (
              <li key={`${e.status}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  {/* Completed is filled, current is ringed, upcoming is hollow
                      and dashed — three distinct shapes, not three colours. */}
                  <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                    e.state === 'done'
                      ? 'border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-400'
                      : e.state === 'current'
                        ? 'border-sky-500 bg-[#ffffff] ring-2 ring-sky-500/30 dark:border-sky-400 dark:bg-[#111114]'
                        : 'border-dashed border-slate-400 bg-transparent dark:border-white/30'
                  }`} />
                  {i < timeline.length - 1 ? (
                    <span aria-hidden className="my-1 w-px flex-1 bg-slate-200 dark:bg-[rgba(255,255,255,0.10)]" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white/85">
                    {e.label}
                    <span className={`ml-2 text-[10.5px] font-medium uppercase tracking-wide ${FAINT}`}>
                      {e.state === 'done' ? 'Completed' : e.state === 'current' ? 'Current' : 'Scheduled'}
                    </span>
                  </p>
                  {e.when ? <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>{e.when}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className={HEADING}>Move this application</h3>
        {actions.length === 0 ? (
          <p className={`mt-2 text-[12.5px] ${MUTED}`}>
            This application is closed. No further changes can be made.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((a) => (
              <button key={a.status} type="button" disabled={busy} onClick={() => onPick(a)}
                className={`${a.destructive ? DANGER_BTN : GHOST_BTN} ${FOCUS}`}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Next steps ───────────────────────────────────────────────────────────*/

function StagesTab({ stages, viewer, busy, onSubmit }: {
  stages: Stages | null;
  viewer: 'employer' | 'candidate';
  busy: string;
  onSubmit: (payload: Record<string, unknown>, tag: string) => void;
}) {
  const employer = viewer === 'employer';
  const [interviewAt, setInterviewAt] = useState('');
  const [interviewMode, setInterviewMode] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [period, setPeriod] = useState('year');
  const [startDate, setStartDate] = useState('');

  const iso = (v: string) => (v ? new Date(v).toISOString() : '');
  const offerSalary = formatOfferSalary(stages?.offer);
  const submission = safeExternalUrl(stages?.assignment?.submissionUrl);

  return (
    <div className="space-y-6">
      {/* ── Interview ─────────────────────────────────────────────────── */}
      <section>
        <h3 className={HEADING}>Interview</h3>
        {stages?.interview ? (
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Field label="When" value={formatDateTime(stages.interview.scheduledAt) ?? 'Not scheduled'} />
            <Field label="Mode" value={stages.interview.mode} />
            {/* Recruiter notes are withheld from the candidate by the server,
                so this renders only what the server chose to send. */}
            {stages.interview.notes ? (
              <div className="col-span-2">
                <Field label={employer ? 'Recruiter notes' : 'Notes'} value={stages.interview.notes} />
              </div>
            ) : null}
          </dl>
        ) : (
          <p className={`mt-2 text-[12.5px] ${MUTED}`}>No interview has been scheduled.</p>
        )}

        {employer ? (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="sr-only">Interview date and time</span>
              <input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)}
                className={`${FIELD} ${FOCUS}`} />
            </label>
            <label className="block">
              <span className="sr-only">Interview mode or location</span>
              <input value={interviewMode} onChange={(e) => setInterviewMode(e.target.value)}
                placeholder="Video call, office, phone…" className={`${FIELD} ${FOCUS}`} />
            </label>
            <label className="block">
              <span className="sr-only">Recruiter notes</span>
              <textarea value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)}
                rows={2} placeholder="Notes (visible to your team only)"
                className={`${FIELD} ${FOCUS} h-auto py-2`} />
            </label>
            <button type="button" disabled={Boolean(busy)}
              onClick={() => onSubmit({
                action: 'set_interview',
                scheduledAt: iso(interviewAt),
                mode: interviewMode,
                notes: interviewNotes,
              }, 'interview')}
              className={`${GHOST_BTN} ${FOCUS}`}>
              {busy === 'interview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {stages?.interview ? 'Update interview' : 'Schedule interview'}
            </button>
          </div>
        ) : null}
      </section>

      {/* ── Assignment ────────────────────────────────────────────────── */}
      <section>
        <h3 className={HEADING}>Assignment</h3>
        {stages?.assignment ? (
          <div className="mt-2 space-y-2">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Title" value={stages.assignment.title} />
              <Field label="Due" value={formatDateTime(stages.assignment.dueAt) ?? 'No deadline'} />
            </dl>
            {stages.assignment.instructions ? (
              <p className={`whitespace-pre-wrap text-[12.5px] leading-relaxed ${MUTED}`}>
                {stages.assignment.instructions}
              </p>
            ) : null}
            {stages.assignment.submittedAt ? (
              <p className={`text-[12px] ${MUTED}`}>
                Submitted {formatDateTime(stages.assignment.submittedAt)}
                {/* Only an absolute http(s) link is ever turned into an anchor. */}
                {submission ? (
                  <> · <a href={submission} target="_blank" rel="noopener noreferrer nofollow"
                    className="font-semibold underline underline-offset-2">Open submission</a></>
                ) : null}
              </p>
            ) : (
              <p className={`text-[12px] ${FAINT}`}>Not submitted yet.</p>
            )}
          </div>
        ) : (
          <p className={`mt-2 text-[12.5px] ${MUTED}`}>No assignment has been set.</p>
        )}

        {employer ? (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="sr-only">Assignment title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Assignment title (required)" className={`${FIELD} ${FOCUS}`} />
            </label>
            <label className="block">
              <span className="sr-only">Assignment instructions</span>
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                rows={3} placeholder="What should the candidate do?"
                className={`${FIELD} ${FOCUS} h-auto py-2`} />
            </label>
            <label className="block">
              <span className="sr-only">Assignment deadline</span>
              <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
                className={`${FIELD} ${FOCUS}`} />
            </label>
            <button type="button" disabled={Boolean(busy) || !title.trim()}
              onClick={() => onSubmit({
                action: 'set_assignment', title, instructions, dueAt: iso(dueAt),
              }, 'assignment')}
              className={`${GHOST_BTN} ${FOCUS}`}>
              {busy === 'assignment' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {stages?.assignment ? 'Update assignment' : 'Set assignment'}
            </button>
          </div>
        ) : stages?.assignment ? (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="sr-only">Link to your submission</span>
              <input type="url" value={submissionUrl} onChange={(e) => setSubmissionUrl(e.target.value)}
                placeholder="https://… link to your work" className={`${FIELD} ${FOCUS}`} />
            </label>
            <button type="button" disabled={Boolean(busy) || !submissionUrl.trim()}
              onClick={() => onSubmit({ action: 'submit_assignment', submissionUrl }, 'submit')}
              className={`${PRIMARY_BTN} ${FOCUS}`}>
              {busy === 'submit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {stages.assignment.submittedAt ? 'Replace submission' : 'Submit assignment'}
            </button>
          </div>
        ) : null}
      </section>

      {/* ── Offer ─────────────────────────────────────────────────────── */}
      <section>
        <h3 className={HEADING}>Offer</h3>
        {stages?.offer ? (
          <dl className="mt-2 grid grid-cols-2 gap-3">
            {/* A salary the offer did not state is simply absent. It is never
                rendered as 0 — that would show an offer nobody made. */}
            <Field label="Salary" value={offerSalary ?? 'Not stated'} />
            <Field label="Start date" value={formatDateTime(stages.offer.startDate) ?? 'Not stated'} />
            <Field label="Response"
              value={stages.offer.response
                ? `${stages.offer.response === 'accepted' ? 'Accepted' : 'Declined'}`
                  + (formatDateTime(stages.offer.respondedAt) ? ` · ${formatDateTime(stages.offer.respondedAt)}` : '')
                : 'Awaiting the candidate'} />
            {stages.offer.notes ? (
              <div className="col-span-2"><Field label="Notes" value={stages.offer.notes} /></div>
            ) : null}
          </dl>
        ) : (
          <p className={`mt-2 text-[12.5px] ${MUTED}`}>No offer has been proposed.</p>
        )}

        {employer ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <label className="min-w-0 flex-1 basis-32">
                <span className="sr-only">Offer salary amount</span>
                <input type="number" min="0" inputMode="numeric" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount (optional)" className={`${FIELD} ${FOCUS}`} />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Currency</span>
                <input value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className={`${FIELD} ${FOCUS} w-24`} />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Salary period</span>
                <select value={period} onChange={(e) => setPeriod(e.target.value)}
                  className={`${FIELD} ${FOCUS} w-auto pr-8`}>
                  {['year', 'month', 'week', 'day', 'hour'].map((p) => (
                    <option key={p} value={p}>per {p}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="sr-only">Start date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className={`${FIELD} ${FOCUS}`} />
            </label>
            <button type="button" disabled={Boolean(busy)}
              onClick={() => onSubmit({
                action: 'propose_offer',
                salaryAmount: amount, salaryCurrency: currency, salaryPeriod: period,
                startDate: iso(startDate),
              }, 'offer')}
              className={`${GHOST_BTN} ${FOCUS}`}>
              {busy === 'offer' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {stages?.offer ? 'Revise offer' : 'Propose offer'}
            </button>
            {/* No accept/decline control here, at any stage. Answering an offer
                is the candidate's decision and only they may record it. */}
            <p className={`text-[11.5px] ${FAINT}`}>
              Only the candidate can accept or decline.
            </p>
          </div>
        ) : stages?.offer && !stages.offer.response ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)}
              onClick={() => onSubmit({ action: 'respond_to_offer', response: 'accepted' }, 'accept')}
              className={`${PRIMARY_BTN} ${FOCUS}`}>
              {busy === 'accept' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Accept offer
            </button>
            <button type="button" disabled={Boolean(busy)}
              onClick={() => onSubmit({ action: 'respond_to_offer', response: 'declined' }, 'decline')}
              className={`${GHOST_BTN} ${FOCUS}`}>
              {busy === 'decline' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Decline
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Server error codes, in words a person can act on. */
function readableStageError(code: unknown): string {
  switch (String(code ?? '')) {
    case 'NOT_PERMITTED': return 'You are not allowed to make that change.';
    case 'INVALID_INPUT': return 'Please check the details and try again. Links must start with http:// or https://.';
    case 'NO_OFFER': return 'There is no offer to respond to.';
    case 'NO_ASSIGNMENT': return 'There is no assignment to submit.';
    case 'ALREADY_ANSWERED': return 'This offer has already been answered.';
    default: return String(code || 'That could not be saved.');
  }
}
