'use client';

/**
 * The seven steps.
 *
 * Each is a pure presentation component: it receives the draft, the errors for
 * its own fields and a setter, and renders only what belongs to that step. No
 * step fetches, validates or decides navigation — `validateStep` in
 * lib/jobs/post-wizard.ts owns the rules and JobPostWizard owns the flow — so
 * a rule cannot differ between the page that shows it and the code that
 * enforces it.
 *
 * FIELD COUNT PER STEP IS THE POINT. The old composer put all thirteen fields
 * on one scrolling page. These hold three or four each, which is what lets a
 * step fit a laptop viewport without shrinking anything.
 */

import type { JobDraft, FieldErrors } from '@/lib/jobs/post-wizard';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS,
} from '@/lib/jobs-ui';
import JobPostPreview, { type JobPreviewPoster } from '../JobPostPreview';
import {
  Field, HelpCard, INPUT_CLASS, INVALID_CLASS, SelectField, TEXTAREA_CLASS,
  fieldProps, FAINT, MUTED, GLASS,
} from './ui';
import { LanguageCountryBar, LocationAutocomplete } from './controls';

export interface StepProps {
  draft: JobDraft;
  errors: FieldErrors;
  set: <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => void;
}

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/* ── 1 · Basics ───────────────────────────────────────────────────────────*/

export function JobBasicsStep({ draft, errors, set }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <LanguageCountryBar
        language={draft.language}
        country={draft.country}
        onChange={({ language, country }) => { set('language', language); set('country', country); }}
      />

      <Field id="job-title" label="Job title" required error={errors.title}
        hint="A specific title candidates search for — “Senior React Developer”, not “Rockstar”.">
        <input
          {...fieldProps('job-title', errors.title, 'hint')}
          type="text"
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Software Engineer"
          autoComplete="off"
          className={`${INPUT_CLASS} ${errors.title ? INVALID_CLASS : ''}`}
        />
      </Field>

      <SelectField
        id="job-workmode"
        label="Job location type"
        required
        value={draft.workMode}
        onChange={(v) => set('workMode', v)}
        options={[
          { value: 'onsite', label: 'In person', description: 'Worked at the location' },
          { value: 'hybrid', label: 'Hybrid', description: 'Part on-site, part remote' },
          { value: 'remote', label: 'Remote', description: 'Worked from anywhere' },
        ]}
      />

      {/* A fully remote role has no location to state, so the field is not
          shown rather than shown-and-optional — an empty box a poster has to
          reason about is worse than no box. */}
      {draft.workMode !== 'remote' && (
        <LocationAutocomplete
          id="job-location"
          value={draft.location}
          error={errors.location}
          required
          hint="Start typing to pick a city the Jobs filters recognise."
          onChange={(v) => set('location', v)}
        />
      )}
    </div>
  );
}

export function BasicsHelp() {
  return (
    <HelpCard title="Writing a good title">
      <p>Name the role and its level. “Senior React Developer” is found by search; “Ninja Coder” is not.</p>
      <p>Leave out the location, salary and employment type — each has its own field and shows on the card.</p>
    </HelpCard>
  );
}

/* ── 2 · Details ──────────────────────────────────────────────────────────*/

export function JobDetailsStep({ draft, errors, set }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <Field id="job-description" label="Description" required error={errors.description}
        hint="What the role is, who the team is, and why it is worth applying for.">
        <textarea
          {...fieldProps('job-description', errors.description, 'hint')}
          rows={7}
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Tell candidates what this role does day to day…"
          className={`${TEXTAREA_CLASS} resize-y ${errors.description ? INVALID_CLASS : ''}`}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="job-employment" label="Employment type"
          value={draft.employmentType} onChange={(v) => set('employmentType', v)}
          options={options(EMPLOYMENT_TYPE_LABELS)}
        />
        <SelectField
          id="job-experience" label="Experience level"
          value={draft.experienceLevel} onChange={(v) => set('experienceLevel', v)}
          options={options(EXPERIENCE_LABELS)}
        />
      </div>

      <Field id="job-department" label="Department" hint="Optional — helps candidates place the role.">
        <input
          {...fieldProps('job-department', undefined, 'hint')}
          type="text"
          value={draft.department}
          onChange={(e) => set('department', e.target.value)}
          placeholder="Engineering"
          className={INPUT_CLASS}
        />
      </Field>
    </div>
  );
}

/* ── 3 · Requirements ─────────────────────────────────────────────────────*/

const LIST_HINT = 'One per line.';

export function JobRequirementsStep({ draft, set }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <Field id="job-responsibilities" label="Responsibilities" hint={LIST_HINT}>
        <textarea
          {...fieldProps('job-responsibilities', undefined, 'hint')}
          rows={4}
          value={draft.responsibilities}
          onChange={(e) => set('responsibilities', e.target.value)}
          placeholder={'Ship features end to end\nReview pull requests'}
          className={`${TEXTAREA_CLASS} resize-y`}
        />
      </Field>

      <Field id="job-requirements" label="Requirements" hint={LIST_HINT}>
        <textarea
          {...fieldProps('job-requirements', undefined, 'hint')}
          rows={4}
          value={draft.requirements}
          onChange={(e) => set('requirements', e.target.value)}
          placeholder={'3+ years with React\nStrong TypeScript'}
          className={`${TEXTAREA_CLASS} resize-y`}
        />
      </Field>

      <Field id="job-skills" label="Preferred skills"
        hint="One per line — these show as tags on the job card and drive matching.">
        <textarea
          {...fieldProps('job-skills', undefined, 'hint')}
          rows={3}
          value={draft.preferredSkills}
          onChange={(e) => set('preferredSkills', e.target.value)}
          placeholder={'React\nTypeScript\nNode.js'}
          className={`${TEXTAREA_CLASS} resize-y`}
        />
      </Field>
    </div>
  );
}

export function RequirementsHelp() {
  return (
    <HelpCard title="Skills drive matching">
      <p>Each preferred skill is compared against a member&apos;s profile to produce the match score on their feed.</p>
      <p>Listing the four or five that genuinely matter beats listing twenty.</p>
    </HelpCard>
  );
}

/* ── 4 · Compensation ─────────────────────────────────────────────────────*/

const CURRENCIES = [
  { value: 'INR', label: 'INR — Indian rupee' },
  { value: 'USD', label: 'USD — US dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — Pound sterling' },
  { value: 'AED', label: 'AED — UAE dirham' },
  { value: 'SGD', label: 'SGD — Singapore dollar' },
];

const PERIODS = [
  { value: 'year', label: 'Per year' },
  { value: 'month', label: 'Per month' },
  { value: 'week', label: 'Per week' },
  { value: 'day', label: 'Per day' },
  { value: 'hour', label: 'Per hour' },
];

export function JobCompensationStep({ draft, errors, set }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="job-salary-min" label="Minimum" error={errors.salaryMin} hint="Leave blank to omit.">
          <input
            {...fieldProps('job-salary-min', errors.salaryMin, 'hint')}
            type="number" min="0" step="1" inputMode="numeric"
            value={draft.salaryMin}
            onChange={(e) => set('salaryMin', e.target.value)}
            placeholder="800000"
            className={`${INPUT_CLASS} ${errors.salaryMin ? INVALID_CLASS : ''}`}
          />
        </Field>
        <Field id="job-salary-max" label="Maximum" error={errors.salaryMax} hint="Leave blank to omit.">
          <input
            {...fieldProps('job-salary-max', errors.salaryMax, 'hint')}
            type="number" min="0" step="1" inputMode="numeric"
            value={draft.salaryMax}
            onChange={(e) => set('salaryMax', e.target.value)}
            placeholder="1400000"
            className={`${INPUT_CLASS} ${errors.salaryMax ? INVALID_CLASS : ''}`}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField id="job-currency" label="Currency"
          value={draft.salaryCurrency} onChange={(v) => set('salaryCurrency', v)} options={CURRENCIES} />
        <SelectField id="job-period" label="Period"
          value={draft.salaryPeriod} onChange={(v) => set('salaryPeriod', v)} options={PERIODS} />
      </div>

      <p className={`text-[12.5px] leading-relaxed ${FAINT}`}>
        A posting with no range stays that way — it is never shown as a salary of zero.
      </p>
    </div>
  );
}

export function CompensationHelp() {
  return (
    <HelpCard title="Stating a range">
      <p>Both figures are optional, and a posting without them is published exactly as before.</p>
      <p>If you give a range, the maximum must be at least the minimum — the pair is stored as you entered it, never reordered.</p>
    </HelpCard>
  );
}

/* ── 5 · Screening ────────────────────────────────────────────────────────*/

export function JobScreeningStep({ draft, errors, set }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <Field id="job-documents" label="Required documents"
        hint="One per line — e.g. Portfolio. Leave blank to ask for a resume only.">
        <textarea
          {...fieldProps('job-documents', undefined, 'hint')}
          rows={3}
          value={draft.requiredDocuments}
          onChange={(e) => set('requiredDocuments', e.target.value)}
          placeholder={'Portfolio\nCover letter'}
          className={`${TEXTAREA_CLASS} resize-y`}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="job-ats" label="Minimum ATS score" error={errors.minimumAtsScore}
          hint="0–100. Applicants scoring below this cannot submit.">
          <input
            {...fieldProps('job-ats', errors.minimumAtsScore, 'hint')}
            type="number" min="0" max="100" step="1" inputMode="numeric"
            value={draft.minimumAtsScore}
            onChange={(e) => set('minimumAtsScore', e.target.value)}
            className={`${INPUT_CLASS} ${errors.minimumAtsScore ? INVALID_CLASS : ''}`}
          />
        </Field>
        <SelectField
          id="job-status" label="Visibility"
          hint="Published roles appear in the Jobs feed."
          value={draft.status} onChange={(v) => set('status', v)}
          options={[
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Draft' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
      </div>
    </div>
  );
}

export function ScreeningHelp() {
  return (
    <HelpCard title="About the ATS cutoff">
      <p>Every application is scored against this posting before it is submitted.</p>
      <p>A high cutoff filters hard. 72 is the default and a reasonable starting point.</p>
    </HelpCard>
  );
}

/* ── 6 · Preview ──────────────────────────────────────────────────────────*/

/**
 * Rendered from the draft, with no request.
 *
 * Reuses the existing JobPostPreview so the composer keeps one preview rather
 * than gaining a second that could drift from it.
 */
export function JobPreviewStep({ draft, poster }: { draft: JobDraft; poster: JobPreviewPoster | null }) {
  return (
    <div className={`${GLASS} overflow-hidden`}>
      <JobPostPreview data={draft} poster={poster} />
    </div>
  );
}

/* ── 7 · Publish ──────────────────────────────────────────────────────────*/

export function JobPublishStep({
  draft, editId, summary,
}: {
  draft: JobDraft;
  editId: string;
  summary: Array<{ label: string; value: string }>;
}) {
  const live = draft.status === 'published';
  return (
    <div className="flex flex-col gap-5">
      <div className={`${GLASS} p-5`}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {summary.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className={`text-[11px] font-bold uppercase tracking-[0.13em] ${FAINT}`}>{row.label}</dt>
              <dd className="mt-0.5 truncate text-[13.5px] font-medium text-slate-800 dark:text-white/80">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className={`text-[13.5px] leading-relaxed ${MUTED}`}>
        {live
          ? `${editId ? 'Updating' : 'Publishing'} makes this role visible to candidates in the Jobs feed straight away.`
          : `This will be saved with the status “${draft.status}”, so it stays out of the Jobs feed until you publish it.`}
      </p>
    </div>
  );
}
