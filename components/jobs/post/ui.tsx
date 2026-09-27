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
import './wizard.css';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/* ── One place to restyle the whole wizard ──
   Every step imports these, so pointing them at the boards' stylesheet
   restyles all seven at once. They are plain class names now rather than
   Tailwind strings with a dark variant on every rule: the wizard renders
   inside DiscoverShell, which is a light surface, and carrying a second theme
   through every control was most of what made this file hard to read. */
export const GLASS = 'wz-panel';
export const MUTED = 'wz-muted';
export const FAINT = 'wz-faint';

export const INPUT_CLASS = 'wz-input';
export const TEXTAREA_CLASS = 'wz-area';
/* Kept as a hook for callers; the real invalid styling hangs off
   `aria-invalid`, which the control already sets and a screen reader already
   reads — one source of truth instead of a class and an attribute that can
   disagree. */
export const INVALID_CLASS = '';

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
    <div className="wz-f">
      <label htmlFor={id} className="wz-lab">
        {label}
        {/* The word, not a bare asterisk: a lone * is a convention a first-time
            poster has to infer, and a screen reader announces it as "star". */}
        {required
          ? <span className="wz-req">Required</span>
          : <span className="wz-opt">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="wz-ferr">
          <AlertCircle size={13} aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="wz-hint">{hint}</p>
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
          className="wz-input wz-select"
        >
          <SelectValue placeholder={placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent className="ui-select-content max-h-[min(320px,60vh)]">
          {options.map((option) => (
            <SelectItem key={option.value} value={encode(option.value)} className="ui-select-item">
              <span className="font-medium">{option.label}</span>
              {option.description && (
                <span className="wz-opt-desc">{option.description}</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * A row of mutually exclusive chips.
 *
 * Lives here rather than in the page that needed it because the project
 * composer and this wizard are the same form language now, and a chip group
 * defined twice is a chip group that will look different in two places. It is a
 * radio group in behaviour and says so: `role="radiogroup"` with
 * `aria-checked`, so a screen reader hears "2 of 3 selected" rather than three
 * unrelated buttons.
 */
export function ChipGroup({
  id, label, hint, value, onChange, options, required,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <div className="wz-f">
      <span className="wz-lab" id={`${id}-label`}>
        {label}
        {required
          ? <span className="wz-req">Required</span>
          : <span className="wz-opt">Optional</span>}
      </span>
      <div className="wz-chips" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className="wz-chip"
            data-on={value === o.value ? '1' : '0'}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint ? <p className="wz-hint">{hint}</p> : null}
    </div>
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
    <aside className="wz-help" aria-label="Tips">
      <p className="wz-help-t">{title}</p>
      <div>{children}</div>
    </aside>
  );
}
