/**
 * THE mail metric definitions.
 *
 * Every rate this application shows is computed here, once. Health and
 * Analytics both call it, so the two screens cannot quietly disagree about
 * what "acceptance rate" means.
 *
 * Three rules run through the whole file:
 *
 * 1. ACCEPTANCE IS NOT DELIVERY. The provider taking a message is the
 *    strongest evidence this system ever has - there are no delivery
 *    callbacks - so there is no "delivery rate" here and no function that
 *    could produce one.
 *
 * 2. NO DATA IS NOT ZERO. A rate over an empty denominator is `null`, never 0.
 *    "0% open rate" and "nothing has been sent yet" look identical on a
 *    dashboard and mean opposite things; one is a problem to investigate and
 *    the other is Tuesday.
 *
 * 3. A RATE CANNOT EXCEED 100%. The open rate counts MESSAGES THAT WERE
 *    OPENED, not opens. The previous implementation divided total opens by
 *    message count, so three opens of one message in a two-message send
 *    reported 150% - a number that cannot mean anything.
 */

/**
 * A percentage to one decimal place, or null when there is nothing to divide.
 *
 * Null is the honest answer for an empty denominator and is rendered as
 * "Not available", never as 0%.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Shown wherever a metric has no eligible data. */
export const NOT_AVAILABLE = 'Not available';

export const NOT_AVAILABLE_REASON =
  'There is not enough eligible data to calculate this metric.';

/**
 * Raw counts, all sourced from records the application already keeps.
 *
 * `opened`/`clicked` count MESSAGES with at least one tracked event.
 * `totalOpens`/`totalClicks` count the events themselves. Both are reported,
 * because they answer different questions and conflating them is what produced
 * a rate above 100%.
 */
export interface MailCounts {
  /** Send attempts recorded in the outbox. */
  attempted: number;
  /** Attempts the provider accepted. */
  accepted: number;
  /** Attempts the provider refused. */
  failed: number;
  /** Attempts still in flight, neither accepted nor refused. */
  queued: number;
  /** Accepted messages with at least one tracked open. */
  opened: number;
  /** Accepted messages with at least one tracked click. */
  clicked: number;
  /** Tracking events, which may exceed the message count. */
  totalOpens: number;
  totalClicks: number;
  /** Failures the classifier says retrying cannot fix. */
  permanentFailures: number;
  /** Failures that could still succeed on another attempt. */
  retryableFailures: number;
}

export const EMPTY_COUNTS: MailCounts = {
  attempted: 0, accepted: 0, failed: 0, queued: 0,
  opened: 0, clicked: 0, totalOpens: 0, totalClicks: 0,
  permanentFailures: 0, retryableFailures: 0,
};

export interface MailRates {
  /** accepted / attempted. Never called a delivery rate. */
  acceptanceRate: number | null;
  /** failed / attempted. */
  failureRate: number | null;
  /** Accepted messages with >=1 open / accepted messages. Cannot exceed 100. */
  openRate: number | null;
  /** Accepted messages with >=1 click / accepted messages. */
  clickRate: number | null;
  /** Permanent failures / failures. */
  permanentFailureRate: number | null;
}

export function computeRates(counts: MailCounts): MailRates {
  /* Attempted is the denominator for acceptance and failure, and it excludes
     messages still queued: a message that has not been answered yet is not
     evidence either way, and counting it as a failure would make every
     dashboard dip during a send. */
  const decided = counts.accepted + counts.failed;

  return {
    acceptanceRate: rate(counts.accepted, decided),
    failureRate: rate(counts.failed, decided),
    /* Denominator is ACCEPTED messages: a message the provider refused was
       never in a position to be opened, and including it would understate
       engagement for reasons that have nothing to do with the content. */
    openRate: rate(counts.opened, counts.accepted),
    clickRate: rate(counts.clicked, counts.accepted),
    permanentFailureRate: rate(counts.permanentFailures, counts.failed),
  };
}

/**
 * Change between two periods, or null when there is nothing to compare.
 *
 * Null when the previous period had no data at all: "up 100%" from a period
 * with zero sends is arithmetic, not information, and §5 forbids fabricating a
 * comparison.
 */
export function comparePeriods(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Whether a rate is worth ranking on.
 *
 * A campaign that reached four people and was opened by one is not a "25% open
 * rate" worth comparing against a campaign that reached ten thousand. §10 asks
 * that thin data not be ranked as if the metric were valid.
 */
export const MIN_SAMPLE_FOR_RANKING = 20;

export function hasEnoughSample(denominator: number): boolean {
  return denominator >= MIN_SAMPLE_FOR_RANKING;
}

/** The disclosure that must accompany every open and click figure. */
export const TRACKING_DISCLAIMER =
  'Open and click tracking can under-count because some email clients block '
  + 'images or tracking redirects. A recorded open means the tracking pixel was '
  + 'requested — not that a person read the email.';
