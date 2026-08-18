/**
 * Lead statuses, exactly as the specification's "Lead Status" section lists
 * them — ten values, in that order. Nothing is added, renamed or dropped.
 *
 * Client-safe: the provider UI and the API both read this list, so the
 * options a provider sees are always the options the server will accept.
 */

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'discussion',
  'quote_sent',
  'booking_requested',
  'accepted',
  'in_progress',
  'completed',
  'declined',
  'cancelled',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Display wording, matching the specification's capitalisation. */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  discussion: 'Discussion',
  quote_sent: 'Quote Sent',
  booking_requested: 'Booking Requested',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/** Subtle badge treatment per status, using the existing Docrud tint scale. */
export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  new:               'bg-sky-200/[0.10] text-sky-200/90 border-sky-200/[0.18]',
  contacted:         'bg-blue-200/[0.10] text-blue-200/90 border-blue-200/[0.18]',
  discussion:        'bg-violet-200/[0.10] text-violet-200/90 border-violet-200/[0.18]',
  quote_sent:        'bg-cyan-200/[0.10] text-cyan-200/90 border-cyan-200/[0.18]',
  booking_requested: 'bg-amber-200/[0.10] text-amber-200/90 border-amber-200/[0.18]',
  accepted:          'bg-emerald-200/[0.10] text-emerald-200/90 border-emerald-200/[0.18]',
  in_progress:       'bg-indigo-200/[0.10] text-indigo-200/90 border-indigo-200/[0.18]',
  completed:         'bg-teal-200/[0.10] text-teal-200/90 border-teal-200/[0.18]',
  declined:          'bg-rose-200/[0.10] text-rose-200/90 border-rose-200/[0.18]',
  cancelled:         'bg-white/[0.07] text-white/50 border-white/[0.10]',
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === 'string' && (LEAD_STATUSES as readonly string[]).includes(value);
}
