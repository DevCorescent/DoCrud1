import { countPublishedJobs } from '@/lib/server/db/hiring-jobs-collection';
import { countFileTransferRows } from '@/lib/server/db/file-transfers-rows';
import {
  historyFilePath,
  readJsonFile,
  usersPath,
} from '@/lib/server/storage';

type LooseUser = {
  id?: string;
  role?: string;
  accountType?: string;
  organizationId?: string;
};

type LooseHistory = {
  dataCollectionEnabled?: boolean;
};

function formatCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

export async function getPublicHomeMetrics() {
  const [users, history, transferCount, publishedJobCount] = await Promise.all([
    readJsonFile<LooseUser[]>(usersPath, []),
    readJsonFile<LooseHistory[]>(historyFilePath, []),
    /* Same shape of fix as the job count below, found by isolating the reads
       on this path after that fix landed:

         countPublishedJobs    2,765 ms
         users                 8,708 ms   521 rows   0.52 MB
         history                 257 ms     0 rows
         transfers            77,567 ms   197 rows   6.9  MB   <- 98.5%

       The transfers read resolved to whole documents — file `dataUrl` blobs
       included — to produce `.length`. Counting in the database is the same
       number with none of the payload. null degrades to 0 exactly as the old
       `readJsonFile(..., [])` fallback did. */
    countFileTransferRows().catch(() => null),
    /* ═══ A COUNT, NOT A CORPUS ═══

       This loaded EVERY posting and then ran
       `jobs.filter(j => j.status === 'published').length` — 7,106 documents
       and 19.32 MB transferred to produce ONE integer, on the public homepage.
       Measured end to end at 694,589 ms against the live corpus.

       `countPublishedJobs()` runs `countDocuments({ status: 'published' })`,
       the same predicate the filter applied, so the number is identical and
       nothing crosses the wire but the total.

       The failure behaviour is deliberately UNCHANGED: it answers null when
       the store cannot be counted, and null becomes 0 below — exactly what the
       previous `.catch(() => [])` produced, which makes the label fall back to
       "active form flows". These are HOMEPAGE METRICS, where a decorative
       counter must not take the homepage down. Every path that serves actual
       job DATA still throws instead. */
    countPublishedJobs().catch(() => null),
  ]);

  const workspaceIds = new Set(
    users
      .filter((user) => user.accountType === 'business' || user.role === 'client')
      .map((user) => user.organizationId || user.id)
      .filter(Boolean),
  );

  const formFlows = history.filter((entry) => Boolean(entry.dataCollectionEnabled)).length;
  /* null (uncountable) collapses to 0, which is what an unreadable corpus
     produced before — the label then falls back to form flows rather than
     claiming zero live roles. */
  const liveRoles = publishedJobCount ?? 0;

  return [
    { id: 'docs', value: formatCount(history.length), label: 'documents created' },
    { id: 'shares', value: formatCount(transferCount ?? 0), label: 'secure shares sent' },
    { id: 'workspaces', value: formatCount(workspaceIds.size), label: 'active workspaces' },
    { id: 'roles', value: formatCount(liveRoles || formFlows), label: liveRoles ? 'live hiring roles' : 'active form flows' },
  ];
}
