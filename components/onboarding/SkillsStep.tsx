'use client';

/**
 * Skills — the fifth onboarding step, shared by both branches.
 *
 * ═══ CHECKBOXES, NOT BUTTONS ═══
 *
 * Several skills can be chosen at once, which is what a checkbox group means,
 * so each pill is a real <input type="checkbox"> inside its label. Space
 * toggles natively, the selected state is exposed properly, and the limit is
 * enforced by `disabled` rather than by a click handler that silently declines.
 *
 * ═══ THE LIMIT ═══
 *
 * MAX_SKILLS is a product rule. At the limit the unchosen pills go disabled and
 * dimmed — the state is visible rather than a click that does nothing — while
 * every chosen pill stays enabled so a swap is always one click away. The cap
 * is checked twice: `disabled` on the input, and again in the handler, so it
 * holds even if a caller renders the pills some other way.
 *
 * ═══ THE LIST OPENS SHORT ═══
 *
 * The taxonomy runs to seventy-odd entries, which is a wall of chips that
 * pushes the buttons off a laptop screen. Only the first VISIBLE_COUNT are
 * offered, with the rest behind one control. Three rules keep that from hiding
 * anything:
 *
 *   · CHOSEN SKILLS ALWAYS SHOW, in their own row above the rest, however far
 *     down the taxonomy they sit. A résumé that suggested "Kubernetes" cannot
 *     leave it invisible at position 48.
 *   · A search shows every match, collapsed or not.
 *   · The list wraps; it never scrolls inside itself. Trading page scroll for
 *     an inner scrollbar is not a fix.
 *
 * ═══ SKILLS OF YOUR OWN ═══
 *
 * The search box adds anything the taxonomy does not carry. A typed skill that
 * IS canonical resolves to the canonical spelling rather than becoming a
 * near-duplicate; anything else is kept verbatim. Both count against the same
 * ten.
 *
 * ═══ NOTHING IS RECOMMENDED HERE ═══
 *
 * `SkillOption.recommended` renders if an authoritative source sets it. This
 * component never computes it, and never derives it from an ATS score, a match
 * score or a résumé.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { MAX_SKILLS, type SkillOption } from '@/lib/onboarding-skills';
import { OnboardingProgress, StepHeading } from './StepChrome';

/** How many unchosen skills are offered before "Show more". */
const VISIBLE_COUNT = 20;

export default function SkillsStep({
  options,
  value,
  onChange,
  maxSkills = MAX_SKILLS,
  step = 5,
  total = 6,
  eyebrow = 'Skill signal / 05',
  title = 'What are your skills?',
  description = `Select up to ${MAX_SKILLS} skills that best represent you.`,
}: {
  options: readonly SkillOption[];
  value: readonly string[];
  onChange: (skills: string[]) => void;
  maxSkills?: number;
  step?: number;
  total?: number;
  /* Overridable so the business branch supplies its own copy without this
     component learning what a persona is. */
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  /* View-only state. The chosen skills live in the flow, never here. */
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

  const selected = new Set(value);
  const atLimit = selected.size >= maxSkills;
  const query = draft.trim();
  const lowered = query.toLowerCase();

  const byId = useMemo(() => new Map(options.map(o => [o.id, o])), [options]);

  /* Chosen skills, in the order they were chosen. A custom one has no entry in
     the taxonomy, so it stands in for itself. */
  const chosen = value.map(id => byId.get(id) ?? { id, label: id });

  /* The unchosen remainder, filtered by the search and then capped. */
  const rest = options.filter(o => !selected.has(o.id)
    && (!query || o.label.toLowerCase().includes(lowered)));
  const collapsed = !expanded && !query && rest.length > VISIBLE_COUNT;
  const visibleRest = collapsed ? rest.slice(0, VISIBLE_COUNT) : rest;
  const hiddenCount = rest.length - visibleRest.length;

  /* Offer to add the typed text only when nothing already covers it. The
     canonical spelling wins, so "figma" cannot become a second Figma. */
  const canonicalMatch = options.find(o => o.label.toLowerCase() === lowered);
  const alreadyChosen = canonicalMatch
    ? selected.has(canonicalMatch.id)
    : value.some(v => v.toLowerCase() === lowered);
  const canAdd = query.length > 0 && !alreadyChosen && !atLimit;

  const toggle = (id: string) => {
    if (selected.has(id)) { onChange(value.filter(item => item !== id)); return; }
    /* Re-checked here as well as via `disabled`, so the cap holds regardless. */
    if (selected.size >= maxSkills) return;
    onChange([...value, id]);
  };

  const addTyped = () => {
    if (!canAdd) return;
    onChange([...value, canonicalMatch ? canonicalMatch.id : query]);
    setDraft('');
  };

  const pill = (option: { id: string; label: string; recommended?: boolean }, isSelected: boolean) => (
    <label key={option.id}>
      <input
        type="checkbox"
        className="skill-pill-input"
        checked={isSelected}
        disabled={!isSelected && atLimit}
        onChange={() => toggle(option.id)}
      />
      <span className={`choice-chip${isSelected ? ' choice-chip-selected' : ''}`}>
        {isSelected && <Check aria-hidden="true" />}
        <span>{option.label}</span>
        {option.recommended && <span className="skill-count">Recommended</span>}
      </span>
    </label>
  );

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />
      <StepHeading eyebrow={eyebrow} title={title} description={description} />

      {/* The count lives inside the field, small and out of the way, rather
          than as a heading of its own. */}
      <label className="skills-search" htmlFor="onboarding-skill-search">
        <span className="onb-visually-hidden">Search or add a skill</span>
        <Search className="field-icon" aria-hidden="true" />
        <input
          id="onboarding-skill-search"
          className="glass-input skills-search-input"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && canAdd) { event.preventDefault(); addTyped(); }
          }}
          placeholder="Type a skill…"
          autoComplete="off"
        />
        <span className="skills-count-inline" aria-live="polite">
          {selected.size}/{maxSkills}
        </span>
      </label>

      {canAdd && (
        <button type="button" className="role-add-custom" onClick={addTyped}>
          <Plus aria-hidden="true" />
          <span>
            Add &ldquo;{canonicalMatch ? canonicalMatch.label : query}&rdquo;
          </span>
        </button>
      )}

      {/* Chosen first, always visible, whatever the search or the cap. */}
      {chosen.length > 0 && (
        <div className="skills-options skills-chosen" role="group" aria-label="Selected skills">
          {chosen.map(option => pill(option, true))}
        </div>
      )}

      <div className="skills-options" role="group" aria-label={title} id="onboarding-skill-options">
        {visibleRest.map(option => pill(option, false))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="role-show-more"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls="onboarding-skill-options"
        >
          <ChevronDown aria-hidden="true" />
          <span>Read more ({hiddenCount})</span>
        </button>
      )}

      {expanded && !query && (
        <button
          type="button"
          className="role-show-more"
          onClick={() => setExpanded(false)}
          aria-expanded
          aria-controls="onboarding-skill-options"
        >
          <ChevronDown aria-hidden="true" className="role-chevron-up" />
          <span>Show less</span>
        </button>
      )}

      {query && visibleRest.length === 0 && !canAdd && !alreadyChosen && (
        <p className="role-empty">No skill matches that.</p>
      )}

      {atLimit && (
        <p className="demo-note skills-note">
          That&apos;s {maxSkills} — remove one to choose a different skill.
        </p>
      )}
    </div>
  );
}
