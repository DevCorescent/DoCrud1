'use client';

/**
 * "How you want to be matched" — the answers that feed the matching engine, and
 * the switch that decides who can see each one.
 *
 * ═══ A DIALOG, BECAUSE IT IS A TASK ═══
 *
 * Sixteen answers inline on a profile page is a wall. This is a thing somebody
 * sits down and does, so it opens over the page, holds attention while it is
 * open, and closes when the job is done. The trigger states what is already
 * answered, so opening it is a decision rather than an exploration.
 *
 * It follows the dialog conventions already in this app (see ProfileQRCode):
 * portaled to <body> so the fixed bottom nav cannot paint over it, a bottom
 * sheet on mobile and a centred panel on desktop, Escape to close, focus moved
 * in on open and returned to the trigger on close.
 *
 * ═══ THE TRADE IS STATED, NOT IMPLIED ═══
 *
 * Every row says what the answer is used for and who can see it. Somebody
 * filling this in is telling us something in exchange for better matches, and
 * they are entitled to know which of those two things they are getting. The
 * visibility control sits next to the field it governs rather than in a
 * settings page elsewhere, because "who sees this" is a property of the answer,
 * not of the account.
 *
 * ═══ THE BROWSER DECIDES NOTHING ═══
 *
 * The toggle sets a value the SERVER re-derives on save
 * (`coercePreferenceVisibility`), and answers the model refuses to publish have
 * no toggle at all — they live in their own section, labelled. Hiding a control
 * is UX. The guarantee is that `publicMatchPreferences` is an allow-list and
 * the public profile endpoint projects through it.
 *
 * What comes back from a save is the SERVER's version, not this component's:
 * it drops unknown keys, caps lists and refuses to publish what it will not
 * publish, so the state shown after saving is the state that was stored.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Lock, X } from 'lucide-react';
import { countShown } from '@/lib/match-preferences-ui';
import MatchPreferencesTrigger from './MatchPreferencesTrigger';

type Visibility = 'public' | 'private';

/* Mirrors lib/server/match-preferences.ts. The server re-validates everything;
   these lists exist so the editor offers the same vocabulary rather than free
   text that would be silently dropped on save. */
const WORK_MODES = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
];
const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'temporary', label: 'Temporary' },
];
const AVAILABILITY = [
  { value: 'immediately', label: 'Immediately' },
  { value: 'within_30_days', label: 'Within 30 days' },
  { value: 'within_90_days', label: 'Within 90 days' },
  { value: 'not_looking', label: 'Not looking' },
];
const RELOCATION = [
  { value: 'yes', label: 'Yes, anywhere' },
  { value: 'for_the_right_role', label: 'For the right role' },
  { value: 'no', label: 'No' },
];
const SALARY_PERIODS = [
  { value: 'year', label: 'per year' },
  { value: 'month', label: 'per month' },
  { value: 'hour', label: 'per hour' },
];
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

/** The four steps, and what the header says while each is showing. */
const STEPS = [
  { title: 'Where you will work',
    blurb: 'Where you are willing to work, and how. Private unless you turn it on.' },
  { title: 'What you are looking for',
    blurb: 'The kind of role you want. Private unless you turn it on.' },
  { title: 'About your experience',
    blurb: 'What you bring. Private unless you turn it on.' },
  { title: 'Private answers',
    blurb: 'Used for matching only. These are never shown on your profile.' },
] as const;

export interface MatchPreferencesValue {
  preferredLocations?: string[];
  relocation?: string;
  workAuthorization?: string[];
  workModes?: string[];
  employmentTypes?: string[];
  preferredDomains?: string[];
  desiredTitles?: string[];
  experienceYears?: number;
  minSalary?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  availability?: string;
  noticePeriodDays?: number;
  willingToTravel?: boolean;
  languages?: string[];
  companySizes?: string[];
}

/* ─── Shared classes, so every control in the dialog is the same control ──── */
const INPUT =
  'w-full rounded-[10px] border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[13px] text-white/85 '
  + 'placeholder:text-white/25 outline-none transition focus:border-white/30 focus:bg-white/[0.05]';
const CHIP = 'rounded-full border px-3 py-[5px] text-[12px] font-medium transition active:scale-[0.97]';
/* A chosen answer reads as FILLED. At the earlier contrast it was a slightly
   lighter outline, which on a multi-select is the difference between "I picked
   that" and "I might have picked that".

   `bg-white`, NOT `bg-white/90` — and the difference is not cosmetic. A global
   dark-mode rule repaints anything carrying `text-slate-950` to near-white
   (globals.css), and the rule that restores dark text on light controls is
   scoped to `button[class~='bg-white']` — an EXACT token match, so translucent
   glass surfaces are left alone. `bg-white/90` is a different token: it took
   the whitening and missed the restore, leaving white text on a white pill at
   1.05:1. Measured, not guessed. */
const CHIP_ON = 'border-white bg-white text-slate-950 font-semibold';
const CHIP_OFF = 'border-white/[0.08] bg-white/[0.02] text-white/45 hover:border-white/[0.16] hover:text-white/75';

/** A titled group of answers. Sections are what keep sixteen fields readable. */
function Section({ title, note, locked, children }: {
  title: string; note?: string; locked?: boolean; children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4 sm:px-6 sm:py-5">
      <div className="mb-1 flex items-center gap-1.5">
        {locked && <Lock className="h-3 w-3 shrink-0 text-white/35" aria-hidden />}
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{title}</h3>
      </div>
      {note && <p className="mb-3 text-[11.5px] leading-relaxed text-white/30">{note}</p>}
      <div className="mt-3 space-y-3.5 sm:space-y-4">{children}</div>
    </section>
  );
}

/** One answer, with the control that governs who sees it. */
function Row({ title, help, visibility, onVisibility, children }: {
  title: string;
  help: string;
  /** Absent means this answer can never be published — no choice is offered. */
  visibility?: Visibility;
  onVisibility?: (next: Visibility) => void;
  children: React.ReactNode;
}) {
  const isPublic = visibility === 'public';
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white/80">{title}</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/35">{help}</p>
        </div>
        {onVisibility && (
          <button
            type="button"
            onClick={() => onVisibility(isPublic ? 'private' : 'public')}
            aria-pressed={isPublic}
            aria-label={`${title}: ${isPublic ? 'shown on your profile' : 'private'}`}
            title={isPublic ? 'Shown on your profile — click to hide' : 'Private — click to show on your profile'}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] transition active:scale-[0.97] ${
              isPublic
                ? 'border-emerald-400/30 bg-emerald-400/[0.12] text-emerald-300'
                : 'border-white/[0.09] bg-white/[0.03] text-white/40 hover:border-white/[0.18] hover:text-white/70'
            }`}
          >
            {isPublic ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
            {isPublic ? 'Shown' : 'Private'}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Chips({ options, selected, onChange }: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A single-choice chip group. Clicking the chosen one clears it. */
function OneOf({ options, value, onChange }: {
  options: Array<{ value: string; label: string }>;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" aria-pressed={on}
            onClick={() => onChange(on ? undefined : o.value)}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A comma-separated list, edited as text because that is how people type lists. */
function ListInput({ value, onChange, placeholder }: {
  value: string[]; onChange: (next: string[]) => void; placeholder: string;
}) {
  const joined = value.join(', ');
  const [text, setText] = useState(joined);
  /* Re-seeded only when the SAVED value changes, so typing a comma does not
     fight the parse on every keystroke. */
  useEffect(() => { setText(joined); }, [joined]);
  const commit = () => onChange(text.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12));
  return (
    <input className={INPUT} value={text} placeholder={placeholder}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
  );
}

export default function MatchPreferencesEditor({
  initialPreferences,
  initialVisibility,
  onSaved,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: {
  initialPreferences?: MatchPreferencesValue;
  initialVisibility?: Record<string, Visibility>;
  onSaved?: (prefs: MatchPreferencesValue, visibility: Record<string, Visibility>) => void;
  /**
   * Render the dialog WITHOUT its own trigger, for callers that already have
   * one — the profile-completion checklist opens this from its own chip, and
   * two triggers for one dialog is one too many.
   */
  hideTrigger?: boolean;
  /** Controlled open state. Omit both and the component manages its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  /* The last state the SERVER confirmed. Edits are compared against this, so
     "unsaved changes" means what it says. */
  const [saved, setSaved] = useState({
    prefs: initialPreferences ?? {},
    vis: initialVisibility ?? {},
  });
  const [prefs, setPrefs] = useState<MatchPreferencesValue>(initialPreferences ?? {});
  const [vis, setVis] = useState<Record<string, Visibility>>(initialVisibility ?? {});

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  /* Controlled when a caller passes `open`; self-managed otherwise. Both paths
     run the same open/close logic, so the guard and the focus handling cannot
     differ between them. */
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback((next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }, [isControlled, onOpenChange]);

  /**
   * Which step is showing.
   *
   * Sixteen answers in one column is a long scroll on a phone and a wall on a
   * desktop. Four short steps each fit a screen, so the person is answering a
   * handful of related questions rather than surveying a form.
   */
  const [step, setStep] = useState(0);

  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const triggerWrapRef = useRef<HTMLSpanElement | null>(null);
  /** Focus returns to whatever opened the dialog, wherever that button lives. */
  const focusTrigger = useCallback(() => {
    triggerWrapRef.current?.querySelector('button')?.focus();
  }, []);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(prefs) !== JSON.stringify(saved.prefs)
      || JSON.stringify(vis) !== JSON.stringify(saved.vis),
    [prefs, vis, saved],
  );

  /* Counted the way the SERVER projects: a field marked public but left empty
     is not shown to anybody, and saying it is turns a privacy statement into a
     wrong one. */
  const publicCount = useMemo(() => countShown(prefs, vis), [prefs, vis]);

  const set = useCallback(<K extends keyof MatchPreferencesValue>(key: K, value: MatchPreferencesValue[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setError(''); setConfirmDiscard(false);
  }, []);
  const setVisibility = useCallback((key: string, next: Visibility) => {
    setVis((v) => ({ ...v, [key]: next }));
    setError(''); setConfirmDiscard(false);
  }, []);
  const visOf = (key: string): Visibility => (vis[key] === 'public' ? 'public' : 'private');

  const openDialog = useCallback(() => { setOpen(true); }, [setOpen]);

  /* Every opening starts from the last SAVED state, however it was triggered —
     by our own button or by a caller flipping `open`. A dialog dismissed with
     unsaved edits must not reopen still holding them. */
  useEffect(() => {
    if (!open) return;
    setPrefs(saved.prefs); setVis(saved.vis);
    setStep(0);
    setError(''); setJustSaved(false); setConfirmDiscard(false);
    /* Deliberately keyed on `open` alone: re-seeding whenever `saved` changes
       would wipe the edits in progress the moment a save resolved. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeDialog = useCallback((force = false) => {
    if (dirty && !force) { setConfirmDiscard(true); return; }
    setOpen(false); setConfirmDiscard(false);
    focusTrigger();
  }, [dirty, setOpen, focusTrigger]);

  /* Escape closes, focus moves in, and the page behind stops scrolling. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDialog(); };
    window.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closeDialog]);

  const save = async () => {
    setSaving(true); setError(''); setConfirmDiscard(false);
    try {
      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchPreferences: prefs, matchPreferenceVisibility: vis }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'We could not save your preferences.');

      /* The server's version of what was saved, not the browser's. */
      const savedPrefs = (body?.profile?.matchPreferences ?? {}) as MatchPreferencesValue;
      const savedVis = (body?.profile?.matchPreferenceVisibility ?? {}) as Record<string, Visibility>;
      setPrefs(savedPrefs); setVis(savedVis);
      setSaved({ prefs: savedPrefs, vis: savedVis });
      onSaved?.(savedPrefs, savedVis);

      /* Confirm, then close. Closing instantly would leave somebody unsure
         whether anything happened; holding it open would make them close it. */
      setJustSaved(true);
      window.setTimeout(() => {
        setJustSaved(false);
        setOpen(false);
        focusTrigger();
      }, 850);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save your preferences.');
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center pb-[92px] md:items-center md:pb-0">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => closeDialog()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-prefs-title"
        className="relative z-10 flex max-h-[calc(92vh-62px)] w-full flex-col overflow-hidden rounded-t-[26px] border border-white/[0.09] bg-[#111113] shadow-2xl md:mx-4 md:max-h-[86vh] md:max-w-[680px] md:rounded-[22px]"
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="match-prefs-title" className="text-[15px] font-semibold text-white">How you want to be matched</h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-white/40">
              {STEPS[step].blurb}
            </p>
            {/* Where you are, and how much is left. Tapping a dot jumps — the
                steps are independent, so nothing is gained by making somebody
                walk back through them. */}
            <div className="mt-2.5 flex items-center gap-1.5">
              {STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === step ? 'step' : undefined}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-6 bg-white/80' : 'w-1.5 bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
              <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/30">
                {step + 1}/{STEPS.length}
              </span>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={() => closeDialog()} aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] transition hover:bg-white/[0.11]">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {step === 0 && (
          <Section title="Where you will work">
            <Row title="Preferred locations" help="Cities you would work in, beyond where you live now."
              visibility={visOf('preferredLocations')} onVisibility={(v) => setVisibility('preferredLocations', v)}>
              <ListInput value={prefs.preferredLocations ?? []} placeholder="Bengaluru, Pune, London"
                onChange={(v) => set('preferredLocations', v)} />
            </Row>
            <Row title="Open to relocating" help="Whether a role elsewhere is worth considering."
              visibility={visOf('relocation')} onVisibility={(v) => setVisibility('relocation', v)}>
              <OneOf options={RELOCATION} value={prefs.relocation} onChange={(v) => set('relocation', v)} />
            </Row>
            <Row title="Work mode" help="Roles that cannot offer any of these stop being recommended."
              visibility={visOf('workModes')} onVisibility={(v) => setVisibility('workModes', v)}>
              <Chips options={WORK_MODES} selected={prefs.workModes ?? []} onChange={(v) => set('workModes', v)} />
            </Row>
            <Row title="Authorised to work in" help="Two-letter country codes. Roles outside these are not recommended."
              visibility={visOf('workAuthorization')} onVisibility={(v) => setVisibility('workAuthorization', v)}>
              <ListInput value={prefs.workAuthorization ?? []} placeholder="IN, GB"
                onChange={(v) => set('workAuthorization', v)} />
            </Row>
          </Section>

          )}

          {step === 1 && (
          <Section title="What you are looking for">
            <Row title="Roles you want" help="Titles you are aiming for, in your words. Matched against job titles."
              visibility={visOf('desiredTitles')} onVisibility={(v) => setVisibility('desiredTitles', v)}>
              <ListInput value={prefs.desiredTitles ?? []} placeholder="Staff Engineer, Engineering Manager"
                onChange={(v) => set('desiredTitles', v)} />
            </Row>
            <Row title="Employment type" help="The shapes of work you will take."
              visibility={visOf('employmentTypes')} onVisibility={(v) => setVisibility('employmentTypes', v)}>
              <Chips options={EMPLOYMENT_TYPES} selected={prefs.employmentTypes ?? []} onChange={(v) => set('employmentTypes', v)} />
            </Row>
            <Row title="Company size" help="The size of organisation you want to work in."
              visibility={visOf('companySizes')} onVisibility={(v) => setVisibility('companySizes', v)}>
              <Chips options={COMPANY_SIZES.map((s) => ({ value: s, label: s }))}
                selected={prefs.companySizes ?? []} onChange={(v) => set('companySizes', v)} />
            </Row>
            <Row title="Availability" help="When you could start."
              visibility={visOf('availability')} onVisibility={(v) => setVisibility('availability', v)}>
              <OneOf options={AVAILABILITY} value={prefs.availability} onChange={(v) => set('availability', v)} />
            </Row>
          </Section>

          )}

          {step === 2 && (
          <Section title="About your experience">
            <Row title="Years of experience"
              help="Compared only against a role that states its own minimum. Never guessed from your titles."
              visibility={visOf('experienceYears')} onVisibility={(v) => setVisibility('experienceYears', v)}>
              <input className={`${INPUT} max-w-[10rem]`} type="number" min={0} max={60} inputMode="numeric"
                value={prefs.experienceYears ?? ''} placeholder="e.g. 7"
                onChange={(e) => set('experienceYears', e.target.value === '' ? undefined : Number(e.target.value))} />
            </Row>
            <Row title="Languages" help="Languages you work in."
              visibility={visOf('languages')} onVisibility={(v) => setVisibility('languages', v)}>
              <ListInput value={prefs.languages ?? []} placeholder="English, Hindi" onChange={(v) => set('languages', v)} />
            </Row>
            <Row title="Willing to travel" help="Whether travel is acceptable."
              visibility={visOf('willingToTravel')} onVisibility={(v) => setVisibility('willingToTravel', v)}>
              <OneOf options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                value={prefs.willingToTravel === undefined ? undefined : (prefs.willingToTravel ? 'yes' : 'no')}
                onChange={(v) => set('willingToTravel', v === undefined ? undefined : v === 'yes')} />
            </Row>
          </Section>
          )}

          {/* Its own STEP, so it is impossible to miss which answers can never
              appear on a profile — rather than a lock icon a person has to
              notice on a row that looks like all the others. */}
          {step === 3 && (
          <Section
            locked
            title="Private · never shown on your profile"
            note="Used for matching only. There is no switch for these, and the server refuses to publish them whatever it is asked."
          >
            <Row title="Minimum salary" help="Roles that state less are not recommended.">
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${INPUT} max-w-[9rem]`} type="number" min={0} inputMode="numeric"
                  value={prefs.minSalary ?? ''} placeholder="Amount"
                  onChange={(e) => set('minSalary', e.target.value === '' ? undefined : Number(e.target.value))} />
                <input className={`${INPUT} max-w-[5.5rem]`} maxLength={3} value={prefs.salaryCurrency ?? ''}
                  placeholder="INR" onChange={(e) => set('salaryCurrency', e.target.value.toUpperCase())} />
                <OneOf options={SALARY_PERIODS} value={prefs.salaryPeriod} onChange={(v) => set('salaryPeriod', v)} />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">
                A figure on its own is not used — it needs a currency and a period, or there is
                nothing to compare it against.
              </p>
            </Row>
            <Row title="Notice period" help="Days of notice you owe your current employer.">
              <input className={`${INPUT} max-w-[10rem]`} type="number" min={0} max={365} inputMode="numeric"
                value={prefs.noticePeriodDays ?? ''} placeholder="Days"
                onChange={(e) => set('noticePeriodDays', e.target.value === '' ? undefined : Number(e.target.value))} />
            </Row>
          </Section>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-white/[0.07] bg-[#111113] px-5 py-3.5 sm:px-6">
          {error && <p role="alert" className="mb-2.5 text-[12px] font-medium text-rose-300">{error}</p>}
          {confirmDiscard && (
            <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
              <span className="text-amber-300/90">You have unsaved changes.</span>
              <button type="button" onClick={() => closeDialog(true)}
                className="font-semibold text-white/70 underline underline-offset-2 hover:text-white">
                Discard and close
              </button>
              <button type="button" onClick={() => setConfirmDiscard(false)}
                className="font-semibold text-white/45 hover:text-white/70">
                Keep editing
              </button>
            </div>
          )}
          <p className="mb-2.5 text-[11.5px] leading-snug text-white/35">
            {publicCount === 0
              ? 'Nothing here is shown on your profile.'
              : `${publicCount} shown on your profile · the rest are used for matching only.`}
          </p>

          <div className="flex items-center gap-2">
            {/* Back on every step but the first, where it would be a dead
                control; Cancel takes its place there. */}
            <button type="button" disabled={saving}
              onClick={() => (step === 0 ? closeDialog() : setStep((n) => n - 1))}
              className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white/50 transition hover:text-white/80 disabled:opacity-50">
              {step > 0 && <ChevronLeft className="h-3.5 w-3.5" aria-hidden />}
              {step === 0 ? 'Cancel' : 'Back'}
            </button>

            <span className="flex-1" />

            {/* Saving is reachable from ANY step, not only the last one.
                Somebody who came to change one answer on step 1 should not have
                to walk through three more screens to keep it. It appears only
                once there is something to save. */}
            {dirty && step < STEPS.length - 1 && !justSaved && (
              <button type="button" onClick={save} disabled={saving}
                className="rounded-full px-3 py-2 text-[13px] font-semibold text-white/60 transition hover:text-white/90 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep((n) => n + 1)} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-slate-950 transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-60">
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={save} disabled={saving || justSaved}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-[0.98] disabled:cursor-default ${
                  justSaved ? 'bg-emerald-400 text-emerald-950' : 'bg-white text-slate-950 hover:bg-white/90 disabled:opacity-60'
                }`}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {justSaved && <Check className="h-3.5 w-3.5" aria-hidden />}
                {saving ? 'Saving…' : justSaved ? 'Saved' : 'Save preferences'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* The built-in trigger, for callers that do not supply their own. It is
          the SAME component the completion card and the About tab render, so
          all three say the same thing about the same data. */}
      {!hideTrigger && (
        <span ref={triggerWrapRef} className="block">
          <MatchPreferencesTrigger
            preferences={saved.prefs}
            visibility={saved.vis}
            onOpen={openDialog}
          />
        </span>
      )}

      {open && typeof document !== 'undefined' && createPortal(dialog, document.body)}
    </>
  );
}
