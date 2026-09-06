/**
 * How soon a role is being filled, and what that looks like.
 *
 * ═══ WHY IT IS A SMALL CLOSED SET ═══
 *
 * Three values, chosen because they are the three answers an employer can give
 * honestly without being asked to guess a date: they are hiring now, they are
 * hiring within the month, or the role is open on a rolling basis. A free-text
 * field would produce "ASAP!!", and a date would be invented by most posters.
 *
 * ═══ ABSENT IS NOT A VALUE ═══
 *
 * Urgency is optional and always has been — hundreds of postings predate the
 * field, and every importer produces jobs without it. A card with no urgency
 * gets NO tint, not the calmest one: colouring by a value nobody supplied
 * states something the employer did not.
 *
 * ═══ WHY THE COLOURS ARE THIS QUIET ═══
 *
 * These are the card's whole surface, not a badge on it, and they sit in a feed
 * beside photographs. A saturated fill would make a job posting the loudest
 * thing on the page regardless of what else is there, and "urgent" would read
 * as an alarm rather than as information. So: a wash at around a tenth of an
 * alpha, a hairline a little stronger, and text bright enough to read against
 * it. The difference between the three is hue, never intensity — none of them
 * shouts louder than the others.
 */

export const JOB_URGENCIES = ['immediate', 'soon', 'ongoing'] as const;

export type JobUrgency = (typeof JOB_URGENCIES)[number];

export type JobUrgencyOption = {
  value: JobUrgency;
  /** On a card. Short, because it sits beside the employment type. */
  label: string;
  /** In the composer, where the poster is choosing and needs the full sense. */
  composerLabel: string;
  /** What the poster is actually committing to. */
  hint: string;
};

export const JOB_URGENCY_OPTIONS: readonly JobUrgencyOption[] = [
  {
    value: 'immediate',
    label: 'Hiring now',
    composerLabel: 'Hiring immediately',
    hint: 'Interviewing this week and ready to make an offer.',
  },
  {
    value: 'soon',
    label: 'Hiring this month',
    composerLabel: 'Hiring within a month',
    hint: 'Actively filling, with a start date inside the next few weeks.',
  },
  {
    value: 'ongoing',
    label: 'Rolling',
    composerLabel: 'Open on a rolling basis',
    hint: 'Always open to strong applicants; no fixed deadline.',
  },
] as const;

/** Narrows unknown input — a stored value, a request body — to a real urgency. */
export function coerceJobUrgency(value: unknown): JobUrgency | undefined {
  return typeof value === 'string' && (JOB_URGENCIES as readonly string[]).includes(value)
    ? (value as JobUrgency)
    : undefined;
}

export function jobUrgencyLabel(value: unknown): string | undefined {
  const urgency = coerceJobUrgency(value);
  return urgency && JOB_URGENCY_OPTIONS.find((o) => o.value === urgency)?.label;
}

/** The card's surface, hairline and label colour for one urgency. */
export type JobUrgencyTint = {
  background: string;
  borderColor: string;
  /** For the small urgency chip, which needs to be readable on the wash. */
  chipBackground: string;
  chipBorderColor: string;
  chipColor: string;
};

const TINTS: Record<JobUrgency, JobUrgencyTint> = {
  /* Warm rose. The most immediate, so the warmest hue — but the same weight
     as the others, because urgency is not importance. */
  immediate: {
    background: 'linear-gradient(180deg, rgba(246,170,170,0.10) 0%, rgba(246,170,170,0.035) 100%)',
    borderColor: 'rgba(246,170,170,0.26)',
    chipBackground: 'rgba(246,170,170,0.13)',
    chipBorderColor: 'rgba(246,170,170,0.30)',
    chipColor: 'rgba(252,214,214,0.95)',
  },
  /* Sand. */
  soon: {
    background: 'linear-gradient(180deg, rgba(240,206,150,0.10) 0%, rgba(240,206,150,0.035) 100%)',
    borderColor: 'rgba(240,206,150,0.26)',
    chipBackground: 'rgba(240,206,150,0.13)',
    chipBorderColor: 'rgba(240,206,150,0.30)',
    chipColor: 'rgba(250,231,196,0.95)',
  },
  /* Sage. */
  ongoing: {
    background: 'linear-gradient(180deg, rgba(163,208,182,0.095) 0%, rgba(163,208,182,0.03) 100%)',
    borderColor: 'rgba(163,208,182,0.24)',
    chipBackground: 'rgba(163,208,182,0.12)',
    chipBorderColor: 'rgba(163,208,182,0.28)',
    chipColor: 'rgba(205,235,217,0.95)',
  },
};

/** The tint for a stored value, or undefined when none was stated. */
export function jobUrgencyTint(value: unknown): JobUrgencyTint | undefined {
  const urgency = coerceJobUrgency(value);
  return urgency ? TINTS[urgency] : undefined;
}
