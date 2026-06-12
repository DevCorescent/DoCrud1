/**
 * Dev script — fires every email type to abc123@yopmail.com
 * Run: npx tsx --tsconfig tsconfig.json scripts/trigger-all-emails.ts
 */

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

const TO = 'abc123@yopmail.com';
const NAME = 'Test User';

async function run(label: string, fn: () => Promise<unknown>) {
  process.stdout.write(`  → ${label} ... `);
  try {
    const r = await fn() as { skipped?: boolean } | undefined;
    const skipped = r && typeof r === 'object' && r.skipped === true;
    console.log(skipped ? 'SKIPPED (policy off)' : 'OK');
    return 'ok';
  } catch (e) {
    console.log(`FAILED — ${e instanceof Error ? e.message : e}`);
    return 'fail';
  }
}

async function main() {
  const origin = getPublicAppBaseUrl().replace(/\/$/, '') || 'http://localhost:3001';
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
    data: {} as Record<string, string>,
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

  console.log(`\nFiring all email types → ${TO}\n`);

  const results: string[] = [];

  // ── Account lifecycle ──────────────────────────────────────────────────
  console.log('Account lifecycle:');
  results.push(await run('account-otp-deactivate', () =>
    sendAccountActionOtpEmail({ to: TO, name: NAME, otp: '483920', action: 'deactivate', expiresAt: deadline })));
  results.push(await run('account-otp-delete', () =>
    sendAccountActionOtpEmail({ to: TO, name: NAME, otp: '719204', action: 'delete', expiresAt: deadline })));
  results.push(await run('account-deactivated-confirm', () =>
    sendDeactivationConfirmEmail({ to: TO, name: NAME, deadline })));
  results.push(await run('account-deactivation-warning', () =>
    sendDeactivationWarningEmail({ to: TO, name: NAME, deadline })));
  results.push(await run('account-deleted', () =>
    sendAccountDeletedEmail({ to: TO, name: NAME })));
  results.push(await run('account-reactivated', () =>
    sendAccountReactivatedEmail({ to: TO, name: NAME })));

  // ── Notification / Social ──────────────────────────────────────────────
  console.log('\nSocial notifications:');
  results.push(await run('notification-follow', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'follow', actorName: 'Alice Dev', actorId: 'alice-id' })));
  results.push(await run('notification-like', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'like', actorName: 'Bob Tester', resourceTitle: 'My First Post', href: '/' })));
  results.push(await run('notification-comment', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'comment', actorName: 'Carol QA', resourceTitle: 'Product Launch Memo', excerpt: 'Great document, very clear!' })));
  results.push(await run('notification-mention', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'mention', actorName: 'Dave PM', resourceTitle: 'Q3 Review', excerpt: 'Cc-ing @TestUser for approval.' })));
  results.push(await run('notification-gig-applied', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'gig_applied', actorName: 'Eve Freelancer', resourceTitle: 'Logo Design Project' })));
  results.push(await run('notification-message', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'message', actorName: 'Frank Support', excerpt: 'Hey, just following up on your question about the API.' })));
  results.push(await run('notification-profile-view', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'profile_view', actorName: 'Grace Recruiter' })));
  results.push(await run('notification-document-viewed', () =>
    sendNotificationEmail({ to: TO, recipientName: NAME, type: 'document_viewed', actorName: 'Henry Client', resourceTitle: 'NDA 2024' })));

  // ── Public Face ────────────────────────────────────────────────────────
  console.log('\nPublic Face:');
  results.push(await run('public-face-otp', () =>
    sendPublicFaceOtpEmail({ to: TO, name: NAME, otp: '550341', expiresAt: deadline })));
  results.push(await run('public-face-application-received', () =>
    sendPublicFaceApplicationReceivedEmail({ to: TO, name: NAME, category: 'content_creator', applicationId: 'pf-app-mock-0001' })));
  results.push(await run('public-face-approved', () =>
    sendPublicFaceApprovedEmail({ to: TO, name: NAME, category: 'content_creator' })));
  results.push(await run('public-face-rejected', () =>
    sendPublicFaceRejectedEmail({ to: TO, name: NAME, category: 'content_creator', adminNote: 'Insufficient public presence. Please reapply in 3 months.' })));
  results.push(await run('public-face-admin-notification', () =>
    sendPublicFaceAdminNotificationEmail({
      adminEmail: TO,
      applicantName: 'Test Applicant',
      applicantEmail: 'applicant@example.com',
      category: 'journalist',
      applicationId: 'pf-app-mock-0002',
      adminPanelUrl: `${origin}/admin/public-face`,
    })));

  // ── Document delivery ──────────────────────────────────────────────────
  console.log('\nDocument delivery:');
  results.push(await run('document-delivery-view-only', () => {
    const tpl = buildDocumentDeliveryEmail({
      origin,
      entry: { ...mockEntry, recipientSignatureRequired: false },
      subject: 'Your document is ready',
      senderEmail: 'sender@example.com',
      senderNote: 'Please review the attached document at your earliest convenience.',
    });
    return sendTrackedMail({
      policyKey: 'otp_verification', typeLabel: 'document_delivery',
      to: TO, subject: 'Your document is ready',
      preheader: tpl.preheader, text: tpl.text, html: tpl.html,
      origin, sentBy: 'dev-trigger',
    });
  }));
  results.push(await run('document-delivery-sign-request', () => {
    const tpl = buildDocumentDeliveryEmail({
      origin, entry: mockEntry,
      subject: 'Signature requested — Sample Agreement',
      senderEmail: 'sender@example.com',
      senderNote: 'Kindly sign this agreement before end of week.',
    });
    return sendTrackedMail({
      policyKey: 'otp_verification', typeLabel: 'document_delivery',
      to: TO, subject: 'Signature requested — Sample Agreement',
      preheader: tpl.preheader, text: tpl.text, html: tpl.html,
      origin, sentBy: 'dev-trigger',
    });
  }));

  // ── Signing receipts ───────────────────────────────────────────────────
  console.log('\nSigning receipts:');
  results.push(await run('signing-receipt-signer', () => {
    const r = buildSignedReceiptEmail({ origin, entry: mockEntry, recipientType: 'signer', signerEmail: TO, senderEmail: 'sender@example.com', senderNote: 'Thank you for signing.' });
    return sendTrackedMail({ policyKey: 'otp_verification', typeLabel: 'system', to: TO, subject: r.subject, preheader: r.preheader, text: r.text, html: r.html, origin, sentBy: 'dev-trigger' });
  }));
  results.push(await run('signing-receipt-sender', () => {
    const r = buildSignedReceiptEmail({ origin, entry: mockEntry, recipientType: 'sender', signerEmail: TO, senderEmail: TO });
    return sendTrackedMail({ policyKey: 'otp_verification', typeLabel: 'system', to: TO, subject: r.subject, preheader: r.preheader, text: r.text, html: r.html, origin, sentBy: 'dev-trigger' });
  }));

  // ── Misc (invitation, reminder, OTP, drive) ───────────────────────────
  console.log('\nMisc:');
  results.push(await run('signing-invitation', () =>
    sendTrackedMail({
      policyKey: 'otp_verification', typeLabel: 'document_delivery',
      to: TO, subject: 'You have been invited to sign: Sample Agreement',
      preheader: 'Signature requested for Sample Agreement.',
      text: `Hi ${NAME},\n\nYou've been invited to sign "Sample Agreement".\nOpen: ${origin}/documents/mock-share-001\nPassword: DEMO99`,
      origin, sentBy: 'dev-trigger',
    })));
  results.push(await run('signing-reminder', () =>
    sendTrackedMail({
      policyKey: 'otp_verification', typeLabel: 'document_delivery',
      to: TO, subject: 'Reminder: Please sign Sample Agreement',
      preheader: 'Your signature is still pending on Sample Agreement.',
      text: `Hi ${NAME},\n\nReminder: your signature is pending on "Sample Agreement".\nOpen: ${origin}/documents/mock-share-001`,
      origin, sentBy: 'dev-trigger',
    })));
  results.push(await run('onboarding-otp', () =>
    sendTrackedMail({
      policyKey: 'otp_verification', typeLabel: 'system',
      to: TO, subject: '293847 — Your Docrud verification code',
      preheader: 'Your OTP is 293847. Valid for 10 minutes.',
      text: 'Your Docrud email verification code is: 293847\nValid for 10 minutes. Do not share.',
      origin, sentBy: 'system',
    })));
  results.push(await run('drive-file-share', () =>
    sendTrackedMail({
      policyKey: 'otp_verification', typeLabel: 'document_delivery',
      to: TO, subject: 'A file has been shared with you',
      preheader: 'sender@example.com shared "Project Brief.pdf" with you.',
      text: `Hi ${NAME},\n\nsender@example.com shared "Project Brief.pdf" with you on Docrud Drive.\nOpen: ${origin}/drive/shared/mock-file-001`,
      origin, sentBy: 'dev-trigger',
    })));

  const ok = results.filter((r) => r === 'ok').length;
  const fail = results.filter((r) => r === 'fail').length;
  const skip = results.filter((r) => r === 'skip').length;

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Total: ${results.length}  |  Sent: ${ok}  |  Failed: ${fail}  |  Skipped: ${skip}`);
  console.log(`Recipient: ${TO}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
