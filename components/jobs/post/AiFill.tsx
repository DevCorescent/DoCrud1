'use client';

/**
 * AI Fill.
 *
 * ═══ IT PROPOSES; THE EMPLOYER DECIDES ═══
 *
 * Nothing this returns reaches the draft on its own. The suggestions arrive as
 * a checklist, every field is shown in full before it is accepted, the employer
 * unticks what they do not want, and only "Apply" writes anything. It never
 * advances a step and it never publishes.
 *
 * ═══ WHAT IT WILL NOT TOUCH ═══
 *
 * Compensation, the screening threshold and required documents. The route does
 * not return them and this does not ask for them — a salary is a commercial
 * commitment and the screening rules decide who gets filtered out of a hiring
 * process. Those stay the employer's to type.
 *
 * ═══ WHEN THERE IS NO AI ═══
 *
 * The deployment may have no key configured. That is a state, not a failure:
 * the panel says so plainly and the rest of the form is unaffected.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, X, AlertCircle } from 'lucide-react';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS,
} from '@/lib/jobs-ui';
import type { JobDraft } from '@/lib/jobs/post-wizard';

/* The stored value is an enum; a person reads the label. Showing `full_time`
   in a review list asks the poster to accept something they have to decode. */
const LABELS: Partial<Record<keyof JobDraft, Record<string, string>>> = {
  employmentType: EMPLOYMENT_TYPE_LABELS,
  workMode: WORK_MODE_LABELS,
  experienceLevel: EXPERIENCE_LABELS,
};
const shown = (key: keyof JobDraft, value: string) => LABELS[key]?.[value] ?? value;

/** The keys this can fill, in the order a poster reads them. */
const FIELDS: Array<{ key: keyof JobDraft; label: string }> = [
  { key: 'title', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'employmentType', label: 'Employment type' },
  { key: 'workMode', label: 'Work mode' },
  { key: 'experienceLevel', label: 'Experience level' },
  { key: 'location', label: 'Location' },
  { key: 'description', label: 'About the role' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'preferredSkills', label: 'Preferred skills' },
];

type Suggestions = Partial<Record<keyof JobDraft, string>>;

export function AiFill({
  draft, onApply, onClose,
}: {
  draft: JobDraft;
  onApply: (patch: Partial<JobDraft>) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [out, setOut] = useState<Suggestions | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement | null>(null);

  const rows = useMemo(
    () => (out ? FIELDS.filter((f) => (out[f.key] ?? '').trim().length > 0) : []),
    [out],
  );

  const run = useCallback(async () => {
    const p = prompt.trim();
    if (p.length < 8 || busy) return;
    setBusy(true); setError(''); setOut(null);
    try {
      const res = await fetch('/api/hiring/jobs/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnavailable(res.status === 503);
        setError(typeof data?.error === 'string' ? data.error : 'The draft could not be generated.');
        return;
      }
      const d = (data?.draft ?? {}) as Suggestions;
      setOut(d);
      /* Everything the model returned starts ticked EXCEPT fields the employer
         has already filled — overwriting their own words without being asked
         is the one thing this must not do. */
      const next = new Set<string>();
      for (const f of FIELDS) {
        const v = (d[f.key] ?? '').trim();
        if (v && !String(draft[f.key] ?? '').trim()) next.add(f.key as string);
      }
      setChosen(next);
    } catch {
      setError('The draft could not be generated. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, [prompt, busy, draft]);

  const apply = () => {
    if (!out) return;
    const patch: Partial<JobDraft> = {};
    for (const f of FIELDS) {
      if (!chosen.has(f.key as string)) continue;
      const v = (out[f.key] ?? '').trim();
      if (v) (patch as Record<string, string>)[f.key as string] = v;
    }
    onApply(patch);
    onClose();
  };

  const overwriting = rows.filter(
    (f) => chosen.has(f.key as string) && String(draft[f.key] ?? '').trim().length > 0,
  ).length;

  return (
    <section className="wz-ai" aria-label="Draft with AI">
      <div className="wz-ai-h">
        <Sparkles size={16} aria-hidden />
        <h2 className="wz-ai-t">Draft this with AI</h2>
        <button type="button" className="wz-ai-x" onClick={onClose} aria-label="Close AI drafting">
          <X size={14} />
        </button>
      </div>

      <p className="wz-ai-s">
        Describe the role in a sentence. You will see every suggestion before anything
        is filled in, and you choose which ones to keep.
      </p>

      <div className="wz-ai-row">
        <input
          ref={inputRef}
          className="wz-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }}
          placeholder="Senior React developer in Bengaluru, hybrid, 5+ years"
          aria-label="Describe the role"
          disabled={busy}
        />
        {/* Its own name, not the trigger's: two different buttons sharing a
            class is how a test — and a reader — ends up pressing the wrong
            one. */}
        <button
          type="button" className="wz-ai-go" onClick={() => void run()}
          disabled={busy || prompt.trim().length < 8}
        >
          {busy
            ? <><Loader2 size={14} className="wz-spin" aria-hidden /> Drafting…</>
            : <><Sparkles size={14} aria-hidden /> Draft</>}
        </button>
      </div>

      {error && (
        <p className="wz-err" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>
            {error}
            {unavailable && ' You can still fill the form in yourself — nothing else is affected.'}
          </span>
        </p>
      )}

      {out && rows.length === 0 && !error && (
        <p className="wz-ai-note" role="status">
          Nothing came back that this form has a field for. Try naming the role and where it is.
        </p>
      )}

      {rows.length > 0 && (
        <div className="wz-ai-out">
          <p className="wz-ai-out-t">{rows.length} suggestion{rows.length === 1 ? '' : 's'} — tick what to keep</p>

          {rows.map((f) => {
            const on = chosen.has(f.key as string);
            const existing = String(draft[f.key] ?? '').trim();
            return (
              <label key={f.key as string} className="wz-ai-item" data-on={on ? '1' : '0'}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => setChosen((prev) => {
                    const n = new Set(prev);
                    if (n.has(f.key as string)) n.delete(f.key as string); else n.add(f.key as string);
                    return n;
                  })}
                />
                <span className="wz-ai-box" aria-hidden><Check size={11} strokeWidth={3} /></span>
                <span className="wz-ai-b">
                  <span className="wz-ai-k">
                    {f.label}
                    {/* "the current value", not "what you wrote": several of
                        these fields start with a default the poster never
                        typed, and telling them they wrote it is wrong. */}
                    {existing && <span className="wz-ai-over"> · replaces the current value</span>}
                  </span>
                  <span className="wz-ai-v">{shown(f.key, out?.[f.key] ?? '')}</span>
                </span>
              </label>
            );
          })}

          <div className="wz-ai-foot">
            <button
              type="button" className="wz-btn"
              onClick={() => setChosen(new Set())}
              disabled={chosen.size === 0}
            >
              Untick all
            </button>
            <button type="button" className="wz-go" onClick={apply} disabled={chosen.size === 0}>
              Fill {chosen.size} field{chosen.size === 1 ? '' : 's'}
            </button>
          </div>

          {overwriting > 0 && (
            <p className="wz-ai-note">
              {overwriting} of these will replace a value already on the form.
            </p>
          )}

          <p className="wz-ai-note">
            Pay, screening score and required documents are never drafted — those stay yours to set.
            Read everything before you publish; it is your job post.
          </p>
        </div>
      )}
    </section>
  );
}
