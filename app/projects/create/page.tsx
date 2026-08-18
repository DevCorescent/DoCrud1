'use client';

/**
 * Post a project — one form, one submit.
 *
 * Deliberately single-step: the brief asks for a straightforward form, not a
 * wizard. It posts once to /api/projects and sends the poster straight to the
 * published project. Visual language matches the Services/Projects pages.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { PROJECT_CATEGORIES, BUDGET_TYPE_LABELS, PROJECT_TYPE_LABELS, WORK_MODE_LABELS } from '@/lib/projects-ui';

const LABEL = 'block text-[11px] font-bold uppercase tracking-[0.14em] text-white/32 mb-2';
const FIELD = 'w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] text-white px-3.5 text-[13.5px] placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors';
const INPUT = `${FIELD} h-11`;
const SECTION = 'rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5';
const CATEGORY_KEYS = Object.keys(PROJECT_CATEGORIES);
const PROJECT_TYPES = ['one_time', 'ongoing', 'contract', 'collaboration'] as const;
const BUDGET_TYPES = ['fixed', 'hourly', 'negotiable'] as const;
const WORK_MODES = ['remote', 'onsite', 'hybrid'] as const;

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

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v || skills.includes(v) || skills.length >= 20) { setSkillInput(''); return; }
    setSkills([...skills, v]);
    setSkillInput('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) { setError('Give the project a title.'); return; }
    if (!description.trim()) { setError('Describe what needs to be done.'); return; }

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
    <div className="min-h-screen bg-[#0A0A0C] text-white">
      <header className="sticky top-0 z-30 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3 max-w-3xl mx-auto">
          <button type="button" onClick={() => router.back()} aria-label="Go back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-[15px] font-bold tracking-[-0.01em]">Post a project</h1>
          <Link href="/projects" className="ml-auto text-[12.5px] font-semibold text-white/40 hover:text-white/75 transition-colors">
            Browse projects
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-28">
        <form onSubmit={submit} className="space-y-4">

          <div className={SECTION}>
            <label className={LABEL} htmlFor="p-title">Project title</label>
            <input id="p-title" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="e.g. Build a booking website for my salon" className={INPUT} />

            <label className={`${LABEL} mt-5`} htmlFor="p-desc">Description</label>
            <textarea id="p-desc" value={description} onChange={e => setDescription(e.target.value)} required rows={6}
              placeholder="What needs to be done, what you already have, and what a good outcome looks like."
              className={`${FIELD} py-3 resize-y leading-relaxed`} />

            <label className={`${LABEL} mt-5`} htmlFor="p-cat">Category</label>
            <select id="p-cat" value={category} onChange={e => setCategory(e.target.value)} className={INPUT}>
              {CATEGORY_KEYS.map(k => (
                <option key={k} value={k} className="bg-[#0d0d10]">
                  {PROJECT_CATEGORIES[k].icon} {PROJECT_CATEGORIES[k].label}
                </option>
              ))}
            </select>
          </div>

          <div className={SECTION}>
            <label className={LABEL} htmlFor="p-skill">Skills required</label>
            <div className="flex gap-2">
              <input id="p-skill" value={skillInput} onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                placeholder="Type a skill and press Enter" className={INPUT} />
              <button type="button" onClick={addSkill} aria-label="Add skill"
                className="h-11 shrink-0 rounded-[12px] border border-white/[0.10] bg-white/[0.06] px-4 text-white/70 hover:bg-white/[0.10] hover:text-white transition-all">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skills.map(s => (
                  <button key={s} type="button" onClick={() => setSkills(skills.filter(x => x !== s))}
                    aria-label={`Remove skill ${s}`}
                    className="inline-flex items-center gap-1 h-[28px] px-3 rounded-full text-[11.5px] font-medium bg-white/[0.08] border border-white/[0.14] text-white/80 hover:bg-white/[0.13] transition-colors">
                    {s} <X className="h-2.5 w-2.5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={SECTION}>
            <label className={LABEL}>Budget</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {BUDGET_TYPES.map(v => (
                <button key={v} type="button" onClick={() => setBudgetType(v)} aria-pressed={budgetType === v}
                  className={`h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-colors ${
                    budgetType === v ? 'bg-white text-[#0D0D0F]' : 'border border-white/[0.08] text-white/40 hover:text-white/70'
                  }`}>
                  {BUDGET_TYPE_LABELS[v]}
                </button>
              ))}
            </div>
            {budgetType === 'negotiable' ? (
              <p className="text-[12px] text-white/28 leading-relaxed">
                No figure is stored for a negotiable budget, and the project is excluded from budget-range filters.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10.5px] text-white/28 mb-1 block" htmlFor="p-cur">Currency</label>
                  <select id="p-cur" value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
                    {['INR', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c} className="bg-[#0d0d10]">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10.5px] text-white/28 mb-1 block" htmlFor="p-bmin">
                    {budgetType === 'hourly' ? 'Rate' : 'Amount'}
                  </label>
                  <input id="p-bmin" value={budgetMin} inputMode="numeric"
                    onChange={e => setBudgetMin(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className={INPUT} />
                </div>
                <div>
                  <label className="text-[10.5px] text-white/28 mb-1 block" htmlFor="p-bmax">Up to (optional)</label>
                  <input id="p-bmax" value={budgetMax} inputMode="numeric"
                    onChange={e => setBudgetMax(e.target.value.replace(/[^\d]/g, ''))} placeholder="—" className={INPUT} />
                </div>
              </div>
            )}
          </div>

          <div className={SECTION}>
            <label className={LABEL} htmlFor="p-loc">Location</label>
            <input id="p-loc" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="City or area (optional)" className={INPUT} />

            <p className={`${LABEL} mt-5`}>Remote / on-site</p>
            <div className="flex flex-wrap gap-1.5">
              {WORK_MODES.map(v => (
                <button key={v} type="button" onClick={() => setWorkMode(v)} aria-pressed={workMode === v}
                  className={`h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-colors ${
                    workMode === v ? 'bg-white text-[#0D0D0F]' : 'border border-white/[0.08] text-white/40 hover:text-white/70'
                  }`}>
                  {WORK_MODE_LABELS[v]}
                </button>
              ))}
            </div>

            <p className={`${LABEL} mt-5`}>Project type</p>
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_TYPES.map(v => (
                <button key={v} type="button" onClick={() => setProjectType(v)} aria-pressed={projectType === v}
                  className={`h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-colors ${
                    projectType === v ? 'bg-white text-[#0D0D0F]' : 'border border-white/[0.08] text-white/40 hover:text-white/70'
                  }`}>
                  {PROJECT_TYPE_LABELS[v]}
                </button>
              ))}
            </div>

            <label className={`${LABEL} mt-5`} htmlFor="p-deadline">Deadline</label>
            <input id="p-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className={`${INPUT} [color-scheme:dark]`} />
          </div>

          {error && (
            <p role="alert" className="rounded-[12px] border border-rose-500/25 bg-rose-500/[0.08] px-4 py-3 text-[12.5px] font-semibold text-rose-200/90">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-bold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', boxShadow: '0 6px 24px rgba(139,92,246,0.28)' }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Publishing…' : 'Publish Project'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
