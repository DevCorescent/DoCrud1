/**
 * Recurring campaign schedules.
 *
 * Pure: given a recurrence and an instant, this says when the next occurrence
 * is. It sends nothing, stores nothing and knows nothing about campaigns - the
 * existing send path stays the only thing that mails anyone.
 *
 * Two rules decide almost every awkward case here, and both are chosen to be
 * PREDICTABLE rather than clever:
 *
 * 1. A DATE THAT DOES NOT EXIST IS SKIPPED, NEVER MOVED. "Monthly on the 31st"
 *    runs in January and March and skips February. "Yearly on 29 February"
 *    runs in leap years only. The alternative - quietly sliding to the 28th or
 *    the 1st - means an admin who scheduled month-end invoices discovers that
 *    February's went out on the 1st of March, and nothing in the UI ever said
 *    so. Skipping is visible in the "next run" date.
 *
 * 2. LOCAL WALL-CLOCK TIME IS PRESERVED ACROSS DST. "10:00 in New York" stays
 *    10:00 in New York when the offset changes; it does not drift to 09:00 or
 *    11:00. That is what a person means by "every Monday at ten".
 *
 * All conversion goes through `zonedTimeToUtc`, which already does the
 * two-pass offset resolution DST needs. Nothing here manipulates date strings.
 */
import { zonedTimeToUtc, isSupportedTimezone } from '@/lib/email/schedule-time';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface MailRecurrence {
  frequency: RecurrenceFrequency;
  /** Every N days/weeks/months/years. 1 means "every". */
  interval: number;
  /** IANA zone. The schedule is meaningless without it. */
  timezone: string;
  /** Local wall-clock time, "HH:MM". */
  timeOfDay: string;
  /** Weekly only. 0 = Sunday … 6 = Saturday. */
  daysOfWeek?: number[];
  /** Monthly and yearly. 1–31. */
  dayOfMonth?: number;
  /** Yearly only. 1–12. */
  month?: number;
  /** Optional last instant an occurrence may run. */
  endAt?: string;
}

export interface RecurrenceValidation {
  valid: boolean;
  errors: string[];
}

const MAX_INTERVAL = 365;

/**
 * Validate a recurrence definition.
 *
 * Server-side and total: every field is checked, and an invalid definition is
 * refused rather than repaired. A schedule the admin did not intend is worse
 * than an error message.
 */
export function validateRecurrence(input: unknown): RecurrenceValidation {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['A recurrence definition is required.'] };
  }
  const r = input as Partial<MailRecurrence>;

  const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!r.frequency || !FREQUENCIES.includes(r.frequency)) {
    errors.push('Choose a frequency of daily, weekly, monthly or yearly.');
  }

  const interval = Number(r.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) {
    errors.push(`The interval must be a whole number between 1 and ${MAX_INTERVAL}.`);
  }

  if (!r.timezone || !isSupportedTimezone(r.timezone)) {
    errors.push('Choose a supported timezone.');
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.timeOfDay ?? ''))) {
    errors.push('Enter a time of day as HH:MM in 24-hour form.');
  }

  if (r.frequency === 'weekly') {
    const days = r.daysOfWeek;
    if (!Array.isArray(days) || days.length === 0) {
      errors.push('Choose at least one day of the week.');
    } else if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      errors.push('Days of the week must be between 0 (Sunday) and 6 (Saturday).');
    }
  }

  if (r.frequency === 'monthly' || r.frequency === 'yearly') {
    const day = Number(r.dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.push('The day of the month must be between 1 and 31.');
    }
  }

  if (r.frequency === 'yearly') {
    const month = Number(r.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push('The month must be between 1 and 12.');
    } else if (Number.isInteger(Number(r.dayOfMonth))) {
      /* A date that can never occur in ANY year is a mistake, not a schedule
         that simply skips: 30 February would never run at all. */
      const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
      if (Number(r.dayOfMonth) > maxDay) {
        errors.push(`Month ${month} never has ${r.dayOfMonth} days.`);
      }
    }
  }

  if (r.endAt !== undefined && r.endAt !== null && r.endAt !== '') {
    const end = new Date(String(r.endAt));
    if (Number.isNaN(end.getTime())) errors.push('The end date is not a valid date.');
  }

  return { valid: errors.length === 0, errors };
}

/* ── Calendar helpers ──────────────────────────────────────────────────────
   All arithmetic happens on plain year/month/day numbers, which are timezone
   independent. Only the final conversion to an instant involves a timezone,
   and that is delegated. */

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** The instant that "YYYY-MM-DD at timeOfDay" refers to in a zone. */
function instantFor(
  year: number, month1: number, day: number, timeOfDay: string, timezone: string,
): Date | null {
  if (day < 1 || day > daysInMonth(year, month1)) return null;
  return zonedTimeToUtc(`${year}-${pad(month1)}-${pad(day)}T${timeOfDay}`, timezone);
}

/** The local calendar date in a zone for an instant. */
function localParts(date: Date, timezone: string): { y: number; m: number; d: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    dow: DOW[parts.weekday] ?? 0,
  };
}

/* A search ceiling. Interval 365 monthly with a skipped day needs room, but an
   unbounded loop must never be possible. */
const MAX_CANDIDATES = 4000;

/**
 * The first occurrence strictly AFTER `after`.
 *
 * Returns null when the recurrence has ended, or when no valid date exists
 * within the search horizon.
 *
 * `after` defaults to now, which is what gives the missed-occurrence
 * behaviour: a scheduler that was offline resumes at the next FUTURE
 * occurrence rather than firing every occurrence it slept through.
 */
export function nextOccurrence(
  recurrence: MailRecurrence, after: Date = new Date(),
): Date | null {
  const { valid } = validateRecurrence(recurrence);
  if (!valid) return null;

  const end = recurrence.endAt ? new Date(recurrence.endAt) : null;
  const tz = recurrence.timezone;
  const time = recurrence.timeOfDay;
  const interval = Math.max(1, Math.floor(recurrence.interval));

  const start = localParts(after, tz);

  if (recurrence.frequency === 'daily' || recurrence.frequency === 'weekly') {
    /* Walk forward a day at a time from the local date of `after`. Stepping in
       DAYS rather than in milliseconds is what keeps the wall-clock time
       stable across a DST transition - adding 24h would shift it by an hour. */
    const days = recurrence.frequency === 'weekly' ? (recurrence.daysOfWeek ?? []) : null;
    const cursor = new Date(Date.UTC(start.y, start.m - 1, start.d));

    for (let i = 0; i < MAX_CANDIDATES; i += 1) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const d = cursor.getUTCDate();
      const candidate = instantFor(y, m, d, time, tz);

      if (candidate && candidate.getTime() > after.getTime()) {
        let matches = true;
        if (days) {
          /* Weekday of the CANDIDATE in its own zone. */
          matches = days.includes(localParts(candidate, tz).dow);
          if (matches && interval > 1) {
            /* Every Nth week, counted from the ISO week of the epoch so the
               answer does not depend on when the campaign was created. */
            const weekIndex = Math.floor(Date.UTC(y, m - 1, d) / 604_800_000);
            matches = weekIndex % interval === 0;
          }
        } else if (interval > 1) {
          const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
          matches = dayIndex % interval === 0;
        }
        if (matches) return end && candidate > end ? null : candidate;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return null;
  }

  if (recurrence.frequency === 'monthly') {
    const day = Number(recurrence.dayOfMonth);
    let y = start.y;
    let m = start.m;

    for (let i = 0; i < MAX_CANDIDATES; i += 1) {
      /* Rule 1: a month without this day is SKIPPED, not slid. */
      if (day <= daysInMonth(y, m)) {
        const monthIndex = y * 12 + (m - 1);
        if (interval === 1 || monthIndex % interval === 0) {
          const candidate = instantFor(y, m, day, time, tz);
          if (candidate && candidate.getTime() > after.getTime()) {
            return end && candidate > end ? null : candidate;
          }
        }
      }
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return null;
  }

  /* Yearly. */
  const month = Number(recurrence.month);
  const day = Number(recurrence.dayOfMonth);
  let y = start.y;

  for (let i = 0; i < MAX_CANDIDATES; i += 1) {
    /* Rule 1 again: 29 February runs in leap years only. */
    if (day <= daysInMonth(y, month) && (interval === 1 || y % interval === 0)) {
      const candidate = instantFor(y, month, day, time, tz);
      if (candidate && candidate.getTime() > after.getTime()) {
        return end && candidate > end ? null : candidate;
      }
    }
    y += 1;
  }
  return null;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** A human sentence for the schedule, used in the UI and the audit trail. */
export function describeRecurrence(r: MailRecurrence): string {
  const every = r.interval > 1 ? `every ${r.interval} ` : 'every ';
  const at = `at ${r.timeOfDay} ${r.timezone}`;

  if (r.frequency === 'daily') {
    return `${r.interval > 1 ? `Every ${r.interval} days` : 'Every day'} ${at}`;
  }
  if (r.frequency === 'weekly') {
    const days = (r.daysOfWeek ?? []).slice().sort().map((d) => WEEKDAY_NAMES[d]).join(', ');
    return `${r.interval > 1 ? `Every ${r.interval} weeks on` : 'Every'} ${days} ${at}`;
  }
  if (r.frequency === 'monthly') {
    return `${every}month on day ${r.dayOfMonth} ${at}`
      + (Number(r.dayOfMonth) > 28 ? ' (months without that day are skipped)' : '');
  }
  const monthName = MONTH_NAMES[Number(r.month) - 1] ?? '';
  return `${every}year on ${monthName} ${r.dayOfMonth} ${at}`
    + (Number(r.month) === 2 && Number(r.dayOfMonth) === 29 ? ' (leap years only)' : '');
}
