'use client';

/**
 * What the résumé read is doing, shown on the steps that USE the result.
 *
 * ═══ THE BUG THIS FIXES ═══
 *
 * Attaching a résumé advances straight to the Name step and reads the file in
 * the background. The status was rendered only by WelcomeStep — the step the
 * person has just left — so from the Name step onward the read was completely
 * silent:
 *
 *   · While parsing, the field sat empty with no indication anything was
 *     happening. A cold PDF read measured 6.8 s, which reads as "stuck".
 *   · When the read FAILED, the 422 was handled correctly and the message was
 *     thrown away unseen. The person waited for a prefill that was never coming.
 *
 * So the notice moves to where the answer lands. It reports the state, offers a
 * retry when there is something to retry, and never blocks: every step below it
 * is fully usable while it is parsing and after it has failed. Typing is always
 * the way forward — this only explains why the fields are or are not filled.
 *
 * It renders NOTHING on success. A prefilled field that says "prefilled" is
 * noise; the filled value is its own evidence.
 */

import type { ExtractionState } from '@/lib/onboarding-resume';

export default function ExtractionNotice({
  extraction,
  onRetry,
}: {
  extraction: ExtractionState;
  /** Re-reads the SAME attached file. Absent when there is nothing to retry. */
  onRetry?: () => void;
}) {
  /* No résumé, or one that was read successfully — nothing to explain. */
  if (extraction.status === 'none' || extraction.status === 'done') return null;

  if (extraction.status === 'parsing') {
    return (
      <p className="extraction-note extraction-note-busy" role="status" aria-live="polite">
        <span className="extraction-spinner" aria-hidden="true" />
        Reading your resume…
      </p>
    );
  }

  if (extraction.status === 'empty') {
    return (
      <p className="extraction-note" role="status" aria-live="polite">
        We read your resume but could not pull anything out of it. Fill this in and carry on.
      </p>
    );
  }

  return (
    <p className="extraction-note extraction-note-failed" role="status" aria-live="polite">
      {extraction.message}{' '}
      {onRetry && (
        <button type="button" className="extraction-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </p>
  );
}
