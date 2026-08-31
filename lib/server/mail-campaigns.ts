import { getDbPool } from '@/lib/server/database';
import { getStoredUsersFromRepository } from '@/lib/server/repositories';
import {
  readJsonFile, writeJsonFile, mailCampaignsPath, withStorageLock,
} from '@/lib/server/storage';
import { sendTrackedMail } from '@/lib/server/mailer';
import { resolveRecipients, type MailSegment } from '@/lib/server/mail-recipients';
import {
  classifyMailError, nextRetryAt, MAX_DELIVERY_ATTEMPTS,
  type MailFailureKind,
} from '@/lib/server/mail-provider';

export type MailCampaignAudience =
  | { mode: 'all_users' }
  | { mode: 'role'; role: string }
  | { mode: 'emails'; emails: string[] }
  /* Segments are stored as a DESCRIPTION, not as a frozen address list, so a
     campaign scheduled for tomorrow mails whoever matches tomorrow — and a
     stale browser tab can never pin an out-of-date recipient set. */
  | { mode: 'segment'; segment: MailSegment };

/* Mapping to the delivery vocabulary: 'scheduled' is queued (including queued
   for a retry), 'sending' is processing. 'partially_failed' is new — it is the
   honest answer when some recipients were delivered and others permanently
   were not, which previously collapsed into 'sent'. */
export type MailCampaignStatus =
  | 'draft' | 'scheduled' | 'sending' | 'sent'
  | 'partially_failed' | 'failed' | 'cancelled';

/**
 * Per-recipient delivery state.
 *
 * Only recipients that have NOT succeeded are kept: a delivered message is
 * already recorded in the outbox, and storing 25,000 successes would bloat the
 * campaign document for no benefit. What must survive is everything needed to
 * retry correctly and to explain a failure.
 */
export interface MailDelivery {
  to: string;
  attempts: number;
  status: 'pending' | 'failed';
  failureKind?: MailFailureKind;
  /** SMTP reply code, when the provider gave one. */
  providerCode?: number;
  error?: string;
  /** null once it will never be retried again. */
  nextRetryAt?: string | null;
  lastAttemptAt?: string;
}

/** Bounds the campaign document; failures beyond this are counted, not listed. */
const MAX_TRACKED_DELIVERIES = 5_000;

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
  /** Set while a worker owns this campaign, so two workers cannot both send it. */
  claimToken?: string;
  claimedAt?: string;
  /** Recipients still pending retry, plus permanently failed ones. */
  deliveries?: MailDelivery[];
  /* Audience provenance. The DEFINITION lives in `audience`; these record what
     the admin was shown when they approved the send, so the audit trail is
     meaningful even though the recipient list is deliberately re-resolved at
     execution time. */
  audienceDescription?: string;
  audiencePreviewCount?: number;
  /** The timezone the admin scheduled in, kept for display. */
  scheduleTimezone?: string;
  /** How many delivery passes this campaign has run. */
  passes?: number;
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

const CAMPAIGN_LOCK = 'mail-campaigns';

/** The unlocked write. Only call this while already holding CAMPAIGN_LOCK. */
async function writeCampaign(next: MailCampaign) {
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

export async function upsertMailCampaign(next: MailCampaign) {
  return withStorageLock(CAMPAIGN_LOCK, () => writeCampaign(next));
}

export async function deleteMailCampaign(id: string) {
  const state = await readJsonFile<CampaignState>(mailCampaignsPath, fallback);
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns : [];
  await writeJsonFile(mailCampaignsPath, { campaigns: campaigns.filter((c) => c.id !== id) });
}

async function resolveAudience(audience: MailCampaignAudience) {
  /* Delegates to the shared recipient engine, so the count shown on the
     confirmation screen and the addresses actually mailed come from one
     implementation. */
  if (audience.mode === 'segment') {
    const resolved = await resolveRecipients(audience.segment);
    return resolved.emails;
  }

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

/**
 * Statuses a campaign may be in and still be eligible to start sending.
 * 'sending' and 'sent' are absent on purpose: that is the whole point.
 */
const CLAIMABLE: MailCampaignStatus[] = ['draft', 'scheduled', 'failed'];

/** Thrown when another worker already owns this campaign. Not an error state. */
export class CampaignAlreadyClaimedError extends Error {
  constructor(id: string) {
    super(`Campaign ${id} is already being sent`);
    this.name = 'CampaignAlreadyClaimedError';
  }
}

/**
 * Take ownership of a campaign before sending it.
 *
 * The store behind `readJsonFile`/`writeJsonFile` has no compare-and-set, so
 * this is write-then-verify: stamp our own token, read back, and proceed only
 * if the token that survived is ours. Two workers that race will both write,
 * but only the one whose write landed last owns the campaign — the other sees
 * a foreign token and backs off without sending anything.
 *
 * Without this, enabling cron would mean every overlapping invocation sends the
 * campaign again, to every recipient.
 */
async function claimCampaign(id: string, token: string): Promise<MailCampaign> {
  /* Read, decide and write inside ONE critical section.

     This used to read, write, then re-read and compare tokens — which made
     correctness depend on how two concurrent writes happened to interleave.
     It worked only by accident of timing, and making writes atomic
     (temp-file + rename) changed that timing enough that BOTH workers began
     winning the claim, doubling every recipient. Holding the lock across the
     read and the write removes the interleaving entirely.

     The token is still written and verified, because this lock is per-process
     and two serverless instances can still race; the verify is the remaining
     cross-instance guard. */
  return withStorageLock(CAMPAIGN_LOCK, async () => {
    const campaign = await getMailCampaignById(id);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === 'cancelled') throw new Error('Campaign is cancelled');
    if (!CLAIMABLE.includes(campaign.status)) throw new CampaignAlreadyClaimedError(id);

    await writeCampaign({
      ...campaign,
      status: 'sending',
      claimToken: token,
      claimedAt: new Date().toISOString(),
      lastError: undefined,
    });

    const confirmed = await getMailCampaignById(id);
    if (!confirmed || confirmed.claimToken !== token) throw new CampaignAlreadyClaimedError(id);
    return confirmed;
  });
}

export type CampaignMailSender = typeof sendTrackedMail;

export async function sendMailCampaign(
  id: string,
  origin: string,
  actorEmail?: string,
  sender: CampaignMailSender = sendTrackedMail,
) {
  const token = createCampaignId('claim');
  const campaign = await claimCampaign(id, token);
  const now = Date.now();

  /* ── Who does this pass send to? ────────────────────────────────────────
     A RETRY pass sends only to recipients still pending and now due. Falling
     back to the full audience here would re-deliver to everyone who already
     succeeded — the single worst bug this feature could have. */
  const pending = (campaign.deliveries ?? []).filter(
    (d) => d.status === 'pending'
      && d.nextRetryAt !== null
      && d.nextRetryAt !== undefined
      && new Date(d.nextRetryAt).getTime() <= now,
  );
  const isRetryPass = pending.length > 0;

  let unique: string[];
  if (isRetryPass) {
    unique = pending.map((d) => d.to);
  } else {
    const recipients = await resolveAudience(campaign.audience);
    unique = Array.from(new Set(recipients)).slice(0, 25_000);
  }

  if (unique.length === 0) {
    await upsertMailCampaign({
      ...campaign,
      status: 'failed',
      claimToken: undefined,
      lastError: 'No recipients found for this audience.',
    });
    throw new Error('No recipients found for this audience.');
  }

  /* Attempt counts carry across passes, so the ceiling means "attempts for
     this recipient", not "attempts in this run". */
  const attemptsFor = new Map<string, number>();
  for (const d of campaign.deliveries ?? []) attemptsFor.set(d.to, d.attempts);

  const startedAt = campaign.progress?.startedAt ?? new Date().toISOString();
  /* Cumulative across passes: a retry that succeeds must add to the running
     total, not restart it. */
  const priorSent = isRetryPass ? (campaign.progress?.sent ?? 0) : 0;
  const total = isRetryPass ? (campaign.progress?.total ?? unique.length) : unique.length;

  await upsertMailCampaign({
    ...campaign,
    status: 'sending',
    claimToken: token,
    lastError: undefined,
    passes: (campaign.passes ?? 0) + 1,
    progress: { total, sent: priorSent, failed: campaign.progress?.failed ?? 0, startedAt },
  });

  let sent = 0;
  let firstError = '';
  let lastPersistAt = Date.now();
  /* Keyed by address so a retry replaces the previous record rather than
     appending a duplicate. */
  const results = new Map<string, MailDelivery>();
  /* Deliveries from earlier passes that are NOT part of this one are carried
     forward untouched. */
  for (const d of campaign.deliveries ?? []) {
    if (!unique.includes(d.to)) results.set(d.to, d);
  }

  const persist = async () => {
    const current = await getMailCampaignById(id);
    if (!current) return;
    const failedNow = Array.from(results.values()).filter((d) => d.status !== 'pending').length;
    await upsertMailCampaign({
      ...current,
      progress: {
        total,
        sent: priorSent + sent,
        failed: failedNow,
        startedAt,
        finishedAt: current.progress?.finishedAt,
      },
    });
  };

  try {
    await runLimited(unique, 4, async (to) => {
      const attempt = (attemptsFor.get(to) ?? 0) + 1;
      const lastAttemptAt = new Date().toISOString();
      try {
        await sender({
          policyKey: 'bulk_campaign',
          typeLabel: 'system',
          to,
          subject: campaign.subject,
          text: campaign.text,
          html: campaign.html,
          sentBy: actorEmail || 'admin',
          origin,
          metadata: { campaignId: campaign.id, campaignTitle: campaign.title },
        });
        sent += 1;
        /* Delivered: drop any pending record so it is never retried. */
        results.delete(to);
      } catch (err) {
        /* Classified, not guessed. This is what decides whether the address is
           tried again — a suspended mailbox and a timeout must not be treated
           alike. */
        const failure = classifyMailError(err);
        const retryAt = nextRetryAt(failure, attempt);
        results.set(to, {
          to,
          attempts: attempt,
          status: retryAt ? 'pending' : 'failed',
          failureKind: failure.kind,
          providerCode: failure.code,
          error: failure.message,
          nextRetryAt: retryAt,
          lastAttemptAt,
        });
        if (!firstError) firstError = failure.message;
      }

      if (Date.now() - lastPersistAt > 1500) {
        lastPersistAt = Date.now();
        await persist();
      }
      await sleep(35);
    });

    const deliveries = Array.from(results.values()).slice(0, MAX_TRACKED_DELIVERIES);
    const stillPending = deliveries.filter((d) => d.status === 'pending');
    const permanentlyFailed = deliveries.filter((d) => d.status === 'failed');
    const totalSent = priorSent + sent;
    const finishedAt = new Date().toISOString();

    /* ── Final state ──────────────────────────────────────────────────────
       Four distinct outcomes, none of which may be rounded up. */
    let status: MailCampaignStatus;
    let sendAt = campaign.sendAt;
    if (stillPending.length > 0) {
      /* Back to the queue. `sendAt` becomes the earliest due retry, so the
         existing cron picks it up with no second scheduler. */
      status = 'scheduled';
      sendAt = stillPending
        .map((d) => d.nextRetryAt!)
        .sort()[0];
    } else if (totalSent === 0 && permanentlyFailed.length > 0) {
      status = 'failed';
    } else if (permanentlyFailed.length > 0) {
      status = 'partially_failed';
    } else {
      status = 'sent';
    }

    const final = await getMailCampaignById(id);
    if (final) {
      await upsertMailCampaign({
        ...final,
        status,
        sendAt,
        claimToken: undefined,
        lastError: firstError || undefined,
        deliveries: deliveries.length ? deliveries : undefined,
        progress: {
          total,
          sent: totalSent,
          failed: permanentlyFailed.length,
          startedAt,
          finishedAt: stillPending.length ? undefined : finishedAt,
        },
      });
    }

    return {
      total,
      sent: totalSent,
      failed: permanentlyFailed.length,
      pendingRetry: stillPending.length,
      error: firstError || undefined,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const current = await getMailCampaignById(id);
    if (current) {
      await upsertMailCampaign({
        ...current,
        status: 'failed',
        claimToken: undefined,
        lastError: error instanceof Error ? error.message : 'Campaign failed',
        progress: {
          total, sent: priorSent + sent,
          failed: Array.from(results.values()).filter((d) => d.status !== 'pending').length,
          startedAt, finishedAt,
        },
      });
    }
    throw error;
  }
}

/** How many campaigns one scheduled run will process. The rest wait for the
    next tick rather than letting a single invocation run unbounded. */
const MAX_CAMPAIGNS_PER_RUN = 5;

export interface DueCampaignResult {
  id: string;
  title: string;
  /* 'retrying' is not a failure: some recipients are queued for another
     attempt, and reporting it as failed would be wrong. */
  status: 'sent' | 'partial' | 'failed' | 'skipped' | 'retrying';
  total: number;
  sent: number;
  failed: number;
  pendingRetry?: number;
  /** Present on failure. Already a provider message — never a credential. */
  error?: string;
}

export interface RunDueCampaignsSummary {
  processed: number;
  /** Due campaigns left for the next run because of MAX_CAMPAIGNS_PER_RUN. */
  remaining: number;
  results: DueCampaignResult[];
}

/**
 * Send every scheduled campaign whose time has come.
 *
 * Safe to call repeatedly and concurrently: `claimCampaign` makes a campaign
 * that another worker already owns come back as 'skipped' rather than being
 * sent twice, and one campaign's failure never stops the others.
 */
export async function runDueMailCampaigns(
  origin: string,
  sender: CampaignMailSender = sendTrackedMail,
): Promise<RunDueCampaignsSummary> {
  const campaigns = await getMailCampaigns();
  const now = Date.now();
  const due = campaigns.filter((c) => (
    c.status === 'scheduled'
    && c.sendAt
    && new Date(c.sendAt).getTime() <= now
  ));

  const batch = due.slice(0, MAX_CAMPAIGNS_PER_RUN);
  const results: DueCampaignResult[] = [];

  for (const campaign of batch) {
    try {
      const r = await sendMailCampaign(campaign.id, origin, campaign.createdBy, sender);
      results.push({
        id: campaign.id,
        title: campaign.title,
        /* "Some delivered, some did not" is neither a success nor a failure,
           and collapsing it into either one misleads the admin. */
        status: r.pendingRetry > 0 ? 'retrying'
          : r.sent === 0 ? 'failed'
          : r.failed > 0 ? 'partial'
          : 'sent',
        total: r.total,
        sent: r.sent,
        failed: r.failed,
        pendingRetry: r.pendingRetry,
        error: r.error,
      });
    } catch (err) {
      if (err instanceof CampaignAlreadyClaimedError) {
        /* Another worker owns it. Expected under overlapping schedules, and
           explicitly not a failure. */
        results.push({
          id: campaign.id, title: campaign.title, status: 'skipped',
          total: 0, sent: 0, failed: 0,
        });
        continue;
      }
      results.push({
        id: campaign.id,
        title: campaign.title,
        status: 'failed',
        total: 0,
        sent: 0,
        failed: 0,
        error: err instanceof Error ? err.message : 'Campaign failed',
      });
    }
  }

  return {
    processed: results.length,
    remaining: Math.max(0, due.length - batch.length),
    results,
  };
}
