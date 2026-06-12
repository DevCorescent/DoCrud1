import { getDbPool } from '@/lib/server/database';
import { getStoredUsersFromRepository } from '@/lib/server/repositories';
import { readJsonFile, writeJsonFile, mailCampaignsPath } from '@/lib/server/storage';
import { sendTrackedMail } from '@/lib/server/mailer';

export type MailCampaignAudience =
  | { mode: 'all_users' }
  | { mode: 'role'; role: string }
  | { mode: 'emails'; emails: string[] };

export type MailCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export type MailCampaign = {
  id: string;
  title: string;
  subject: string;
  text: string;
  html?: string;
  audience: MailCampaignAudience;
  sendAt?: string; // ISO, when scheduled
  status: MailCampaignStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastError?: string;
  progress?: {
    total: number;
    sent: number;
    failed: number;
    startedAt?: string;
    finishedAt?: string;
  };
};

type CampaignState = { campaigns: MailCampaign[] };

const fallback: CampaignState = { campaigns: [] };

export function createCampaignId(prefix = 'cmp') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getMailCampaigns(): Promise<MailCampaign[]> {
  const state = await readJsonFile<CampaignState>(mailCampaignsPath, fallback);
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns : [];
  return campaigns
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getMailCampaignById(id: string): Promise<MailCampaign | null> {
  const campaigns = await getMailCampaigns();
  return campaigns.find((c) => c.id === id) ?? null;
}

export async function upsertMailCampaign(next: MailCampaign) {
  const state = await readJsonFile<CampaignState>(mailCampaignsPath, fallback);
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns : [];
  const idx = campaigns.findIndex((c) => c.id === next.id);
  const updatedAt = new Date().toISOString();
  const record: MailCampaign = { ...next, updatedAt };
  const updated = idx >= 0
    ? campaigns.map((c, i) => (i === idx ? record : c))
    : [record, ...campaigns];
  await writeJsonFile(mailCampaignsPath, { campaigns: updated.slice(0, 500) });
  return record;
}

export async function deleteMailCampaign(id: string) {
  const state = await readJsonFile<CampaignState>(mailCampaignsPath, fallback);
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns : [];
  await writeJsonFile(mailCampaignsPath, { campaigns: campaigns.filter((c) => c.id !== id) });
}

async function resolveAudience(audience: MailCampaignAudience) {
  const pool = getDbPool();
  const fallbackUsers = await getStoredUsersFromRepository<any>([]);
  const users = pool ? await getStoredUsersFromRepository<any>(fallbackUsers) : fallbackUsers;

  if (audience.mode === 'all_users') {
    return users.map((u: any) => String(u.email || '').toLowerCase()).filter(Boolean);
  }

  if (audience.mode === 'role') {
    const role = String(audience.role || '').trim().toLowerCase();
    return users
      .filter((u: any) => String(u.role || '').toLowerCase() === role)
      .map((u: any) => String(u.email || '').toLowerCase())
      .filter(Boolean);
  }

  const list = Array.isArray(audience.emails) ? audience.emails : [];
  return list.map((e) => String(e || '').toLowerCase().trim()).filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLimited<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function sendMailCampaign(id: string, origin: string, actorEmail?: string) {
  const campaign = await getMailCampaignById(id);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'cancelled') throw new Error('Campaign is cancelled');
  if (campaign.status === 'sending') throw new Error('Campaign is already sending');

  const recipients = await resolveAudience(campaign.audience);
  const unique = Array.from(new Set(recipients)).slice(0, 25_000);
  if (unique.length === 0) throw new Error('No recipients found for this audience.');

  const startedAt = new Date().toISOString();
  await upsertMailCampaign({
    ...campaign,
    status: 'sending',
    lastError: undefined,
    progress: { total: unique.length, sent: 0, failed: 0, startedAt },
  });

  let sent = 0;
  let failed = 0;
  let lastPersistAt = Date.now();

  const persist = async () => {
    const current = await getMailCampaignById(id);
    if (!current) return;
    await upsertMailCampaign({
      ...current,
      progress: {
        total: unique.length,
        sent,
        failed,
        startedAt,
        finishedAt: current.progress?.finishedAt,
      },
    });
  };

  try {
    await runLimited(unique, 4, async (to) => {
      try {
        await sendTrackedMail({
          policyKey: 'bulk_campaign',
          typeLabel: 'system',
          to,
          subject: campaign.subject,
          text: campaign.text,
          html: campaign.html,
          sentBy: actorEmail || 'admin',
          origin,
          metadata: {
            campaignId: campaign.id,
            campaignTitle: campaign.title,
          },
        });
        sent += 1;
      } catch (err) {
        failed += 1;
      }

      // Persist progress periodically, not per-email.
      if (Date.now() - lastPersistAt > 1500) {
        lastPersistAt = Date.now();
        await persist();
      }

      // A tiny delay helps avoid hammering SMTP providers.
      await sleep(35);
    });

    const finishedAt = new Date().toISOString();
    const final = await getMailCampaignById(id);
    if (final) {
      await upsertMailCampaign({
        ...final,
        status: failed > 0 ? 'sent' : 'sent',
        progress: { total: unique.length, sent, failed, startedAt, finishedAt },
      });
    }
    return { total: unique.length, sent, failed };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const current = await getMailCampaignById(id);
    if (current) {
      await upsertMailCampaign({
        ...current,
        status: 'failed',
        lastError: error instanceof Error ? error.message : 'Campaign failed',
        progress: { total: unique.length, sent, failed, startedAt, finishedAt },
      });
    }
    throw error;
  }
}

export async function runDueMailCampaigns(origin: string) {
  const campaigns = await getMailCampaigns();
  const now = Date.now();
  const due = campaigns.filter((c) => (
    c.status === 'scheduled' &&
    c.sendAt &&
    new Date(c.sendAt).getTime() <= now
  ));

  const results: Array<{ id: string; status: 'sent' | 'failed'; sent: number; failed: number }> = [];
  for (const campaign of due.slice(0, 5)) {
    try {
      const r = await sendMailCampaign(campaign.id, origin, campaign.createdBy);
      results.push({ id: campaign.id, status: 'sent', sent: r.sent, failed: r.failed });
    } catch (err) {
      results.push({ id: campaign.id, status: 'failed', sent: 0, failed: 0 });
    }
  }
  return results;
}

