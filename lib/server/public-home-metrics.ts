import { getHiringJobs } from '@/lib/server/hiring';
import {
  fileTransfersPath,
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

type LooseJob = {
  status?: string;
};

function formatCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

export async function getPublicHomeMetrics() {
  const [users, history, transfers, jobs] = await Promise.all([
    readJsonFile<LooseUser[]>(usersPath, []),
    readJsonFile<LooseHistory[]>(historyFilePath, []),
    readJsonFile<Array<Record<string, unknown>>>(fileTransfersPath, []),
    /* Phase 2.6+2.7E: jobs come from the canonical store like every other
       reader. `.catch(() => [])` because these are HOMEPAGE METRICS — a
       decorative counter must not take the homepage down, and a missing number
       is survivable where a missing job list would not be. Every path that
       serves actual job DATA throws instead. */
    getHiringJobs().catch(() => [] as LooseJob[]),
  ]);

  const workspaceIds = new Set(
    users
      .filter((user) => user.accountType === 'business' || user.role === 'client')
      .map((user) => user.organizationId || user.id)
      .filter(Boolean),
  );

  const formFlows = history.filter((entry) => Boolean(entry.dataCollectionEnabled)).length;
  const liveRoles = jobs.filter((job) => job.status === 'published').length;

  return [
    { id: 'docs', value: formatCount(history.length), label: 'documents created' },
    { id: 'shares', value: formatCount(transfers.length), label: 'secure shares sent' },
    { id: 'workspaces', value: formatCount(workspaceIds.size), label: 'active workspaces' },
    { id: 'roles', value: formatCount(liveRoles || formFlows), label: liveRoles ? 'live hiring roles' : 'active form flows' },
  ];
}
