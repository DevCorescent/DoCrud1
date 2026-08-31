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

import { renderEmail, extractEmailVariables, resolveEmailVariables } from '@/lib/email/render-email';
import { filterSuppressed, createUnsubscribeToken } from '@/lib/server/mail-suppression';
import {
  nextOccurrence, describeRecurrence, type MailRecurrence,
} from '@/lib/email/recurrence';
import {
  resolveRecipientUsers, recipientVariableValues, SUPPORTED_VARIABLES, type RecipientUser,
} from '@/lib/server/mail-recipients';
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
  /**
   * What the provider reported after acceptance, if anything.
   *
   * Distinct from `failureKind`, which describes why a SEND attempt failed. A
   * bounce happens after a successful hand-off, and conflating the two would
   * make an accepted-then-bounced message indistinguishable from one the
   * provider refused outright.
   */
  providerEvent?: 'hard_bounce' | 'soft_bounce' | 'complaint';
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
  /* ── Recurrence (Phase 16) ──────────────────────────────────────────────
     ONE campaign definition, MANY occurrences. A recurring campaign is an
     ordinary scheduled campaign whose `sendAt` is rewritten to the next
     occurrence after each run, so the existing due-detection and the existing
     send path handle it unchanged. There is no second execution engine. */
  recurrence?: MailRecurrence;
  recurrenceState?: RecurrenceState;
  progress?: {
    total: number;
    sent: number;
    failed: number;
    /* Recipients skipped because they are suppressed. Kept separate from
       `failed` on purpose: nothing went wrong, nothing was attempted, and
       nothing should be retried. Folding them into failures would make a
       healthy send look broken and would invite someone to "fix" it. */
    suppressed?: number;
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

/**
 * Several campaigns in ONE read.
 *
 * `getMailCampaignById` reads the whole campaign store on every call, which is
 * fine for one lookup and quadratic for a list. The outbox console called it
 * once per row: a 25-row page referencing three campaigns performed 25 full
 * store reads - measured at 7.2s, against 254ms for a single read.
 *
 * Ids are de-duplicated by the Map itself, and an id with no campaign is
 * simply absent, so a caller must handle a miss exactly as it did before.
 */
export async function getMailCampaignsByIds(
  /* An array rather than an Iterable: the project's compile target does not
     allow iterating an arbitrary iterable. */
  ids: readonly string[],
): Promise<Map<string, MailCampaign>> {
  const wanted = new Set<string>();
  for (const id of ids) if (id) wanted.add(id);

  const found = new Map<string, MailCampaign>();
  if (wanted.size === 0) return found;

  /* One read, whatever the number of ids. */
  const campaigns = await getMailCampaigns();
  for (const campaign of campaigns) {
    if (wanted.has(campaign.id)) found.set(campaign.id, campaign);
  }
  return found;
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

    /* ── Recurring occurrence guard, inside the SAME critical section ──
       Two workers cannot both claim (the status transition below settles
       that), but a worker that crashed AFTER sending and BEFORE rescheduling
       would leave the campaign due at the same `sendAt`. Recognising the
       occurrence it already completed is what stops the retry mailing
       everyone a second time. */
    if (campaign.recurrence && campaign.sendAt) {
      const state = campaign.recurrenceState;
      if (state && state.status !== 'active') throw new CampaignAlreadyClaimedError(id);
      if (state?.lastOccurrenceKey === occurrenceKey(id, campaign.sendAt)) {
        throw new CampaignAlreadyClaimedError(id);
      }
    }

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

/**
 * Every audience variable is neutral by default.
 *
 * A recipient whose record could not be matched must still receive readable
 * prose, never a literal `{{firstName}}`. "there" is what the recipient engine
 * already uses for a user with no name, so an unmatched address reads exactly
 * like a nameless one.
 */
function neutralVariableValues(email: string): Record<string, string> {
  return {
    firstName: 'there', lastName: '', fullName: 'there',
    email, companyName: '', role: '',
  };
}

/**
 * Per-recipient variable values for an audience.
 *
 * Only called when the content actually uses a variable: resolving an audience
 * a second time is real work, and the overwhelming majority of campaigns are
 * not personalised.
 */
async function audienceVariableValues(
  audience: MailCampaignAudience,
): Promise<Map<string, Record<string, string>>> {
  const map = new Map<string, Record<string, string>>();
  const add = (u: RecipientUser) => {
    if (u.email) map.set(u.email, recipientVariableValues(u));
  };

  if (audience.mode === 'segment') {
    (await resolveRecipientUsers(audience.segment)).forEach(add);
    return map;
  }

  /* A pasted address list carries no user record, so those recipients fall
     back to neutral values at send time. */
  if (audience.mode === 'emails') return map;

  const pool = getDbPool();
  const fallbackUsers = await getStoredUsersFromRepository<any>([]);
  const users = pool ? await getStoredUsersFromRepository<any>(fallbackUsers) : fallbackUsers;
  const role = audience.mode === 'role' ? String(audience.role || '').trim().toLowerCase() : null;

  for (const u of users as any[]) {
    const email = String(u.email || '').toLowerCase();
    if (!email) continue;
    if (role !== null && String(u.role || '').toLowerCase() !== role) continue;
    add({
      id: String(u.id ?? ''),
      email,
      name: String(u.name ?? ''),
      role: String(u.role ?? ''),
      accountType: 'unknown',
      organizationName: u.organizationName ? String(u.organizationName) : undefined,
      isActive: u.isActive !== false,
      createdAt: String(u.createdAt ?? ''),
    });
  }
  return map;
}

/** One past execution of a recurring campaign. Metadata, not a delivery log. */
export interface RecurrenceOccurrence {
  /** The instant this occurrence was SCHEDULED for - its identity. */
  scheduledFor: string;
  ranAt: string;
  status: 'sent' | 'partially_failed' | 'failed' | 'skipped';
  total: number;
  sent: number;
  failed: number;
  suppressed: number;
  error?: string;
}

export type RecurrenceStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface RecurrenceState {
  status: RecurrenceStatus;
  nextRunAt?: string | null;
  lastRunAt?: string;
  /**
   * The occurrence most recently completed, as `campaignId@scheduledInstant`.
   *
   * This is what makes a cron retry safe: a worker that crashed after sending
   * but before rescheduling would otherwise find the campaign due again at the
   * same `sendAt` and mail everyone twice.
   */
  lastOccurrenceKey?: string;
  /** Bounded history. The deliveries themselves stay in the outbox. */
  occurrences?: RecurrenceOccurrence[];
}

/** The identity of one occurrence. Deterministic, so two workers agree. */
export function occurrenceKey(campaignId: string, scheduledFor: string): string {
  return `${campaignId}@${new Date(scheduledFor).toISOString()}`;
}

const MAX_OCCURRENCE_HISTORY = 50;

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

  /* ── Suppression, checked HERE and nowhere earlier ──────────────────────
     The audience was resolved seconds ago, but the preview an admin approved
     may be minutes or days old. Someone who unsubscribed in between must be
     protected, so the check runs immediately before sending rather than at
     preview time - and it runs on the RETRY pass too, because a recipient who
     opts out while a retry is pending must not receive the retry either.

     A suppressed recipient is not a failure: no attempt is made, no outbox row
     is written, and nothing is scheduled for another try. */
  const beforeSuppression = unique.length;
  const { eligible, suppressed } = await filterSuppressed(unique);
  unique = eligible;
  /* Used below when carrying delivery records forward, so a suppressed address
     that was previously pending cannot be picked up by a later pass. */
  const suppressedSet = new Set(suppressed);

  if (unique.length === 0) {
    const everyoneSuppressed = beforeSuppression > 0;
    await upsertMailCampaign({
      ...campaign,
      status: everyoneSuppressed ? 'sent' : 'failed',
      claimToken: undefined,
      lastError: everyoneSuppressed ? undefined : 'No recipients found for this audience.',
      deliveries: undefined,
      progress: {
        total: beforeSuppression,
        sent: campaign.progress?.sent ?? 0,
        failed: 0,
        suppressed: suppressed.length,
        startedAt: campaign.progress?.startedAt ?? new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
    });
    /* Every recipient being suppressed is a completed send with nothing to do,
       not an error: throwing would mark a correctly-behaving campaign failed
       and leave it looking like something to retry. */
    if (everyoneSuppressed) {
      return {
        total: beforeSuppression,
        sent: 0,
        failed: 0,
        pendingRetry: 0,
        suppressed: suppressed.length,
        error: undefined,
      };
    }
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
    /* A pending retry for someone who has since unsubscribed is dropped, not
       carried: leaving it would mean the next pass mails them. */
    if (!unique.includes(d.to) && !suppressedSet.has(d.to)) results.set(d.to, d);
  }

  /* Only pay for audience resolution when the content is actually
     personalised - most campaigns are not. */
  const usesVariables = extractEmailVariables(
    `${campaign.subject} ${campaign.html ?? ''} ${campaign.text}`).length > 0;
  const valuesByEmail = usesVariables
    ? await audienceVariableValues(campaign.audience).catch(() => null)
    : null;

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
      /* Personalised HERE, per recipient, through the canonical renderer -
         the same pipeline the preview and the test send use.

         Until this existed the product advertised `{{firstName}}` in the
         template editor, validated it on save, and then mailed the literal
         placeholder to the entire audience: the substitution function had no
         caller outside its own test. */
      const values = { ...neutralVariableValues(to), ...(valuesByEmail?.get(to) ?? {}) };
      /* Per recipient, because the token IS the authorisation: one shared link
         would let anyone who received the campaign unsubscribe anyone else. */
      const unsubscribeUrl =
        `${origin.replace(/\/$/, '')}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(to))}`;
      const unsubscribeHtml =
        '<p style="margin-top:24px;font-size:12px;color:#64748b;">'
        + `<a href="${unsubscribeUrl}" style="color:#64748b;">Unsubscribe from marketing emails</a>`
        + '</p>';
      const rendered = campaign.html
        ? renderEmail({
            subject: campaign.subject,
            html: campaign.html,
            supported: SUPPORTED_VARIABLES,
            values,
          })
        : null;
      try {
        await sender({
          policyKey: 'bulk_campaign',
          typeLabel: 'system',
          to,
          subject: rendered
            ? rendered.subject
            : resolveEmailVariables(campaign.subject, values, { escape: false }),
          /* The stored text alternative is authored plain text, so it is
             substituted without HTML escaping. */
          text: `${rendered && !campaign.text.trim()
            ? rendered.text
            : resolveEmailVariables(campaign.text, values, { escape: false })}`
            + `\n\nUnsubscribe from marketing emails: ${unsubscribeUrl}`,
          /* Every campaign message carries a way out. Marketing mail without
             one is both a compliance problem and a reason people mark it as
             spam instead. */
          html: `${rendered ? rendered.bodyHtml : (campaign.html ?? '')}${unsubscribeHtml}`,
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
          suppressed: suppressed.length,
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
      suppressed: suppressed.length,
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
  /** Skipped because the recipient is suppressed. Never counted as a failure. */
  suppressed?: number;
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
/**
 * Record an occurrence and schedule the next one.
 *
 * Called after the EXISTING send path has finished. It rewrites `sendAt` to the
 * next occurrence and puts the campaign back to `scheduled`, which is how the
 * unchanged due-detection picks it up again - no second scheduler.
 *
 * MISSED OCCURRENCES ARE NOT REPLAYED. The next run is computed from NOW, not
 * from the occurrence that just ran, so a scheduler that was offline for three
 * days resumes with one send rather than three. A system outage must not turn
 * into a burst of stale email.
 */
export async function advanceRecurringCampaign(
  id: string,
  outcome: { total: number; sent: number; failed: number; suppressed: number; error?: string },
  now: Date = new Date(),
): Promise<void> {
  await withStorageLock(CAMPAIGN_LOCK, async () => {
    const campaign = await getMailCampaignById(id);
    if (!campaign?.recurrence) return;

    const state: RecurrenceState = campaign.recurrenceState
      ?? { status: 'active', occurrences: [] };
    const scheduledFor = campaign.sendAt ?? now.toISOString();

    const occurrence: RecurrenceOccurrence = {
      scheduledFor,
      ranAt: now.toISOString(),
      status: outcome.sent === 0 && outcome.failed > 0 ? 'failed'
        : outcome.failed > 0 ? 'partially_failed'
          : outcome.total === 0 ? 'skipped' : 'sent',
      total: outcome.total,
      sent: outcome.sent,
      failed: outcome.failed,
      suppressed: outcome.suppressed,
      error: outcome.error,
    };

    /* Newest first, bounded. History is immutable: an occurrence is appended
       and never rewritten, so editing the campaign later cannot change what a
       past run actually did. */
    const occurrences = [occurrence, ...(state.occurrences ?? [])]
      .slice(0, MAX_OCCURRENCE_HISTORY);

    /* From NOW - see the note above about replaying missed occurrences. */
    const next = state.status === 'active'
      ? nextOccurrence(campaign.recurrence, now)
      : null;

    const nextState: RecurrenceState = {
      ...state,
      lastRunAt: now.toISOString(),
      lastOccurrenceKey: occurrenceKey(id, scheduledFor),
      occurrences,
      /* No further occurrence means the schedule has run out - its end date
         passed, or the calendar offers no more matching dates. */
      status: state.status === 'active' && !next ? 'completed' : state.status,
      nextRunAt: next ? next.toISOString() : null,
    };

    await writeCampaign({
      ...campaign,
      /* Back to `scheduled` so the existing runner finds it again. A recurring
         campaign is never "sent" as a whole; each OCCURRENCE has a status. */
      status: next ? 'scheduled' : 'sent',
      sendAt: next ? next.toISOString() : undefined,
      claimToken: undefined,
      recurrenceState: nextState,
    });
  });
}

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
    /* A paused, cancelled or completed recurrence is never picked up, even
       though its `sendAt` may still be in the past. */
    && (!c.recurrence || c.recurrenceState?.status === 'active')
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
        suppressed: r.suppressed,
        error: r.error,
      });

      /* The ONLY recurrence-specific step in the runner: record what this
         occurrence did and schedule the next. The send above went through the
         unchanged path - same resolver, same suppression, same renderer, same
         provider, same outbox, same retry rules. */
      if (campaign.recurrence) {
        await advanceRecurringCampaign(campaign.id, {
          total: r.total, sent: r.sent, failed: r.failed,
          suppressed: r.suppressed ?? 0, error: r.error,
        }).catch((e) => {
          console.error('[mail-campaigns] could not advance recurrence', campaign.id, e);
        });
      }
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
