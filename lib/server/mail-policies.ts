import { mailPoliciesPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export type MailPolicyKey =
  | 'document_delivery'
  | 'collection_request'
  | 'document_signed_owner_notify'
  | 'admin_user_message'
  | 'smtp_test'
  | 'bulk_campaign'
  | 'otp_verification'
  | 'individual_welcome'
  | 'business_welcome'
  | 'billing_reminders'
  | 'billing_receipts'
  | 'storage_alerts'
  | 'gigs_notifications'
  | 'gigs_safety'
  | 'docrud_go_welcome'
  | 'social_notifications'
  | 'public_face_notifications'
  | 'business_verification'
  | 'feed_moderation'
  /* Phase 9: application status updates sent to a candidate. */
  | 'hiring_notifications';

export type MailPolicies = Record<MailPolicyKey, boolean>;

export const defaultMailPolicies: MailPolicies = {
  hiring_notifications: true,
  document_delivery: true,
  collection_request: true,
  document_signed_owner_notify: true,
  admin_user_message: true,
  smtp_test: true,
  bulk_campaign: true,
  otp_verification: true,
  individual_welcome: true,
  business_welcome: true,
  billing_reminders: true,
  billing_receipts: true,
  storage_alerts: true,
  gigs_notifications: true,
  gigs_safety: true,
  docrud_go_welcome: true,
  social_notifications: true,
  public_face_notifications: true,
  business_verification: true,
  feed_moderation: true,
};

export async function getMailPolicies(): Promise<MailPolicies> {
  const stored = await readJsonFile<Partial<MailPolicies>>(mailPoliciesPath, defaultMailPolicies);
  return { ...defaultMailPolicies, ...(stored || {}) };
}

export async function saveMailPolicies(next: MailPolicies) {
  const cleaned: MailPolicies = {
    document_delivery: Boolean(next.document_delivery),
    collection_request: Boolean(next.collection_request),
    document_signed_owner_notify: Boolean(next.document_signed_owner_notify),
    admin_user_message: Boolean(next.admin_user_message),
    smtp_test: Boolean(next.smtp_test),
    bulk_campaign: Boolean(next.bulk_campaign),
    otp_verification: Boolean(next.otp_verification),
    individual_welcome: Boolean(next.individual_welcome),
    business_welcome: Boolean(next.business_welcome),
    billing_reminders: Boolean(next.billing_reminders),
    billing_receipts: Boolean(next.billing_receipts),
    storage_alerts: Boolean(next.storage_alerts),
    gigs_notifications: Boolean(next.gigs_notifications),
    gigs_safety: Boolean(next.gigs_safety),
    docrud_go_welcome: Boolean(next.docrud_go_welcome),
    social_notifications: Boolean(next.social_notifications),
    public_face_notifications: Boolean(next.public_face_notifications),
    business_verification: Boolean(next.business_verification),
    feed_moderation: Boolean(next.feed_moderation),
    hiring_notifications: Boolean(next.hiring_notifications),
  };
  await writeJsonFile(mailPoliciesPath, cleaned);
}
