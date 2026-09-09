/**
 * Which candidate-lookup strategy ingestion uses.
 *
 * Server-side only, exactly like the other read-source switches in this repo:
 * no query string, header or request body can select a mode, because a caller
 * choosing how the write path loads its candidates is a caller choosing how
 * much of the corpus to put in memory.
 *
 *   unset / anything but "true"  ->  whole-corpus  (DEFAULT)
 *   "true"                       ->  per-source candidate lookup
 *
 * DEFAULT OFF DELIBERATELY. The whole-corpus path is the one that has run in
 * production; at today's 5,276 postings it costs ~61 MB of heap, which is not
 * a problem. The incremental path exists for the corpus sizes where it becomes
 * one (measured: 733 MB at 100K), and it is turned on only after the
 * equivalence self-test and a staged rollout say it behaves identically.
 */
export function incrementalIngestEnabled(): boolean {
  return (process.env.INGEST_INCREMENTAL_LOOKUP || '').trim().toLowerCase() === 'true';
}
