import {
  fileTransfersPath,
  hiringJobsPath,
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
    readJsonFile<LooseJob[]>(hiringJobsPath, []),
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
