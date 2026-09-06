'use client';

/**
 * The wizard's shared surfaces and form controls.
 *
 * ONE definition per control, used by every step, so a field cannot drift
 * between pages. Each carries a light value and a dark one — the composer is
 * reached from both themes, and a control tuned only for the dark marketplace
 * left light-mode posters filling in an invisible form.
 *
 * GLASS, DELIBERATELY RESTRAINED. Translucent surface, one hairline border,
 * one soft shadow, backdrop blur. No glow, no coloured rim, no second layer of
 * glass inside a glass panel — a hiring form has to read as trustworthy, and
 * stacked transparency is what makes these designs look like a landing page.
 * Text sits on an opaque-enough ground to stay above 4.5:1 in both themes.
 */

import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/** The wizard's one glass surface. */
export const GLASS =
  'rounded-2xl border backdrop-blur-xl '
  + 'border-slate-200/80 bg-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)] '
  + 'dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]';

export const MUTED = 'text-slate-600 dark:text-white/45';
export const FAINT = 'text-slate-500 dark:text-white/30';

const CONTROL =
  'w-full rounded-xl border text-[14px] outline-none transition-colors '
  + 'border-slate-300 bg-white/80 text-slate-900 placeholder:text-slate-400 '
  + 'focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:border-sky-500 '
  + 'dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25 '
  + 'dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-400/50';

export const INPUT_CLASS = `h-11 px-3.5 ${CONTROL}`;
export const TEXTAREA_CLASS = `px-3.5 py-3 leading-6 ${CONTROL}`;
export const INVALID_CLASS =
  'border-rose-500 bg-rose-50/80 dark:border-rose-400/50 dark:bg-rose-500/[0.06]';

export function GlassPanel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`${GLASS} ${className}`}>{children}</div>;
}

/**
 * Label + control + hint/error.
 *
 * The error REPLACES the hint rather than stacking below it, so the field's
 * height does not jump when validation fires and push the Continue button out
 * from under the pointer.
 */
export function Field({
  id, label, hint, error, required, children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-slate-800 dark:text-white/70">
        {label}
        {/* The word, not a bare asterisk: a lone * is a convention a first-time
            poster has to infer, and a screen reader announces it as "star". */}
        {required && (
          <span className="ml-1.5 font-medium text-rose-700 dark:text-rose-300/85">
            <span aria-hidden>*</span><span className="sr-only"> required</span>
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12.5px] font-medium text-rose-600 dark:text-rose-300/90">
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={`mt-1.5 text-[12.5px] ${FAINT}`}>{hint}</p>
      ) : null}
    </div>
  );
}

/** The attributes every control needs to be announced correctly. */
export function fieldProps(id: string, error?: string, hint?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

/**
 * A labelled dropdown, on the project's existing Radix select.
 *
 * Radix rather than a native <select> or a hand-rolled listbox: it already
 * handles keyboard, touch, typeahead and focus return, it PORTALS its list so
 * a panel with `overflow-hidden` cannot clip it, and it flips above the field
 * when there is no room below. app/globals.css already dresses
 * `.ui-select-trigger` / `.ui-select-content` for dark mode, so it is themed
 * without a second styling system.
 */
export function SelectField({
  id, label, hint, error, required, value, onChange, options, placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; description?: string }>;
  placeholder?: string;
}) {
  /* ── "No answer" is a real option, and Radix will not carry it ──
     A Radix Select reserves the empty string to mean "clear the selection", so
     a <SelectItem value=""> throws on render and takes the whole step down with
     it. But an optional field genuinely needs a "Not specified" choice, and the
     draft genuinely stores '' for it.

     So the translation happens HERE, once, rather than at each call site: a
     caller passes and receives '' as it would expect, and the sentinel exists
     only for the length of the render. Fixing it in the shared control means
     the next optional Select cannot reintroduce the crash. */
  const EMPTY = '__unspecified__';
  const encode = (v: string) => (v === '' ? EMPTY : v);
  const decode = (v: string) => (v === EMPTY ? '' : v);

  return (
    <Field id={id} label={label} hint={hint} error={error} required={required}>
      <Select value={encode(value)} onValueChange={(v) => onChange(decode(v))}>
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`h-11 rounded-xl px-3.5 text-[14px] ${error ? INVALID_CLASS : ''}`}
        >
          <SelectValue placeholder={placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent className="ui-select-content max-h-[min(320px,60vh)]">
          {options.map((option) => (
            <SelectItem key={option.value} value={encode(option.value)} className="ui-select-item">
              <span className="font-medium">{option.label}</span>
              {option.description && (
                <span className={`ml-2 text-[12px] ${FAINT}`}>{option.description}</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * The contextual tip beside a step.
 *
 * Advice only — it never states anything about the poster's own data, so it
 * cannot be wrong about their job. Hidden below `lg`, where the form needs the
 * whole width and a tip would push Continue off the screen.
 */
export function HelpCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className={`${GLASS} hidden p-5 lg:block`} aria-label="Tips">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300/80">{title}</p>
      <div className={`mt-2.5 space-y-2 text-[13px] leading-relaxed ${MUTED}`}>{children}</div>
    </aside>
  );
}
