/**
 * DEV ONLY — triggers every email type to a test address.
 * Remove this route before deploying to production.
 * Usage: GET /api/dev/trigger-all-emails?secret=devtest
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  sendAccountActionOtpEmail,
  sendAccountDeletedEmail,
  sendAccountReactivatedEmail,
  sendDeactivationConfirmEmail,
  sendDeactivationWarningEmail,
} from '@/lib/server/account-emails';
import { sendNotificationEmail } from '@/lib/server/notification-emails';
import {
  sendPublicFaceAdminNotificationEmail,
  sendPublicFaceApplicationReceivedEmail,
  sendPublicFaceApprovedEmail,
  sendPublicFaceOtpEmail,
  sendPublicFaceRejectedEmail,
} from '@/lib/server/public-face-emails';
import { buildDocumentDeliveryEmail } from '@/lib/server/document-delivery-email';
import { buildSignedReceiptEmail } from '@/lib/server/signed-receipt-email';
import { sendTrackedMail } from '@/lib/server/mailer';
import { getPublicAppBaseUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TO = 'abc123@yopmail.com';
const NAME = 'Test User';

type EmailResult = { name: string; status: 'sent' | 'skipped' | 'failed'; error?: string };

async function run(name: string, fn: () => Promise<unknown>): Promise<EmailResult> {
  try {
    const result = await fn() as { skipped?: boolean } | undefined;
    const skipped = result && typeof result === 'object' && result.skipped === true;
    return { name, status: skipped ? 'skipped' : 'sent' };
  } catch (err) {
    return { name, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== 'devtest') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const origin = getPublicAppBaseUrl().replace(/\/$/, '');
  const now = new Date().toISOString();
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const mockEntry = {
    id: 'mock-history-001',
    shareId: 'mock-share-001',
    shareUrl: '/documents/mock-share-001',
    referenceNumber: 'REF-2024-001',
    templateId: 'tpl-001',
    templateName: 'Sample Agreement',
    category: 'legal',
    data: {},
    generatedBy: 'system',
    generatedAt: now,
    documentSourceType: 'generated' as const,
    sharePassword: 'DEMO99',
    shareRequiresPassword: true,
    shareAccessPolicy: 'standard' as const,
    recipientSignatureRequired: true,
    recipientAccess: 'view' as const,
    recipientSignerName: 'Test Signer',
    recipientSignerEmail: TO,
    recipientSignedAt: now,
    recipientSignedIp: '1.2.3.4',
    recipientSignedLocationLabel: 'Mumbai, India',
  };

  const results: EmailResult[] = await Promise.all([
    // ── Account lifecycle ────────────────────────────────────────
    run('account-otp-deactivate', () =>
      sendAccountActionOtpEmail({ to: TO, name: NAME, otp: '483920', action: 'deactivate', expiresAt: deadline })
    ),
    run('account-otp-delete', () =>
      sendAccountActionOtpEmail({ to: TO, name: NAME, otp: '719204', action: 'delete', expiresAt: deadline })
    ),
    run('account-deactivated-confirm', () =>
      sendDeactivationConfirmEmail({ to: TO, name: NAME, deadline })
    ),
    run('account-deactivation-warning', () =>
      sendDeactivationWarningEmail({ to: TO, name: NAME, deadline })
    ),
    run('account-deleted', () =>
      sendAccountDeletedEmail({ to: TO, name: NAME })
    ),
    run('account-reactivated', () =>
      sendAccountReactivatedEmail({ to: TO, name: NAME })
    ),

    // ── Social / notification ────────────────────────────────────
    run('notification-follow', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'follow', actorName: 'Alice Dev', actorId: 'alice-id' })
    ),
    run('notification-like', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'like', actorName: 'Bob Tester', resourceTitle: 'My First Post', href: '/' })
    ),
    run('notification-comment', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'comment', actorName: 'Carol QA', resourceTitle: 'Product Launch Memo', excerpt: 'Great document, very clear!' })
    ),
    run('notification-mention', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'mention', actorName: 'Dave PM', resourceTitle: 'Q3 Review', excerpt: 'Cc-ing @TestUser for approval.' })
    ),
    run('notification-gig-applied', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'gig_applied', actorName: 'Eve Freelancer', resourceTitle: 'Logo Design Project' })
    ),
    run('notification-message', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'message', actorName: 'Frank Support', excerpt: 'Hey, just following up on your question about the API.' })
    ),
    run('notification-profile-view', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'profile_view', actorName: 'Grace Recruiter' })
    ),
    run('notification-document-viewed', () =>
      sendNotificationEmail({ to: TO, recipientName: NAME, type: 'document_viewed', actorName: 'Henry Client', resourceTitle: 'NDA 2024' })
    ),

    // ── Public Face ──────────────────────────────────────────────
    run('public-face-otp', () =>
      sendPublicFaceOtpEmail({ to: TO, name: NAME, otp: '550341', expiresAt: deadline })
    ),
    run('public-face-application-received', () =>
      sendPublicFaceApplicationReceivedEmail({ to: TO, name: NAME, category: 'content_creator', applicationId: 'pf-app-mock-0001' })
    ),
    run('public-face-approved', () =>
      sendPublicFaceApprovedEmail({ to: TO, name: NAME, category: 'content_creator' })
    ),
    run('public-face-rejected', () =>
      sendPublicFaceRejectedEmail({ to: TO, name: NAME, category: 'content_creator', adminNote: 'Insufficient public presence at this time. Please reapply after 3 months.' })
    ),
    run('public-face-admin-notification', () =>
      sendPublicFaceAdminNotificationEmail({
        adminEmail: TO,
        applicantName: 'Test Applicant',
        applicantEmail: 'applicant@example.com',
        category: 'journalist',
        applicationId: 'pf-app-mock-0002',
        adminPanelUrl: `${origin}/admin/public-face`,
      })
    ),

    // ── Document delivery ────────────────────────────────────────
    run('document-delivery-view-only', () => {
      const tpl = buildDocumentDeliveryEmail({
        origin,
        entry: { ...mockEntry, recipientSignatureRequired: false },
        subject: 'Your document is ready',
        senderEmail: 'sender@example.com',
        senderNote: 'Please review the attached document at your earliest convenience.',
      });
      return sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'document_delivery',
        to: TO,
        subject: 'Your document is ready',
        preheader: tpl.preheader,
        text: tpl.text,
        html: tpl.html,
        origin,
        sentBy: 'dev-trigger',
      });
    }),
    run('document-delivery-sign-request', () => {
      const tpl = buildDocumentDeliveryEmail({
        origin,
        entry: mockEntry,
        subject: 'Signature requested — Sample Agreement',
        senderEmail: 'sender@example.com',
        senderNote: 'Kindly sign this agreement before the end of the week.',
      });
      return sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'document_delivery',
        to: TO,
        subject: 'Signature requested — Sample Agreement',
        preheader: tpl.preheader,
        text: tpl.text,
        html: tpl.html,
        origin,
        sentBy: 'dev-trigger',
      });
    }),

    // ── Signing receipts ─────────────────────────────────────────
    run('signing-receipt-signer', () => {
      const receipt = buildSignedReceiptEmail({
        origin,
        entry: mockEntry,
        recipientType: 'signer',
        signerEmail: TO,
        senderEmail: 'sender@example.com',
        senderNote: 'Thank you for signing.',
      });
      return sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'system',
        to: TO,
        subject: receipt.subject,
        preheader: receipt.preheader,
        text: receipt.text,
        html: receipt.html,
        origin,
        sentBy: 'dev-trigger',
        metadata: { event: 'signer_receipt' },
      });
    }),
    run('signing-receipt-sender', () => {
      const receipt = buildSignedReceiptEmail({
        origin,
        entry: mockEntry,
        recipientType: 'sender',
        signerEmail: TO,
        senderEmail: TO,
      });
      return sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'system',
        to: TO,
        subject: receipt.subject,
        preheader: receipt.preheader,
        text: receipt.text,
        html: receipt.html,
        origin,
        sentBy: 'dev-trigger',
        metadata: { event: 'sender_receipt' },
      });
    }),

    // ── Signing invitation / reminder (plain tracked mail) ───────
    run('signing-invitation', () =>
      sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'document_delivery',
        to: TO,
        subject: 'You have been invited to sign: Sample Agreement',
        preheader: 'Signature requested for Sample Agreement.',
        text: `Hi ${NAME},\n\nYou've been invited to sign "Sample Agreement".\nOpen your personal signing link:\n${origin}/documents/mock-share-001\n\nPassword: DEMO99\n\nThis link is personal and unique to you.`,
        origin,
        sentBy: 'dev-trigger',
        metadata: { event: 'signing_invitation' },
      })
    ),
    run('signing-reminder', () =>
      sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'document_delivery',
        to: TO,
        subject: 'Reminder: Please sign Sample Agreement',
        preheader: 'Your signature is still pending on Sample Agreement.',
        text: `Hi ${NAME},\n\nThis is a friendly reminder that your signature is still pending on "Sample Agreement".\n\nOpen your signing link:\n${origin}/documents/mock-share-001\n\nIf you have any questions, reply to this email.`,
        origin,
        sentBy: 'dev-trigger',
        metadata: { event: 'signing_reminder' },
      })
    ),

    // ── Onboarding OTP ───────────────────────────────────────────
    run('onboarding-otp', () =>
      sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'system',
        to: TO,
        subject: '293847 — Your Docrud verification code',
        preheader: 'Your OTP is 293847. Valid for 10 minutes.',
        text: 'Your Docrud email verification code is: 293847\nValid for 10 minutes. Do not share this code.',
        origin,
        sentBy: 'system',
        metadata: { event: 'onboarding_otp' },
      })
    ),

    // ── Drive file share ─────────────────────────────────────────
    run('drive-file-share', () =>
      sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'document_delivery',
        to: TO,
        subject: 'A file has been shared with you',
        preheader: 'sender@example.com shared "Project Brief.pdf" with you.',
        text: `Hi ${NAME},\n\nsender@example.com has shared a file with you on Docrud Drive.\n\nFile: Project Brief.pdf\n\nOpen file: ${origin}/drive/shared/mock-file-001\n\nThis link grants you view access.`,
        origin,
        sentBy: 'dev-trigger',
        metadata: { event: 'drive_file_share' },
      })
    ),
  ]);

  const sent = results.filter((r) => r.status === 'sent').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({
    summary: { total: results.length, sent, skipped, failed },
    recipient: TO,
    results,
  });
}
