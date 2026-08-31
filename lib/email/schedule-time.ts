/**
 * Timezone handling for scheduled campaigns.
 *
 * "Tomorrow at 6am" is meaningless without a timezone, and the two easy
 * mistakes are equally wrong: assuming UTC sends at 11:30am IST, and assuming
 * the browser's timezone means an admin travelling changes when campaigns go
 * out. So the admin states a timezone explicitly and it is stored with the
 * campaign; this converts their wall-clock time to an absolute instant.
 *
 * Implemented with `Intl`, which ships with Node — no date library needed.
 */

/** Offered in the UI. An allow-list, so an arbitrary string cannot be stored. */
export const SUPPORTED_TIMEZONES = [
  'Asia/Kolkata', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney',
];

/** What UTC offset the zone was at a given instant, in minutes. */
function offsetMinutesAt(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  /* The same instant expressed as if the zone's local time were UTC; the gap
     between that and the real instant is the offset. */
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/**
 * Convert a local wall-clock string ("2027-01-01T06:00") in `timeZone` to the
 * absolute instant it refers to.
 *
 * Returns null when the input is unparseable or the zone is unknown.
 */
export function zonedTimeToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(local).trim());
  if (!m) {
    /* Already absolute (carries an offset or Z)? Take it as given. */
    const direct = new Date(local);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const [, y, mo, d, h, mi, sec] = m;
  const naiveUtc = Date.UTC(
    Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec ?? 0),
  );

  try {
    /* Two passes: the offset itself depends on the instant, and near a DST
       boundary the first guess can land in the wrong side of the transition. */
    let guess = new Date(naiveUtc - offsetMinutesAt(new Date(naiveUtc), timeZone) * 60_000);
    guess = new Date(naiveUtc - offsetMinutesAt(guess, timeZone) * 60_000);
    return Number.isNaN(guess.getTime()) ? null : guess;
  } catch {
    return null;
  }
}

/** Render an instant in a named zone, for confirmation copy. */
export function formatInZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, dateStyle: 'medium', timeStyle: 'short', hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * The calendar day an instant falls on, in a given timezone: "YYYY-MM-DD".
 *
 * Analytics buckets by local day, and the naive approach - slicing an ISO
 * string - buckets by UTC day instead. For Asia/Kolkata that is wrong for five
 * and a half hours of every day: a send at 02:00 IST would be reported as the
 * previous day. Built on `Intl`, so DST transitions are handled by the same
 * mechanism the rest of this module uses rather than by arithmetic.
 */
export function zonedDayKey(date: Date, timeZone: string): string {
  try {
    /* en-CA formats as YYYY-MM-DD, which is exactly the key wanted here. */
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    /* An unknown zone falls back to UTC rather than throwing mid-aggregation. */
    return date.toISOString().slice(0, 10);
  }
}

/**
 * The Monday of the week an instant falls in, in a given timezone.
 *
 * Weeks start on Monday because a mail week does; a Sunday-start bucket splits
 * every working week across two rows.
 */
export function zonedWeekKey(date: Date, timeZone: string): string {
  const day = zonedDayKey(date, timeZone);
  const [y, m, d] = day.split('-').map(Number);
  /* Anchored at noon UTC so adding days cannot cross a DST boundary into the
     previous or next day. */
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  /* getUTCDay: 0 = Sunday. Shift so Monday is the start. */
  const offset = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - offset);
  return anchor.toISOString().slice(0, 10);
}

/** Is this a timezone the application is willing to aggregate in? */
export function isSupportedTimezone(value: string): boolean {
  return SUPPORTED_TIMEZONES.includes(value);
}
