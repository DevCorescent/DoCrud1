'use client';

/**
 * Two controls the basics step needs that the design system does not have.
 *
 * Both are built on real data. The location list is the SAME city canon the
 * scraper matches against (lib/server/job-scraper/india.ts), so a location a
 * poster picks is one the marketplace's India filters already understand.
 * There is no geocoding service in this project and none is faked: the field
 * stays free text, and the suggestions are an aid, not a whitelist.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Globe, MapPin, X } from 'lucide-react';
import { indiaCitySuggestions } from '@/lib/server/job-scraper/india';
import { Field, INPUT_CLASS, INVALID_CLASS, FAINT, MUTED, GLASS } from './ui';

/* ── Location ─────────────────────────────────────────────────────────────*/

/**
 * A combobox over the known cities, which still accepts anything typed.
 *
 * Implemented against the ARIA combobox pattern rather than a <datalist>:
 * datalist cannot be styled, renders inconsistently across browsers, and is
 * effectively unusable on several mobile ones. The listbox is positioned
 * relative to the field and capped in height, so it cannot run off-screen.
 */
export function LocationAutocomplete({
  id, value, error, hint, required, onChange,
}: {
  id: string;
  value: string;
  error?: string;
  hint?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-listbox`;

  const suggestions = useMemo(() => {
    const list = indiaCitySuggestions(value);
    /* An exact match means the poster is done choosing — continuing to offer
       the one thing already in the box is noise. */
    return list.length === 1 && list[0].toLowerCase() === value.trim().toLowerCase() ? [] : list;
  }, [value]);

  /* Clicking anywhere else closes the list. Pointerdown, not click, so the
     list is gone before a click lands on whatever is underneath. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (city: string) => {
    onChange(city);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && open && active >= 0) {
      /* Only swallow Enter when a suggestion is actually highlighted, so
         Enter otherwise still advances the wizard. */
      e.preventDefault();
      choose(suggestions[active]);
    }
  };

  return (
    <Field id={id} label="What is the job location?" hint={hint} error={error} required={required}>
      <div ref={wrapRef} className="relative">
        <MapPin
          className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${FAINT}`}
          aria-hidden
        />
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          value={value}
          placeholder="Enter a city or location"
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`${INPUT_CLASS} pl-10 ${error ? INVALID_CLASS : ''}`}
        />
        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Location suggestions"
            className={`${GLASS} absolute left-0 right-0 top-full z-30 mt-1.5 max-h-56 overflow-y-auto p-1`}
          >
            {suggestions.map((city, i) => (
              <li key={city} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  /* Mousedown, not click: the input's blur would otherwise
                     close the list before the click could register. */
                  onMouseDown={(e) => { e.preventDefault(); choose(city); }}
                  onMouseEnter={() => setActive(i)}
                  className={[
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px]',
                    i === active
                      ? 'bg-slate-900/[0.06] text-slate-900 dark:bg-white/[0.09] dark:text-white'
                      : 'text-slate-700 dark:text-white/70',
                  ].join(' ')}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                  {city}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

/* ── Language and country ─────────────────────────────────────────────────*/

const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Gujarati'];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Singapore', 'United Arab Emirates', 'Germany'];

/**
 * The "posted in English in India" line, and its editor.
 *
 * HONEST SCOPE. No field on HiringJobPosting stores a language or a country,
 * so this choice is NOT sent to the server and is not claimed to be saved —
 * the line says where the post is written for, and it persists in the local
 * draft only. It is here because the reference flow leads with it and it sets
 * the poster's expectation for the whole form; wiring it to a column that does
 * not exist would be the fake functionality this project forbids.
 */
export function LanguageCountryBar({
  language, country, onChange,
}: {
  language: string;
  country: string;
  onChange: (next: { language: string; country: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ language, country });
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) setDraft({ language, country }); }, [open, language, country]);

  /* Escape closes, and focus returns to the control that opened it. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key !== 'Tab') return;
      /* Focus trap: Tab off either end wraps inside the dialog. */
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open]);

  return (
    <>
      <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] ${MUTED}`}>
        <Globe className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        <span>The job post will be in</span>
        <span className="font-semibold text-slate-800 dark:text-white/80">{language}</span>
        <span>in</span>
        <span className="font-semibold text-slate-800 dark:text-white/80">{country}</span>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          /* `min-h-[32px]` is not decoration: measured at every width, this
             button rendered 22px tall, well under a comfortable touch target,
             and it is the only control on the first step besides the fields. */
          className="inline-flex min-h-[32px] items-center rounded-md px-2 text-[13px] font-bold text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
        >
          Change<span className="sr-only"> the language and country of this job post</span>
        </button>
      </p>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          {/* Bottom sheet on phones, centred dialog from `sm`. Height is capped
              so it can never exceed the viewport; the list scrolls inside. */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`${GLASS} max-h-[85dvh] w-full overflow-hidden rounded-b-none sm:max-w-md sm:rounded-2xl`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-white/[0.07]">
              <h2 id={titleId} className="text-[15px] font-bold text-slate-900 dark:text-white">
                Language and country
              </h2>
              <button
                type="button"
                onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-white/50 dark:hover:bg-white/[0.07]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="max-h-[calc(85dvh-9.5rem)] overflow-y-auto px-5 py-4">
              <p className={`text-[12.5px] ${FAINT}`}>
                This describes how the post is written. It is kept with your draft and is not part
                of the saved job record.
              </p>
              {([
                ['Language', LANGUAGES, draft.language, (v: string) => setDraft((d) => ({ ...d, language: v }))],
                ['Country', COUNTRIES, draft.country, (v: string) => setDraft((d) => ({ ...d, country: v }))],
              ] as const).map(([label, options, selected, set]) => (
                <fieldset key={label} className="mt-4">
                  <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-white/40">
                    {label}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected === option}
                        onClick={() => set(option)}
                        className={[
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                          selected === option
                            ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-400 dark:bg-sky-500 dark:text-[#0b1220]'
                            : 'border-slate-300 bg-white/60 text-slate-700 hover:bg-white dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08]',
                        ].join(' ')}
                      >
                        {selected === option && <Check className="h-3.5 w-3.5" aria-hidden />}
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200/80 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
                className="h-10 rounded-xl border border-slate-300 px-4 text-[13.5px] font-semibold text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.10] dark:text-white/70 dark:hover:bg-white/[0.07]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { onChange(draft); setOpen(false); triggerRef.current?.focus(); }}
                className="h-10 rounded-xl bg-slate-900 px-4 text-[13.5px] font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-white dark:text-[#0b1220] dark:hover:bg-white/90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
