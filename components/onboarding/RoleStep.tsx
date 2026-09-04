'use client';

/**
 * Role — "What role are you looking for?", the individual branch's fourth step.
 *
 * ═══ DYNAMIC, FROM REAL JOBS ═══
 *
 * The directions are Docrud's own job domains, ordered by how many active jobs
 * each one actually has, and each shows that real count. The counts come from
 * the public job feed (see lib/onboarding-roles.ts); nothing is estimated. A
 * direction with no live jobs still appears — it is a real career direction and
 * hiding it would tell someone their field does not exist here — but it sorts
 * last and shows no count rather than a fabricated zero.
 *
 * ═══ SEVERAL DIRECTIONS, PLUS YOUR OWN WORDS ═══
 *
 * People are open to more than one kind of role, so this is a checkbox group.
 * Anything the taxonomy does not cover can be typed in; a custom direction is
 * kept verbatim and is never silently mapped onto a domain it does not mean.
 *
 * ═══ A RESUME ONLY SUGGESTS ═══
 *
 * When the flow can pre-select from a resume it passes those ids in as the
 * initial value. From that moment they are ordinary selections: removable,
 * replaceable, and never re-applied behind the person's back. This component
 * cannot tell a resume-derived choice from a typed one, which is the point.
 */

import { Check, Search, X } from 'lucide-react';
import type { RoleOption } from '@/lib/onboarding-roles';
import { OnboardingProgress, StepHeading } from './StepChrome';

/** At least one direction — a chosen domain or a typed one. */
export function isRoleSelectionValid(roles: readonly string[], custom: readonly string[]): boolean {
  return roles.length + custom.length > 0;
}

export default function RoleStep({
  options,
  availability,
  value,
  onChange,
  customRoles,
  onCustomRolesChange,
  draft,
  onDraftChange,
  onContinue,
  step = 4,
  total = 6,
}: {
  options: readonly RoleOption[];
  /** Real active-job counts per direction id. Missing means "not known". */
  availability: Record<string, number>;
  value: readonly string[];
  onChange: (roles: string[]) => void;
  customRoles: readonly string[];
  onCustomRolesChange: (roles: string[]) => void;
  /** The text in the box, owned by the flow so Back does not lose a part-typed role. */
  draft: string;
  onDraftChange: (text: string) => void;
  onContinue: () => void;
  step?: number;
  total?: number;
}) {
  const chosen = new Set(value);
  const query = draft.trim();
  const lowered = query.toLowerCase();

  /* Typing filters the list. A direction already chosen stays visible so it can
     be unchosen without clearing the box first. */
  const visible = query
    ? options.filter(o => o.label.toLowerCase().includes(lowered) || chosen.has(o.id))
    : options;

  /* Offer to add the typed text only when it is not already a direction and
     not already added. */
  const matchesOption = options.some(o => o.label.toLowerCase() === lowered);
  const alreadyCustom = customRoles.some(r => r.toLowerCase() === lowered);
  const canAddCustom = query.length > 0 && !matchesOption && !alreadyCustom;

  const addCustom = () => {
    if (!canAddCustom) return;
    onCustomRolesChange([...customRoles, query]);
    onDraftChange('');
  };

  const toggle = (id: string) => {
    onChange(chosen.has(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />
      <StepHeading
        eyebrow="Direction / 04"
        title="What role are you looking for?"
        description="Pick as many as you are open to. The counts are roles open on Docrud right now."
      />

      <label className="role-field" htmlFor="onboarding-target-role">
        <span className="field-label">Search or add a role</span>
        <div className="role-field-control">
          <Search className="field-icon" aria-hidden="true" />
          <input
            id="onboarding-target-role"
            className="glass-input"
            value={draft}
            onChange={event => onDraftChange(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (canAddCustom) addCustom();
              else if (isRoleSelectionValid(value, customRoles)) onContinue();
            }}
            placeholder="e.g. Product Engineer"
            autoComplete="off"
          />
        </div>
      </label>

      {canAddCustom && (
        <button type="button" className="role-add-custom" onClick={addCustom}>
          Add &ldquo;{query}&rdquo; as your own role
        </button>
      )}

      {/* Roles typed by the person. Kept apart from the taxonomy so nothing
          pretends a custom role is a known domain with known availability. */}
      {customRoles.length > 0 && (
        <ul className="role-custom-list">
          {customRoles.map(role => (
            <li key={role}>
              <span className="choice-chip choice-chip-selected">
                <span>{role}</span>
                <button
                  type="button"
                  className="role-chip-remove"
                  aria-label={`Remove ${role}`}
                  onClick={() => onCustomRolesChange(customRoles.filter(r => r !== role))}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="role-suggestions" role="group" aria-label="Roles you are looking for">
        {visible.map(option => {
          const selected = chosen.has(option.id);
          const count = availability[option.id];
          return (
            <label key={option.id}>
              <input
                type="checkbox"
                className="skill-pill-input"
                checked={selected}
                onChange={() => toggle(option.id)}
              />
              <span className={`choice-chip${selected ? ' choice-chip-selected' : ''}`}>
                {selected && <Check aria-hidden="true" />}
                <span>{option.label}</span>
                {/* Only ever the feed's own number, and only when we have one. */}
                {typeof count === 'number' && count > 0 && (
                  <span className="role-count">{count.toLocaleString('en-US')}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="role-empty">
          No direction matches that — add it as your own role above.
        </p>
      )}
    </div>
  );
}
