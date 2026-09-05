import { promises as fs } from 'fs';
import path from 'path';
import { getAppStateKey, getDbPool, isDatabaseConfigured, readAppState, writeAppState } from '@/lib/server/database';
import { reconcileHistoryRows, selectAllHistoryRows } from '@/lib/server/db/history-rows';
import { reconcileFileTransferRows, selectAllFileTransferRows } from '@/lib/server/db/file-transfers-rows';
import { bulkReplaceUserProfileRows, selectAllUserProfileRows } from '@/lib/server/db/user-profiles-rows';
import { bulkReplaceBillingRows, selectAllBillingRows } from '@/lib/server/db/billing-rows';
import { bulkReplaceEmailOutboxRows, selectEmailOutboxRows } from '@/lib/server/db/email-outbox-rows';
import { bulkReplaceDocWordRows, selectAllDocWordRows } from '@/lib/server/db/docword-rows';
import { reconcileUserRows, selectAllUserRows } from '@/lib/server/db/users-rows';
import { bulkReplaceServiceReviewRows, selectAllServiceReviewRows } from '@/lib/server/db/service-reviews-rows';
import { bulkReplaceTemplateMarketplaceItemRows, selectAllTemplateMarketplaceItemRows } from '@/lib/server/db/template-marketplace-items-rows';
import { getSettingsValueFromRepository, saveSettingsValueToRepository } from '@/lib/server/repositories';

export const dataDir = path.join(process.cwd(), 'data');
export const customTemplatesPath = path.join(dataDir, 'custom', 'templates.json');
export const historyFilePath = path.join(dataDir, 'history.json');
export const usersPath = path.join(dataDir, 'users.json');
export const mailSettingsPath = path.join(dataDir, 'mail-settings.json');
export const emailOutboxPath = path.join(dataDir, 'email-outbox.json');
export const authSettingsPath = path.join(dataDir, 'auth-settings.json');
export const automationSettingsPath = path.join(dataDir, 'automation-settings.json');
export const collaborationSettingsPath = path.join(dataDir, 'collaboration-settings.json');
export const signatureSettingsPath = path.join(dataDir, 'signature-settings.json');
export const roleProfilesPath = path.join(dataDir, 'role-profiles.json');
export const dropdownOptionsPath = path.join(dataDir, 'dropdown-options.json');
export const themeSettingsPath = path.join(dataDir, 'theme-settings.json');
export const platformConfigPath = path.join(dataDir, 'platform-config.json');
export const landingSettingsPath = path.join(dataDir, 'landing-settings.json');
export const navAnnouncementSettingsPath = path.join(dataDir, 'nav-announcement-settings.json');
export const contactRequestsPath = path.join(dataDir, 'contact-requests.json');
export const saasPlansPath = path.join(dataDir, 'saas-plans.json');
export const businessSettingsPath = path.join(dataDir, 'business-settings.json');
export const parserHistoryPath = path.join(dataDir, 'parser-history.json');
export const fileTransfersPath = path.join(dataDir, 'file-transfers.json');
export const fileDirectoryLockersPath = path.join(dataDir, 'file-directory-lockers.json');
export const fileManagerFoldersPath = path.join(dataDir, 'file-manager-folders.json');
export const billingTransactionsPath = path.join(dataDir, 'billing-transactions.json');
export const couponCodesPath = path.join(dataDir, 'coupons.json');
export const referralProgramPath = path.join(dataDir, 'referrals.json');
export const gigsSafetyReportsPath = path.join(dataDir, 'gigs-safety-reports.json');
export const internalMailboxPath = path.join(dataDir, 'internal-mailbox.json');
export const dealRoomsPath = path.join(dataDir, 'deal-rooms.json');
export const meetingRoomsPath = path.join(dataDir, 'meeting-rooms.json');
export const notificationStatePath = path.join(dataDir, 'notifications.json');
export const userActivityPath = path.join(dataDir, 'user-activity.json');
export const userFeedbackPath = path.join(dataDir, 'user-feedback.json');
export const adminAuditPath = path.join(dataDir, 'admin-audit.json');
export const hiringJobsPath = path.join(dataDir, 'hiring-jobs.json');
export const hiringApplicationsPath = path.join(dataDir, 'hiring-applications.json');
export const gigsPath = path.join(dataDir, 'gigs.json');
export const gigConnectionsPath = path.join(dataDir, 'gig-connections.json');
export const gigBidsPath = path.join(dataDir, 'gig-bids.json');
export const docrudiansPath = path.join(dataDir, 'docrudians.json');
export const virtualIdsPath = path.join(dataDir, 'virtual-ids.json');
export const certificatesPath = path.join(dataDir, 'certificates.json');
export const docwordDocumentsPath = path.join(dataDir, 'docword-documents.json');
export const blogPostsPath = path.join(dataDir, 'blog-posts.json');
export const adBannersPath = path.join(dataDir, 'ad-banners.json');
/* Sponsored advertising: campaigns, their impression/click counters, and the
   persistent feed/recommendation configuration Superadmin edits. */
export const sponsoredAdsPath = path.join(dataDir, 'sponsored-ads.json');
export const adEventsPath = path.join(dataDir, 'ad-events.json');
export const feedConfigPath = path.join(dataDir, 'feed-config.json');
/** Idempotency ledger for mention side effects (comment id + mentioned user). */
export const mentionDeliveriesPath = path.join(dataDir, 'mention-deliveries.json');
export const homepageConfigPath = path.join(dataDir, 'homepage-config.json');
/* Super Admin SEO Manager settings. Same three-tier resolution as its peers:
   row adapter -> app_state (MongoDB) -> local JSON in development. */
export const mailDraftsPath = path.join(dataDir, 'mail-drafts.json');
export const mailTemplatesPath = path.join(dataDir, 'mail-templates.json');
export const systemEmailsPath = path.join(dataDir, 'system-emails.json');
export const mailSuppressionPath = path.join(dataDir, 'mail-suppression.json');
export const providerEventsPath = path.join(dataDir, 'mail-provider-events.json');
export const seoSettingsPath = path.join(dataDir, 'seo-settings.json');
/* The staged copy an admin is editing. The PUBLISHED file above is the only
   thing the public site ever reads, so a draft can be saved and previewed
   without touching production metadata. */
export const seoDraftSettingsPath = path.join(dataDir, 'seo-settings-draft.json');
export const webTelemetryPath = path.join(dataDir, 'web-telemetry.json');
export const securityBlocklistPath = path.join(dataDir, 'security-blocklist.json');
export const knowledgeBasePath = path.join(dataDir, 'knowledge-base.json');
export const webSourcesPath = path.join(dataDir, 'web-sources.json');
export const resumeDirectoryPath = path.join(dataDir, 'resume-directory.json');
export const earlyAccessFeaturesPath = path.join(dataDir, 'early-access-features.json');
export const earlyAccessWaitlistPath = path.join(dataDir, 'early-access-waitlist.json');
export const earlyAccessWishesPath = path.join(dataDir, 'early-access-wishes.json');
export const earlyAccessOtpsPath = path.join(dataDir, 'early-access-otps.json');
export const resumeConnectPurchasesPath = path.join(dataDir, 'resume-connect-purchases.json');
export const resumeConnectLeadsPath = path.join(dataDir, 'resume-connect-leads.json');
export const gigConnectPurchasesPath = path.join(dataDir, 'gig-connect-purchases.json');
export const templateMarketplaceItemsPath = path.join(dataDir, 'template-marketplace-items.json');
export const templateMarketplacePurchasesPath = path.join(dataDir, 'template-marketplace-purchases.json');
export const templateMarketplaceReviewsPath = path.join(dataDir, 'template-marketplace-reviews.json');
export const templateMarketplaceIncomePath = path.join(dataDir, 'template-marketplace-income.json');
export const templateMarketplaceWithdrawalsPath = path.join(dataDir, 'template-marketplace-withdrawals.json');
export const mailCampaignsPath = path.join(dataDir, 'mail-campaigns.json');
export const mailPoliciesPath = path.join(dataDir, 'mail-policies.json');
export const otpSessionsPath = path.join(dataDir, 'otp-sessions.json');
/* Signups that have been PAID FOR with a verification code but not yet
   redeemed. Nothing in here is an account: no user row, no profile, no
   session — only what is needed to create one the moment the emailed code
   comes back. See lib/server/pending-signups.ts. */
export const pendingSignupsPath = path.join(dataDir, 'pending-signups.json');
export const homepageAiChatsPath = path.join(dataDir, 'homepage-ai-chats.json');
export const userProfilesPath = path.join(dataDir, 'user-profiles.json');
export const followsPath = path.join(dataDir, 'follows.json');
/** Community Trends: the trend list plus the per-user vote ledger (lib/server/trends.ts). */
export const trendsPath = path.join(dataDir, 'trends.json');
export const upraisedPath = path.join(dataDir, 'upraised.json');
export const socialEventsPath = path.join(dataDir, 'social-events.json');
export const messagesPath = path.join(dataDir, 'messages.json');
export const servicesPath = path.join(dataDir, 'services.json');
export const projectsPath = path.join(dataDir, 'projects.json');
export const serviceBookingsPath = path.join(dataDir, 'service-bookings.json');
export const serviceReviewsPath = path.join(dataDir, 'service-reviews.json');
export const serviceAnalyticsPath = path.join(dataDir, 'service-analytics.json');
export const catalogueSettingsPath = path.join(dataDir, 'catalogue-settings.json');
export const publicFaceApplicationsPath = path.join(dataDir, 'public-face-applications.json');
export const publicFaceOtpsPath = path.join(dataDir, 'public-face-otps.json');
export const presencePath = path.join(dataDir, 'presence.json');
export const behaviorEventsPath = path.join(dataDir, 'behavior-events.json');
export const recentsPath = path.join(dataDir, 'recents.json');
export const publishRegistrationsPath = path.join(dataDir, 'publish-registrations.json');
export const superAdminConfigPath = path.join(dataDir, 'super-admin-config.json');
export const integrationsConfigPath = path.join(dataDir, 'integrations-config.json');
export const businessReviewsPath = path.join(dataDir, 'business-reviews.json');
export const businessPagesPath = path.join(dataDir, 'business-pages.json');

type DbAdapter = {
  read: () => Promise<unknown>;
  write: (value: unknown) => Promise<void>;
};

let dbAdaptersCache: Map<string, DbAdapter> | null = null;

function getDbAdapters(): Map<string, DbAdapter> {
  if (dbAdaptersCache) return dbAdaptersCache;
  const map = new Map<string, DbAdapter>();
  map.set(historyFilePath, {
    read: () => selectAllHistoryRows(),
    write: (value) => reconcileHistoryRows((value as never) || []),
  });
  map.set(fileTransfersPath, {
    read: () => selectAllFileTransferRows(),
    write: (value) => reconcileFileTransferRows((value as never) || []),
  });
  map.set(userProfilesPath, {
    read: () => selectAllUserProfileRows(),
    write: (value) => bulkReplaceUserProfileRows((value as never) || {}),
  });
  map.set(billingTransactionsPath, {
    read: () => selectAllBillingRows(),
    write: (value) => bulkReplaceBillingRows((value as never) || []),
  });
  map.set(emailOutboxPath, {
    read: async () => ({ events: await selectEmailOutboxRows(500) }),
    write: (value) => {
      const state = (value as { events?: unknown[] }) || {};
      return bulkReplaceEmailOutboxRows((state.events as never) || []);
    },
  });
  map.set(docwordDocumentsPath, {
    read: () => selectAllDocWordRows(),
    write: (value) => bulkReplaceDocWordRows((value as never) || []),
  });
  map.set(usersPath, {
    read: () => selectAllUserRows(),
    // Use diff-based reconcile instead of DELETE-all-reinsert.
    write: (value) => reconcileUserRows((value as never) || []),
  });
  map.set(serviceReviewsPath, {
    read: () => selectAllServiceReviewRows(),
    write: (value) => bulkReplaceServiceReviewRows((value as never) || []),
  });
  map.set(templateMarketplaceItemsPath, {
    read: () => selectAllTemplateMarketplaceItemRows(),
    write: (value) => bulkReplaceTemplateMarketplaceItemRows((value as never) || []),
  });

  // Settings paths — stored per-key in settings_store rather than as app_state blobs.
  for (const [path, scope, key] of [
    [authSettingsPath, 'auth', 'settings'],
    [themeSettingsPath, 'theme', 'settings'],
    [automationSettingsPath, 'automation', 'workflow'],
    [collaborationSettingsPath, 'collaboration', 'settings'],
    [signatureSettingsPath, 'signature', 'settings'],
    [landingSettingsPath, 'landing', 'settings'],
    [platformConfigPath, 'platform', 'config'],
  ] as const) {
    map.set(path, {
      read: () => getSettingsValueFromRepository(scope, key, null),
      write: (value) => saveSettingsValueToRepository(scope, key, value),
    });
  }

  dbAdaptersCache = map;
  return map;
}

export async function ensureDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Per-read tracing. Every storage read used to log a line; on a busy route that
 * is synchronous stdout work on the request path for no production benefit.
 * Set DOCRUD_TRACE_STORAGE=1 to get the old behaviour back when debugging.
 */
const TRACE_STORAGE = process.env.DOCRUD_TRACE_STORAGE === '1';
function trace(message: string) {
  if (TRACE_STORAGE) console.log(message);
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  const label = path.basename(filePath);
  if (getDbPool()) {
    const adapter = getDbAdapters().get(filePath);
    if (adapter) {
      try {
        const value = await adapter.read();
        const count = Array.isArray(value) ? (value as unknown[]).length : typeof value === 'object' && value !== null ? Object.keys(value as object).length : '?';
        trace(`[storage] ${label} → DB row-adapter (${count} items)`);
        return value as T;
      } catch (error) {
        console.error(`[storage] ${label} → DB row-adapter FAILED`, error);
        return fallback;
      }
    }
    trace(`[storage] ${label} → getDbPool() set but NO adapter, falling to app_state`);
  }

  const appStateKey = getAppStateKey(filePath);

  if (isDatabaseConfigured()) {
    try {
      const databaseValue = await readAppState<T>(appStateKey);
      if (databaseValue !== null) {
        const count = Array.isArray(databaseValue) ? (databaseValue as unknown[]).length : '?';
        trace(`[storage] ${label} → app_state key=${appStateKey} (${count} items)`);
        return databaseValue;
      }
      trace(`[storage] ${label} → app_state key=${appStateKey} not found, returning fallback`);
    } catch (error) {
      console.error(`[storage] ${label} → app_state read FAILED`, error);
    }
    return fallback;
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as T;
    const count = Array.isArray(parsed) ? (parsed as unknown[]).length : '?';
    trace(`[storage] ${label} → JSON file (${count} items)`);
    return parsed;
  } catch {
    trace(`[storage] ${label} → JSON file not found, returning fallback`);
    return fallback;
  }
}

/* ── Per-path serialisation ────────────────────────────────────────────────

   Read-modify-write over a whole JSON document is not safe to run
   concurrently: two callers read the same state, both compute a new version
   from it, and the second write erases the first. Every store built on
   `readJsonFile`/`writeJsonFile` has this shape.

   `withStorageLock` serialises operations that share a key, so a read and its
   dependent write cannot interleave with another caller's. It is per-process
   and deliberately simple; it does not coordinate across serverless instances,
   which is why callers that need cross-instance safety (campaign claiming)
   still verify what they wrote. */
const storageLocks = new Map<string, Promise<unknown>>();

export function withStorageLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = storageLocks.get(key) ?? Promise.resolve();
  /* `.then(op, op)` so a rejected predecessor still releases the lock. */
  const run = previous.then(operation, operation);
  storageLocks.set(key, run.then(() => undefined, () => undefined));
  return run;
}

/** Monotonic per-process counter, so concurrent temp files never collide. */
let tmpCounter = 0;

export async function writeJsonFile<T>(filePath: string, data: T) {
  if (getDbPool()) {
    const adapter = getDbAdapters().get(filePath);
    if (adapter) {
      try {
        await adapter.write(data as unknown);
        return;
      } catch (error) {
        console.error(`Failed to write row adapter for ${filePath}`, error);
        throw error;
      }
    }
  }

  if (isDatabaseConfigured()) {
    try {
      await writeAppState(getAppStateKey(filePath), data);
      return;
    } catch (error) {
      console.error(`Failed to write app state to database for ${getAppStateKey(filePath)}`, error);
      throw error;
    }
  }

  try {
    await ensureDirectory(filePath);
    /* Write to a sibling temp file and rename over the target. `rename` is
       atomic within a filesystem, so a crash or restart mid-write leaves the
       previous complete file rather than a truncated one — and a truncated
       file would parse-fail, fall back to empty, and be overwritten with
       nothing on the next write. The temp file is in the same directory so
       the rename never crosses a filesystem boundary. */
    /* The suffix must be unique PER CALL, not per millisecond: two concurrent
       writes to the same path in the same millisecond would otherwise pick the
       same temp name, and whichever renamed second would fail with ENOENT
       because the first had already moved the file away. */
    tmpCounter += 1;
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${tmpCounter.toString(36)}`
      + `${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmpPath, filePath);
    } catch (error) {
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code);
      if (code === 'EROFS' || code === 'EPERM' || code === 'EACCES') {
        throw new Error('Persistent writes are not available on this deployment. Configure a database or hosted key-value store for production workspace creation.');
      }
    }
    throw error;
  }
}
