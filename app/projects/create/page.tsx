'use client';

/**
 * Post a project — one form, one submit.
 *
 * Deliberately single-step: the brief asks for a straightforward form, not a
 * wizard. It posts once to /api/projects and sends the poster straight to the
 * published project.
 *
 * ═══ THE JOB COMPOSER'S LANGUAGE, NOT A SECOND ONE ═══
 *
 * This was a dark form — `#0d0d10` panels, `text-white/32` labels, a violet
 * gradient submit — sitting one menu row away from a light seven-step composer.
 * Two posting forms in one product that share no ink, no field, no label and no
 * button is two products.
 *
 * So the surfaces and controls are IMPORTED from the wizard rather than
 * restyled to match it: `Field`, `SelectField`, `ChipGroup`, `GlassPanel` and
 * the input classes are the same definitions the seven steps use. A field
 * cannot drift between the two forms because there is only one of each field.
 * What is NOT shared is the step rail and the footer — this form has one step,
 * so it has one submit and no progress to show.
 *
 * ═══ NOTHING ABOUT THE POSTING CHANGED ═══
 *
 * Same state, same validation, same payload, same endpoint, same redirect. The
 * budget still stores no figure when it is negotiable, and the project is still
 * created active. This is a restyle; if it changed what gets posted it would be
 * a rewrite wearing a restyle's description.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, X, AlertCircle } from 'lucide-react';
import DiscoverShell from '@/components/home/discover/DiscoverShell';
import {
  ChipGroup, Field, GlassPanel, SelectField, fieldProps,
  INPUT_CLASS, TEXTAREA_CLASS, MUTED,
} from '@/components/jobs/post/ui';
import { BTN_PRIMARY } from '@/components/jobs/post/WizardChrome';
import {
  PROJECT_CATEGORIES, BUDGET_TYPE_LABELS, PROJECT_TYPE_LABELS, WORK_MODE_LABELS,
} from '@/lib/projects-ui';

const CATEGORY_KEYS = Object.keys(PROJECT_CATEGORIES);
const PROJECT_TYPES = ['one_time', 'ongoing', 'contract', 'collaboration'] as const;
const BUDGET_TYPES = ['fixed', 'hourly', 'negotiable'] as const;
const WORK_MODES = ['remote', 'onsite', 'hybrid'] as const;
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;

const chips = (keys: readonly string[], labels: Record<string, string>) =>
  keys.map((v) => ({ value: v, label: labels[v] ?? v }));

export default function CreateProjectPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('development');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [budgetType, setBudgetType] = useState<string>('fixed');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [location, setLocation] = useState('');
  const [workMode, setWorkMode] = useState<string>('remote');
  const [projectType, setProjectType] = useState<string>('one_time');
  const [deadline, setDeadline] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Per-field, so a missing title says so at the title rather than only in a
     banner at the bottom of the form. */
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v || skills.includes(v) || skills.length >= 20) { setSkillInput(''); return; }
    setSkills([...skills, v]);
    setSkillInput('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const next: typeof fieldErrors = {};
    if (!title.trim()) next.title = 'Give the project a title.';
    if (!description.trim()) next.description = 'Describe what needs to be done.';
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      setError('Fill in the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title, description, category, skills,
          budgetType,
          budgetMin: budgetType === 'negotiable' ? 0 : Number(budgetMin || 0),
          budgetMax: budgetType === 'negotiable' ? undefined : (budgetMax ? Number(budgetMax) : undefined),
          currency,
          location: location.trim() || undefined,
          workMode,
          projectType,
          deadline: deadline || undefined,
          isActive: true,
        }),
      });

      if (res.status === 401) { router.push('/login?next=/projects/create'); return; }
      const data = (await res.json()) as { project?: { id: string }; error?: string };
      if (!res.ok || !data.project) { setError(data.error || 'Could not publish the project.'); return; }
      router.push(`/projects/${data.project.id}`);
    } catch {
      setError('Could not publish the project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DiscoverShell softwareName="Docrud" viewer={null} bare>
      <div className="wz">
        <div className="wz-in wz-solo">
          <div className="wz-main">
            <div className="wz-head">
              <div className="wz-head-t">
                <p className="wz-kick">
                  Post opportunity
                  <span className="wz-kick-k">Project</span>
                </p>
                <h1 className="wz-h1">Describe the project</h1>
                <p className="wz-cap">
                  One form. What needs doing, what it is worth, and when you need it by.
                </p>
              </div>
              {/* Quiet, not primary. `wz-ai-open` is the composer's dark AI
                  button; borrowing it made "Browse projects" the loudest thing
                  on a page whose only real action is Publish. */}
              <Link href="/projects" className="wz-back">
                <ArrowLeft size={14} aria-hidden /> Browse projects
              </Link>
            </div>

            <form onSubmit={submit} noValidate>
              <GlassPanel className="wz-card">
                <Field
                  id="p-title"
                  label="Project title"
                  required
                  error={fieldErrors.title}
                  hint="What a freelancer would search for — “Build a booking website for my salon”."
                >
                  <input
                    {...fieldProps('p-title', fieldErrors.title, 'hint')}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Build a booking website for my salon"
                    className={INPUT_CLASS}
                  />
                </Field>

                <Field
                  id="p-desc"
                  label="Description"
                  required
                  error={fieldErrors.description}
                  hint="What needs to be done, what you already have, and what a good outcome looks like."
                >
                  <textarea
                    {...fieldProps('p-desc', fieldErrors.description, 'hint')}
                    rows={7}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What needs to be done, what you already have, and what a good outcome looks like…"
                    className={`${TEXTAREA_CLASS} resize-y`}
                  />
                </Field>

                <SelectField
                  id="p-cat"
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  options={CATEGORY_KEYS.map((k) => ({
                    value: k,
                    label: `${PROJECT_CATEGORIES[k].icon} ${PROJECT_CATEGORIES[k].label}`,
                  }))}
                />
              </GlassPanel>

              <GlassPanel className="wz-card">
                <Field
                  id="p-skill"
                  label="Skills required"
                  hint="Type a skill and press Enter. These are what the project is matched on."
                >
                  <div className="wz-add">
                    <input
                      {...fieldProps('p-skill', undefined, 'hint')}
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                      placeholder="React, copywriting, CAD…"
                      className={INPUT_CLASS}
                    />
                    <button type="button" onClick={addSkill} className="wz-btn" aria-label="Add skill">
                      <Plus size={15} aria-hidden />
                    </button>
                  </div>
                </Field>

                {skills.length > 0 && (
                  <div className="wz-tags">
                    {skills.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="wz-tag"
                        onClick={() => setSkills(skills.filter((x) => x !== s))}
                        aria-label={`Remove ${s}`}
                      >
                        {s}
                        <X size={11} aria-hidden />
                      </button>
                    ))}
                  </div>
                )}
              </GlassPanel>

              <GlassPanel className="wz-card">
                <ChipGroup
                  id="p-budget-type"
                  label="Budget"
                  value={budgetType}
                  onChange={setBudgetType}
                  options={chips(BUDGET_TYPES, BUDGET_TYPE_LABELS)}
                />

                {budgetType === 'negotiable' ? (
                  <p className={`wz-hint ${MUTED}`}>
                    No figure is stored for a negotiable budget, and the project is excluded from
                    budget-range filters.
                  </p>
                ) : (
                  <div className="wz-grid3">
                    <SelectField
                      id="p-cur"
                      label="Currency"
                      value={currency}
                      onChange={setCurrency}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    />
                    <Field id="p-bmin" label={budgetType === 'hourly' ? 'Rate' : 'Amount'}>
                      <input
                        {...fieldProps('p-bmin')}
                        value={budgetMin}
                        inputMode="numeric"
                        onChange={(e) => setBudgetMin(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="0"
                        className={INPUT_CLASS}
                      />
                    </Field>
                    <Field id="p-bmax" label="Up to">
                      <input
                        {...fieldProps('p-bmax')}
                        value={budgetMax}
                        inputMode="numeric"
                        onChange={(e) => setBudgetMax(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="—"
                        className={INPUT_CLASS}
                      />
                    </Field>
                  </div>
                )}
              </GlassPanel>

              <GlassPanel className="wz-card">
                <Field id="p-loc" label="Location" hint="A city or area, if the work is tied to one.">
                  <input
                    {...fieldProps('p-loc', undefined, 'hint')}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City or area"
                    className={INPUT_CLASS}
                  />
                </Field>

                <ChipGroup
                  id="p-mode"
                  label="Remote or on-site"
                  value={workMode}
                  onChange={setWorkMode}
                  options={chips(WORK_MODES, WORK_MODE_LABELS)}
                />

                <ChipGroup
                  id="p-type"
                  label="Project type"
                  value={projectType}
                  onChange={setProjectType}
                  options={chips(PROJECT_TYPES, PROJECT_TYPE_LABELS)}
                />

                <Field id="p-deadline" label="Deadline" hint="Leave empty if there is no fixed date.">
                  <input
                    {...fieldProps('p-deadline', undefined, 'hint')}
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </Field>
              </GlassPanel>

              {error && (
                <p role="alert" className="wz-err">
                  <AlertCircle size={14} aria-hidden />
                  <span>{error}</span>
                </p>
              )}

              {/* One step, so one button and no progress rail. `wz-go` is the
                  composer's own primary, so the two forms end the same way. */}
              <div className="wz-solo-foot">
                <button type="submit" className={BTN_PRIMARY} disabled={saving}>
                  {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
                  {saving ? 'Publishing…' : 'Publish project'}
                </button>
                <p className={`wz-foot-n ${MUTED}`}>Nothing is posted until you press this.</p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </DiscoverShell>
  );
}
